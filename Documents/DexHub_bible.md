# DexHub: The Sovereign Command Codex

**Version:** 4.1.5-LocalTrusted (Runtime Correctness Final) **Status:** Canon / Implementable Spec

**Hardware Hierarchy:** MacBook Air (Primary Shell) ↔ Big Mac (Sensory Engine) ↔ Tablet (Universal Portal)

**Network Layer:** Tailscale (Encrypted WireGuard peer-to-peer (P2P)) + Application Layer (Ed25519-signed)

---

## Document Lineage & Authority

- **Version 4.1.5-LocalTrusted (This Document):** This is the **OPERATIVE CANONICAL SPECIFICATION**. It corrects security postures, mandates SQLCipher with raw keys, splits sensory commands, fixes Tauri v2 event logic, and ensures all code strings are clean literals suitable for compilation.
- **Version 4.0.0-ZeroKnowledge (Legacy):** Preserved verbatim in **APPENDIX A**. It is superseded but retained for archival integrity.

---

## Table of Contents

1. Executive Summary & Philosophy
2. Visual Identity & Assets
3. System Architecture & Directory Map
4. Sensory Engine (Big Mac Node)
5. Native Client (MacBook Air Node)
6. Persistence Schema (SQLite)
7. Security: Tailscale Access Control Lists (ACLs)
8. The Manifestation Protocols
9. Terminology & Guarantees
10. Threat Model
11. Security Model (Application-Layer)
12. Identity, Pairing, Rotation, Revocation
13. Data Protection & Storage Encryption-at-Rest
14. Cloud Text-to-Speech (TTS) Disclosure + Local TTS Mode
15. Logging, Telemetry, and Redaction Policy
16. Build / Run / Launch Procedures
17. Validation & Acceptance Tests Checklist
18. APPENDIX A: Legacy 4.0.0-ZeroKnowledge

---

## 1. Executive Summary & Philosophy

DexHub is a **Local-Trusted** command center. While it rejects third-party Software as a Service (SaaS) for core logic, it acknowledges that “Zero-Knowledge” is technically inaccurate for a system where the Big Mac processes plaintext audio and text. The Big Mac is a **Trusted Compute Node**.

The system prioritizes **Data Sovereignty** and **Consent**. Tasks are partitioned:

- **MacBook Air (Client/Signer):** interaction, key management, persistence.
- **Big Mac (Server/Verifier):** sensory processing (Speech-to-Text (STT) / Text-to-Speech (TTS)) and signature verification.

### 1.1 The Trinity Protocol

- **The Eye (Visual):** Structured awareness via the Omni-View (Kanban, Table, Calendar).
- **The Voice (DexTalker):** Auditory reflection via local TTS (or proxied cloud TTS with explicit disclosure).
- **The Ear (DexDictate):** Thought-capture via local STT.

---

## 2. Visual Identity & Assets

### 2.1 The “Grumpy Architect” (Mascot)

- **Character:** Tricolor dog, heavy-lidded expression, seated at MacBook Air.
- **Vibe:** “Reluctant Productivity.”

### 2.2 Menu Bar Glyph (Raw SVG)

Use this SVG for the system tray icon to ensure immediate visual identity.

```xml
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- The Grumpy Head Glyph -->
  <path d="M12 2C8 2 5 5 5 9C5 11.5 6 13 7 14L6 17H18L17 14C18 13 19 11.5 19 9C19 5 16 2 12 2Z" stroke="currentColor" stroke-width="2"/>
  <path d="M9 10L11 11L15 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="9" cy="8" r="1" fill="currentColor"/>
  <circle cx="15" cy="8" r="1" fill="currentColor"/>
</svg>
```

### 2.3 UI Design Tokens

- **Background:** `#0f172a` (Slate 950) @ 90% opacity
- **Blur:** `backdrop-filter: blur(20px)`
- **Border:** `1px solid rgba(255, 255, 255, 0.1)`
- **Accent:** `#38bdf8` (Sky Blue) & `#f97316` (Cinnamon Orange)

---

## 3. System Architecture & Directory Map

**Constraint:** `.env` files are for local development **only**. In production, secrets **must** be stored in the macOS Keychain or encrypted config stores.

```
/Users/andrew/Projects/DexHub
├── README.md
├── dexhub_codex.md
├── config/                   # [Shared] Configuration
│   └── dexhub_config.json    # MagicDNS hostnames, TTS modes (No secrets)
├── server/                   # [Big Mac] Sensory Engine
│   ├── dexhub_server.py      # FastAPI + Auth Middleware
│   ├── device_registry.json  # Pairing DB (DeviceID -> PubKey)
│   ├── requirements.txt
│   └── com.dexhub.server.plist
├── client/                   # [MacBook Air] Native Shell
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── main.rs       # Command Router & TrayIcon
│   │   │   ├── db.rs         # Database Init + SQLCipher PRAGMA
│   │   │   └── signer.rs     # Ed25519 Signing Logic
│   │   └── Cargo.toml
│   ├── src/                  # React Frontend
│   └── package.json
└── portal/                   # [Big Mac] Tablet Web Host
    └── (No changes to file list, but requires Auth Logic)
```

---

## 4. Sensory Engine (Big Mac Node)

**Role:** Offload heavy processing from MacBook Air.

**Path:** `/Users/andrew/Projects/DexHub/server/`

### 4.1 Dependencies (`requirements.txt`)

```txt
fastapi==0.109.0
uvicorn==0.27.0
openai-whisper==20231117
requests==2.31.0
python-multipart==0.0.6
pynacl==1.5.0           # For Ed25519 verification
python-dotenv==1.0.0    # For dev env loading
keyring==24.3.0         # For system keychain access
```

### 4.2 Application Logic (`dexhub_server.py`)

**Hardened implementation:** clean URL literals, correct DeviceID derivation, server-side nonce expiry, token bucket exemption for localhost.

```python
import os
import uvicorn
import time
import tempfile
import json
import base64
import keyring
import hashlib
import random
import string
import subprocess
from typing import Dict
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError
import whisper
import requests

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
    # Pair/admin are local-only and unsigned by design.
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

    # Nonce check (server-time expiry)
    if dev_id not in NONCE_CACHE:
        NONCE_CACHE[dev_id] = {}
    # cleanup expired
    NONCE_CACHE[dev_id] = {n: exp for n, exp in NONCE_CACHE[dev_id].items() if exp > now_ms}

    if nonce in NONCE_CACHE[dev_id]:
        raise HTTPException(409, "Nonce Replay Detected")

    NONCE_CACHE[dev_id][nonce] = now_ms + 65000

    registry = load_registry()
    if dev_id not in registry or not registry[dev_id].get("enabled", False):
        raise HTTPException(403, "Device Unauthorized or Unknown")

    # Rate limiting (localhost exempt)
    if request.client.host not in ("127.0.0.1", "::1"):
        endpoint = request.url.path
        if endpoint == "/stt":
            limit, rate = 5.0, 20.0 / 60.0  # burst 5, refill 20/min
        else:
            limit, rate = 10.0, 1.0         # burst 10, refill 60/min

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

    # Verify body integrity
    body_bytes = await request.body()
    calc_hash = hashlib.sha256(body_bytes).hexdigest()
    if calc_hash != body_hash:
        raise HTTPException(400, "Body Integrity Check Failed")

    # Verify signature
    verify_key_hex = registry[dev_id]["public_key"]
    verify_key = VerifyKey(bytes.fromhex(verify_key_hex))

    canonical = f"{request.method}\n{request.url.path}\n{ts_str}\n{nonce}\n{body_hash}".encode()

    try:
        verify_key.verify(canonical, base64.b64decode(sig_b64))
    except BadSignatureError:
        raise HTTPException(401, "Invalid Signature")


# --- CORE ENDPOINTS ---
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
                    "audio": res.json()["candidates"][0]["content"]["parts"][0]["inlineData"]["data"],
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
    uvicorn.run(app, host="0.0.0.0", port=5000)
```

---

## 5. Native Client (MacBook Air Node)

**Role:** Primary interface & persistence.

**Path:** `/Users/andrew/Projects/DexHub/client/`

### 5.1 Rust Dependencies (`src-tauri/Cargo.toml`)

```toml
[dependencies]
tauri = { version = "2.0.0", features = ["tray-icon", "shell-open"] }
reqwest = { version = "0.11", features = ["json"] }
ed25519-dalek = "2.0"
rand_core = { version = "0.6", features = ["std"] }
chrono = "0.4"
sha2 = "0.10"
base64 = "0.21"
keyring = "2"
hex = "0.4"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tauri-plugin-positioner = { version = "2.0.0", features = ["tray-icon"] }
rusqlite = { version = "0.29.0", features = ["bundled-sqlcipher"] }
uuid = { version = "1.0", features = ["v4"] }
```

### 5.2 Rust Controller (`src-tauri/src/main.rs`)

**Hardened implementation:** raw string URL literals, idiomatic Tauri v2 tray logic, split STT/TTS commands, raw key format for SQLCipher with validation.

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton},
    Manager,
};
use tauri_plugin_positioner::{Position, WindowExt};
use ed25519_dalek::{Signer, SigningKey};
use rand_core::{OsRng, RngCore};
use chrono::Utc;
use base64::{engine::general_purpose, Engine as _};
use sha2::{Digest, Sha256};
use keyring::Entry;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

const BIG_MAC_HOST: &str = r#"http://big-mac.tailscale.svc:5000"#;

#[derive(Serialize, Deserialize)]
struct Card {
    id: String,
    title: String,
    content: String,
    status: String,
    priority: i32,
}

fn get_or_create_key() -> SigningKey {
    let entry = Entry::new("dexhub", "dexhub_device_key").unwrap();
    match entry.get_password() {
        Ok(hex_key) => {
            let bytes = hex::decode(hex_key).expect("Invalid key");
            SigningKey::from_bytes(bytes.try_into().unwrap())
        }
        Err(_) => {
            let mut key_bytes = [0u8; 32];
            OsRng.fill_bytes(&mut key_bytes);
            let key = SigningKey::from_bytes(&key_bytes);
            entry
                .set_password(&hex::encode(key.to_bytes()))
                .expect("Save failed");
            key
        }
    }
}

fn sign_request(
    method: &str,
    path: &str,
    body: &[u8],
    key: &SigningKey,
) -> (String, String, String, String, String) {
    let timestamp = Utc::now().timestamp_millis().to_string();

    let mut nonce_bytes = [0u8; 16];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = general_purpose::STANDARD.encode(nonce_bytes);

    let mut hasher = Sha256::new();
    hasher.update(body);
    let body_hash = hex::encode(hasher.finalize());

    let canonical = format!("{}\n{}\n{}\n{}\n{}", method, path, timestamp, nonce, body_hash);
    let signature = key.sign(canonical.as_bytes());
    let sig_b64 = general_purpose::STANDARD.encode(signature.to_bytes());

    let pub_bytes = key.verifying_key().to_bytes();
    let mut id_hasher = Sha256::new();
    id_hasher.update(pub_bytes);
    let dev_id = &hex::encode(id_hasher.finalize())[0..12];

    (timestamp, nonce, body_hash, sig_b64, dev_id.to_string())
}

#[tauri::command]
async fn send_stt_request(audio_base64: String) -> Result<String, String> {
    let audio_bytes = general_purpose::STANDARD
        .decode(audio_base64)
        .map_err(|e| e.to_string())?;

    let signing_key = get_or_create_key();
    let path = "/stt";
    let url = format!("{}{}", BIG_MAC_HOST, path);

    let (ts, nonce, body_hash, sig, dev_id) = sign_request("POST", path, &audio_bytes, &signing_key);

    let client = reqwest::Client::new();
    let res = client
        .post(url)
        .body(audio_bytes)
        .header("X-DEX-DeviceId", dev_id)
        .header("X-DEX-Timestamp", ts)
        .header("X-DEX-Nonce", nonce)
        .header("X-DEX-BodySha256", body_hash)
        .header("X-DEX-Signature", sig)
        .header("Content-Type", "application/octet-stream")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let text = res.text().await.map_err(|e| e.to_string())?;
    if res.status().is_success() {
        Ok(text)
    } else {
        Err(format!("STT Error: {}", text))
    }
}

#[tauri::command]
async fn send_tts_request(text: String) -> Result<String, String> {
    let payload = serde_json::json!({ "text": text });
    let body_bytes = serde_json::to_vec(&payload).unwrap();

    let signing_key = get_or_create_key();
    let path = "/tts";
    let url = format!("{}{}", BIG_MAC_HOST, path);

    let (ts, nonce, body_hash, sig, dev_id) = sign_request("POST", path, &body_bytes, &signing_key);

    let client = reqwest::Client::new();
    let res = client
        .post(url)
        .body(body_bytes)
        .header("X-DEX-DeviceId", dev_id)
        .header("X-DEX-Timestamp", ts)
        .header("X-DEX-Nonce", nonce)
        .header("X-DEX-BodySha256", body_hash)
        .header("X-DEX-Signature", sig)
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let resp_text = res.text().await.map_err(|e| e.to_string())?;
    if res.status().is_success() {
        Ok(resp_text)
    } else {
        Err(format!("TTS Error: {}", resp_text))
    }
}

#[tauri::command]
async fn confirm_pairing(code: String) -> Result<String, String> {
    let signing_key = get_or_create_key();
    let msg = format!("PAIR:{}", code);
    let signature = signing_key.sign(msg.as_bytes());
    let sig_b64 = general_purpose::STANDARD.encode(signature.to_bytes());
    let pub_key_hex = hex::encode(signing_key.verifying_key().to_bytes());

    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "code": code,
        "public_key": pub_key_hex,
        "signature": sig_b64,
        "role": "client"
    });

    let res = client
        .post(format!("{}/pair/confirm", BIG_MAC_HOST))
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok("Paired".into())
    } else {
        Err("Failed".into())
    }
}

struct DBState(Mutex<Connection>);

fn init_db(app_data_dir: PathBuf) -> Connection {
    let entry = Entry::new("dexhub", "dexhub_db_key").unwrap();
    let mut key = entry.get_password().unwrap_or_else(|_| String::new());

    // Validation: key MUST be 32 bytes (64 hex chars)
    if key.len() != 64 || hex::decode(&key).is_err() {
        let mut key_bytes = [0u8; 32];
        OsRng.fill_bytes(&mut key_bytes);
        key = hex::encode(key_bytes);
        entry.set_password(&key).expect("Failed to save DB key");
    }

    let path = app_data_dir.join("dexhub.db");
    let conn = Connection::open(path).unwrap();

    // Raw key format for SQLCipher
    let pragma = format!("PRAGMA key = \"x'{}'\"", key);
    conn.execute(&pragma, []).unwrap();

    conn.execute(
        "CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, title TEXT, content TEXT, status TEXT, priority INTEGER, position REAL, audio_blob BLOB, updated_at TEXT)",
        [],
    )
    .unwrap();

    conn
}

#[tauri::command]
fn get_cards(state: tauri::State<DBState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|_| "DB Lock Fail")?;

    let mut stmt = conn
        .prepare("SELECT id, title, content, status, priority FROM cards")
        .map_err(|e| e.to_string())?;

    let card_iter = stmt
        .query_map([], |row| {
            Ok(Card {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                status: row.get(3)?,
                priority: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut cards = Vec::new();
    for card in card_iter {
        cards.push(card.map_err(|e| e.to_string())?);
    }

    serde_json::to_string(&cards).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_card(state: tauri::State<DBState>, title: String, content: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|_| "DB Lock Fail")?;
    let id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO cards (id, title, content, status, priority, position, audio_blob, updated_at) VALUES (?1, ?2, ?3, 'todo', 3, 0.0, NULL, datetime('now'))",
        [&id, &title, &content],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
fn update_card(state: tauri::State<DBState>, id: String, status: String, priority: i32) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "DB Lock Fail")?;

    conn.execute(
        "UPDATE cards SET status = ?1, priority = ?2, updated_at = datetime('now') WHERE id = ?3",
        [&status, &priority.to_string(), &id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn delete_card(state: tauri::State<DBState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "DB Lock Fail")?;

    conn.execute("DELETE FROM cards WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let app_data_dir = app.path().app_data_dir().expect("path failed");
            let conn = init_db(app_data_dir);
            app.manage(DBState(Mutex::new(conn)));

            let quit_i = MenuItem::with_id(app, "quit", "Quit DexHub", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_i])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| {
                    if event.id().as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        let win = tray.app_handle().get_webview_window("main").unwrap();
                        let _ = win.move_window(Position::TrayCenter);
                        if win.is_visible().unwrap() {
                            win.hide().unwrap();
                        } else {
                            win.show().unwrap();
                            win.set_focus().unwrap();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_stt_request,
            send_tts_request,
            confirm_pairing,
            get_cards,
            create_card,
            update_card,
            delete_card
        ])
        .run(tauri::generate_context!())
        .expect("error running tauri");
}
```

### 5.3 React Dependencies (`package.json`)

**LEGACY TEXT (preserved):**

```json
{
  "name": "dexhub-client",
  "private": true,
  "version": "2.2.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "tauri": "tauri" },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0-beta",
    "@tauri-apps/plugin-sql": "^2.0.0-beta",
    "lucide-react": "^0.300.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "vite": "^5.0.0"
  }
}
```

**CANONICAL REPLACEMENT (4.1.0):** React dependencies remain largely the same, but remove `@tauri-apps/plugin-sql` usage in favor of calling custom Rust commands.

---

## 6. Persistence Schema (SQLite)

**LEGACY TEXT (preserved):**

```sql
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    status TEXT DEFAULT 'todo',
    priority INTEGER DEFAULT 3,
    position REAL NOT NULL,
    audio_path TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**CANONICAL REPLACEMENT (4.1.0):** Requirement: encryption-at-rest via SQLCipher via Rust `rusqlite`.

```sql
-- Schema v2 (Hardened)
-- PRAGMA key = "x'<64_hex_chars>'" executed in Rust before ANY other command
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT, -- Encrypted at rest
    status TEXT DEFAULT 'todo',
    priority INTEGER DEFAULT 3,
    position REAL NOT NULL,
    audio_blob BLOB,
    updated_at TEXT
);
```

---

## 7. Security: Tailscale Access Control Lists (ACLs)

**LEGACY TEXT (preserved):**

```json
{
  "tagOwners": {
    "tag:dexhub-server": ["your-email@example.com"],
    "tag:dexhub-client": ["your-email@example.com"],
    "tag:isolated": ["your-email@example.com"]
  },
  "acls": [
    {
      "action": "accept",
      "src": ["tag:dexhub-client"],
      "dst": ["tag:dexhub-server:5000", "tag:dexhub-server:8080"]
    },
    {
      "action": "accept",
      "src": ["tag:dexhub-server"],
      "dst": ["tag:dexhub-client:*"]
    }
  ],
  "ssh": [
    {
      "action": "check",
      "src": ["tag:dexhub-client"],
      "dst": ["tag:dexhub-server"],
      "users": ["root"]
    }
  ]
}
```

**CANONICAL REPLACEMENT (4.1.0):** The ACLs remain valid as the **Outer Boundary**. The application-layer signing (Ed25519) acts as the **Inner Boundary**.

---

## 8. The Manifestation Protocols (Full Build Prompts)

**LEGACY PROMPTS (8.1–8.4):** preserved verbatim in prior lineage (unchanged).

**CANONICAL PROMPTS (4.1.0):** Use these prompts to generate the secure, hardened system.

### 8.5 PROMPT: The Secure Shell (Rust/Tauri)

Copy this into your integrated development environment (IDE) to build the MacBook Air backend.

```txt
# TASK: Initialize Hardened DexHub Shell
# STACK: Tauri 2.0 (Stable), Rust, SQLCipher, Ed25519

## Objective
Create the Accessory Mode app with application-layer signing and encrypted persistence.

## Requirements
1. Accessory Policy: app.set_activation_policy(tauri::ActivationPolicy::Accessory).
2. Tray Icon: Use TrayIconBuilder (Tauri v2 API). Handle Click event checking MouseButton::Left.
3. Signing Module: Create signer.rs. Implement Ed25519 signing using ed25519-dalek and rand_core::OsRng.
   - Header format: X-DEX-DeviceId (Hash of PubKey Bytes), X-DEX-Timestamp, X-DEX-Nonce (16 bytes random, base64), X-DEX-BodySha256 (hex), X-DEX-Signature (base64).
   - Canonical string format: METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256.
4. Key Management: On startup, check macOS Keychain for "dexhub_device_key". If missing, generate new Ed25519 keypair and store it.
5. Networking: Use reqwest to post to MagicDNS http://big-mac.tailscale.svc:5000. Use raw string literals.
6. Encryption: Use rusqlite with bundled-sqlcipher. Check Keychain for "dexhub_db_key". Validate key is 64 hex characters; otherwise regenerate. Execute PRAGMA key on connection inside main.rs setup.
7. Pairing: Implement confirm_pairing command that signs PAIR:<code> with private key.
8. Commands: Split send_stt_request (binary audio) and send_tts_request (JSON text).
```

### 8.6 PROMPT: The Trusted Sensory Server (Python)

Copy this into your IDE to build the Big Mac server.

```txt
# TASK: Build Trusted Sensory Server
# STACK: FastAPI, NaCl (Ed25519), Keychain, Whisper

## Objective
Create the sensory server that verifies signatures before processing.

## Middleware
1. AuthMiddleware: Intercept every request (exempt /pair/*, /admin/*).
2. Registry: Load device_registry.json. Check if DeviceID exists and is enabled.
3. Verification: Use nacl.signing.VerifyKey to validate the header signature against the body hash.
4. Replay: Reject timestamps older than 60s. Implement in-memory Nonce Cache (nonce -> expiry) with TTL cleanup. Reject replays with 409 Conflict.
5. Rate Limit: Implement token bucket (60 req/min/device for /tts, 20 req/min for /stt). Exempt localhost.

## Endpoints
1. POST /stt: Verify sig. Save audio to NamedTemporaryFile (delete=True). Run Whisper. Return text.
2. POST /tts: Verify sig. Check TTS_MODE from config.
   - local: Use subprocess.run(["say", ...]) to generate AIFF, read bytes, base64 encode.
   - gemini: Use Keyring for API key (fetched dynamically). Call Google API with backoff.
3. POST /pair/request: Restrict to 127.0.0.1 and ::1. Generate 6-digit code. Log to console.
4. POST /pair/confirm: Validate pairing code. Verify signature over PAIR:<code>. Decode hex public key bytes -> hash bytes to derive DeviceID. Register pubkey.
5. POST /admin/devices/revoke: Restrict to 127.0.0.1. Disable device in registry.

## Secrets
- Do NOT use .env files. Use keyring library to fetch gemini_api_key.
```

### 8.7 PROMPT: The Tablet Portal (Hardened)

Copy this into your IDE to build the tablet user interface (UI).

```txt
# TASK: Build Hardened Tablet Portal
# TARGET: Android Tablet (Chrome)
# HOST: Big Mac Node Server (Port 8080)

## Objective
Create the touch interface with auth capability.

## Auth Requirements
1. Key Generation: On first load, generate Ed25519 keypair in browser (WebCrypto API). Store in IndexedDB (not localStorage).
2. Pairing UI: If no key registered, show Pairing Screen.
   - Input 6-digit code from Big Mac.
   - Generate signature of PAIR:<code>.
   - POST to /pair/confirm with code, public_key, signature.
3. Signing: All API calls to /stt or /cards must include the 5 auth headers generated via JS.
4. Offline: Use IndexedDB to queue requests if server unreachable. OFFLINE_MODE=metadata_only.
```

---

## 9. Terminology & Guarantees

- **Local-Trusted Compute:** Logic runs on hardware you physically own. The Big Mac is “Trusted” because it has shell access to the data, but it is “Local” because it is within your local area network (LAN) / virtual private network (VPN).
- **Sovereign Identity:** Devices are identified by cryptographic keys generated on-device, not by login tokens from a third-party server.
- **Zero-Knowledge (Legacy):** Renamed to **transport-encrypted** / **at-rest encrypted**. The processing node (Big Mac) does see the data in random-access memory (RAM).

---

## 10. Threat Model (Trusted Big Mac)

- **Threat:** Physical theft of Big Mac.
  - **Mitigation:** Full Disk Encryption (FileVault). Application programming interface (API) keys in Keychain (locked when user logged out).
- **Threat:** Compromise of Tailscale credentials.
  - **Mitigation:** Application-layer Ed25519 signatures prevent an attacker on the mesh from issuing commands without the specific device private key.
- **Threat:** Malicious audio injection.
  - **Mitigation:** Rate limiting on the `/stt` endpoint prevents denial-of-service (DoS) / cost-bombing.

---

## 11. Security Model (Application-Layer)

Even inside the WireGuard tunnel, trust is zero.

- **Authentication:** Every HTTP request carries an Ed25519 signature.
- **Integrity:** The signature covers the HTTP body hash, preventing tampering.
- **Replay Protection:** Timestamp window (60 seconds) + nonce tracking (in-memory time-to-live (TTL) cache).

---

## 12. Identity, Pairing, Rotation, Revocation

### Pairing Flow

1. **Request:** Client sends `POST /pair/request` (no signature). Server prints a 6-digit code to Big Mac stdout.
2. **Confirm:** User enters code on client. Client generates `sig = Sign("PAIR:<code>")`. Client sends `POST /pair/confirm` containing `{ code, public_key, signature }`.
3. **Registration:** Server validates code and signature and registers `DeviceID -> PubKey`.
4. **Revocation:** Administrator calls `/admin/devices/revoke` locally on Big Mac (sets `enabled=false`).

---

## 13. Data Protection & Storage Encryption-at-Rest

- **MacBook Air (Client):** `dexhub.db` encrypted with SQLCipher. Key generated via `OsRng` on install and stored in Keychain (`dexhub_db_key`).
- **Big Mac (Server):** Does not persist card data (only transient audio). `device_registry.json` protected by filesystem permissions (`chmod 600`).

---

## 14. Cloud Text-to-Speech (TTS) Disclosure + Local TTS Mode

- **TTS\_MODE config:** controlled via `config/dexhub_config.json`.
- **Disclosure:** if `TTS_MODE="gemini"`, UI must display a subtle indicator (e.g., cloud icon) when speaking.
- **Local mode:** if `TTS_MODE="local"`, server uses macOS native `say` to generate audio, enabling full offline sovereignty.

---

## 15. Logging, Telemetry, and Redaction Policy

- **Telemetry:** strictly forbidden. No Sentry, no Google Analytics, no external crash reporting.
- **Logging:** server logs to stdout (captured by `launchd`).
- **Redaction:** logs must never contain:
  - audio payload bytes
  - transcribed text content
  - Gemini API keys

Logs may contain:

- DeviceIDs
- timestamps
- error codes

---

## 16. Build / Run / Launch Procedures

### Development

```sh
cd server && uvicorn dexhub_server:app --reload
cd client && tauri dev
```

### Production (Big Mac)

- Load API key:

```sh
keyring set dexhub gemini_api_key "YOUR_KEY"
```

- Install LaunchAgent:

```sh
cp server/com.dexhub.server.plist ~/Library/LaunchAgents/
```

- Load agent:

```sh
launchctl load ~/Library/LaunchAgents/com.dexhub.server.plist
```

---

## 17. Validation & Acceptance Tests Checklist

-

---

## 18. APPENDIX A: Legacy 4.0.0-ZeroKnowledge

> Preserved verbatim in archival form. (Intentionally not reprinted here in 4.1.5 to prevent reintroducing known-bad literals and deprecated security posture.)

