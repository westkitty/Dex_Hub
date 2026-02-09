import base64
import hashlib
import json
import os
import random
import string
import subprocess
import tempfile
import time
from typing import Dict

import keyring
import requests
import whisper
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

# --- CONFIG ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "../config/dexhub_config.json")


def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {"tts_mode": "local"}


config = load_config()
TTS_MODE = config.get("tts_mode", "local")

app = FastAPI(title="DexHub Big Mac Sensory Engine (Trusted Node)")

# --- CORS ---
ALLOWED_ORIGINS = [
    "http://localhost:1420",
    "tauri://localhost",
    "https://dexhub.tailscale.ts.net",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=[
        "X-DEX-DeviceId",
        "X-DEX-Timestamp",
        "X-DEX-Nonce",
        "X-DEX-BodySha256",
        "X-DEX-Signature",
        "Content-Type",
    ],
)

# --- STATE ---
REGISTRY_FILE = os.path.join(BASE_DIR, "device_registry.json")
PENDING_PAIRINGS = {}  # code -> timestamp_seconds
NONCE_CACHE: Dict[str, Dict[str, float]] = {}  # device_id -> {nonce: expires_at_ms}
RATE_LIMITS: Dict[str, Dict[str, Dict[str, float]]] = {}  # device_id -> endpoint -> bucket


def load_registry():
    if not os.path.exists(REGISTRY_FILE):
        return {}
    with open(REGISTRY_FILE, "r") as f:
        return json.load(f)


def save_registry(data):
    with open(REGISTRY_FILE, "w") as f:
        json.dump(data, f, indent=2)
    os.chmod(REGISTRY_FILE, 0o600)


# --- MIDDLEWARE & SECURITY ---
async def verify_signature(request: Request):
    if request.url.path.startswith("/pair") or request.url.path.startswith("/admin"):
        return

    dev_id = request.headers.get("X-DEX-DeviceId")
    ts_str = request.headers.get("X-DEX-Timestamp")
    nonce = request.headers.get("X-DEX-Nonce")
    body_hash = request.headers.get("X-DEX-BodySha256")
    sig_b64 = request.headers.get("X-DEX-Signature")

    if not all([dev_id, ts_str, nonce, body_hash, sig_b64]):
        raise HTTPException(401, "Missing Auth Headers")

    now_ms = time.time() * 1000
    try:
        req_ts = float(ts_str)
    except ValueError:
        raise HTTPException(401, "Invalid Timestamp")

    if abs(now_ms - req_ts) > 60000:
        raise HTTPException(401, "Request Expired")

    if dev_id not in NONCE_CACHE:
        NONCE_CACHE[dev_id] = {}

    NONCE_CACHE[dev_id] = {
        n: exp for n, exp in NONCE_CACHE[dev_id].items() if exp > now_ms
    }

    if nonce in NONCE_CACHE[dev_id]:
        raise HTTPException(409, "Nonce Replay Detected")

    NONCE_CACHE[dev_id][nonce] = now_ms + 65000

    registry = load_registry()
    if dev_id not in registry or not registry[dev_id].get("enabled", False):
        raise HTTPException(403, "Device Unauthorized or Unknown")

    if request.client.host not in ("127.0.0.1", "::1"):
        endpoint = request.url.path
        if endpoint == "/stt":
            limit, rate = 5.0, 20.0 / 60.0
        else:
            limit, rate = 10.0, 60.0 / 60.0

        if dev_id not in RATE_LIMITS:
            RATE_LIMITS[dev_id] = {}
        if endpoint not in RATE_LIMITS[dev_id]:
            RATE_LIMITS[dev_id][endpoint] = {"tokens": limit, "last_refill": now_ms}

        bucket = RATE_LIMITS[dev_id][endpoint]
        delta_s = (now_ms - bucket["last_refill"]) / 1000.0
        bucket["tokens"] = min(limit, bucket["tokens"] + delta_s * rate)
        bucket["last_refill"] = now_ms

        if bucket["tokens"] < 1:
            raise HTTPException(429, "Rate Limit Exceeded")
        bucket["tokens"] -= 1

    body_bytes = await request.body()
    calc_hash = hashlib.sha256(body_bytes).hexdigest()
    if calc_hash != body_hash:
        raise HTTPException(400, "Body Integrity Check Failed")

    verify_key_hex = registry[dev_id]["public_key"]
    verify_key = VerifyKey(bytes.fromhex(verify_key_hex))

    canonical = f"{request.method}\n{request.url.path}\n{ts_str}\n{nonce}\n{body_hash}".encode()

    try:
        verify_key.verify(canonical, base64.b64decode(sig_b64))
    except BadSignatureError:
        raise HTTPException(401, "Invalid Signature")


print("Initializing Whisper...")
stt_model = whisper.load_model("small")


@app.post("/stt", dependencies=[Depends(verify_signature)])
async def speech_to_text(request: Request):
    try:
        audio_data = await request.body()
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp:
            tmp.write(audio_data)
            tmp.flush()
            result = stt_model.transcribe(tmp.name)
        return {"text": result["text"].strip()}
    except Exception as e:
        print(f"STT Error: {str(e)}")
        raise HTTPException(500, "STT Processing Failed")


@app.post("/tts", dependencies=[Depends(verify_signature)])
async def text_to_speech(payload: dict):
    text = payload.get("text")
    if not text:
        raise HTTPException(400, "No text provided")

    if TTS_MODE == "local":
        try:
            with tempfile.NamedTemporaryFile(suffix=".aiff", delete=True) as tmp:
                subprocess.run(["say", "-o", tmp.name, text], check=True)
                tmp.seek(0)
                audio_bytes = tmp.read()
                return {
                    "audio": base64.b64encode(audio_bytes).decode("utf-8"),
                    "format": "aiff",
                }
        except Exception as e:
            print(f"Local TTS Error: {e}")
            raise HTTPException(500, "Local TTS Failed")

    if TTS_MODE == "gemini":
        gemini_key = keyring.get_password("dexhub", "gemini_api_key")
        if not gemini_key:
            raise HTTPException(500, "Gemini Key Not Found")

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-2.5-flash-preview-tts:generateContent?key={gemini_key}"
        )

        data = {
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": "Puck"}}
                },
            },
        }

        for delay in [1, 2, 4]:
            res = requests.post(url, json=data)
            if res.status_code == 200:
                return {
                    "audio": res.json()["candidates"][0]["content"]["parts"][0][
                        "inlineData"
                    ]["data"],
                    "format": "pcm",
                }
            time.sleep(delay)

        raise HTTPException(500, "Cloud TTS Failed")

    raise HTTPException(500, "Invalid TTS_MODE")


@app.post("/pair/request")
async def pair_request(request: Request):
    if request.client.host not in ("127.0.0.1", "::1"):
        raise HTTPException(403, "Pairing initiation must be local")
    code = "".join(random.choices(string.digits, k=6))
    print(f"*** PAIRING CODE: {code} ***")
    PENDING_PAIRINGS[code] = time.time()
    return {"status": "Code generated"}


@app.post("/pair/confirm")
async def pair_confirm(payload: dict):
    code = payload.get("code")
    pub_key = payload.get("public_key")
    signature = payload.get("signature")
    role = payload.get("role", "client")

    if code not in PENDING_PAIRINGS:
        raise HTTPException(403, "Invalid Code")
    if time.time() - PENDING_PAIRINGS[code] > 300:
        del PENDING_PAIRINGS[code]
        raise HTTPException(403, "Code Expired")

    try:
        pub_bytes = bytes.fromhex(pub_key)
        verify_key = VerifyKey(pub_bytes)
        verify_key.verify(f"PAIR:{code}".encode(), base64.b64decode(signature))
    except (ValueError, BadSignatureError):
        raise HTTPException(401, "Proof of Possession Failed")

    dev_id = hashlib.sha256(pub_bytes).hexdigest()[:12]

    registry = load_registry()
    registry[dev_id] = {
        "public_key": pub_key,
        "role": role,
        "enabled": True,
        "created_at": time.time(),
    }
    save_registry(registry)
    del PENDING_PAIRINGS[code]
    return {"device_id": dev_id, "status": "Paired"}


@app.post("/admin/devices/revoke")
async def revoke_device(request: Request, payload: dict):
    if request.client.host not in ("127.0.0.1", "::1"):
        raise HTTPException(403, "Admin actions must be local")
    dev_id = payload.get("device_id")
    registry = load_registry()
    if dev_id in registry:
        registry[dev_id]["enabled"] = False
        save_registry(registry)
        return {"status": "Revoked"}
    return {"status": "Not Found"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5000)
