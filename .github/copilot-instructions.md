# DexHub Copilot Instructions

## Project Overview
DexHub is a **Local-Trusted Command Center** (v4.1.5) consisting of three interconnected nodes:
- **MacBook Air (Client):** Native Tauri app, persistence, key management, UI interaction
- **Big Mac (Server):** FastAPI sensory engine for STT/TTS, signature verification, device registry
- **Tablet Portal:** Optional web UI for touch-based access

**Core Philosophy:** Data sovereignty with encrypted transport and storage. Application-layer signing (Ed25519) + SQLCipher. No third-party SaaS for core logic.

## Architecture Essentials

### Node-to-Node Communication
- **Transport:** Tailscale WireGuard P2P (encrypted mesh)
- **Application Layer:** Ed25519 signatures on every request (even within VPN)
- **Request Format:** Raw URL literals (e.g., `http://big-mac.tailscale.svc:5000`)
- **Headers:** `X-DEX-DeviceId`, `X-DEX-Timestamp`, `X-DEX-Nonce`, `X-DEX-BodySha256`, `X-DEX-Signature`
- **Canonical String:** `METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256` → signed with Ed25519

### Device Identity & Pairing
1. Devices self-generate Ed25519 keypairs on first run (stored in OS Keychain)
2. DeviceID = SHA256(public_key_bytes)[0:12] (12-char hex prefix)
3. Pairing: 6-digit code from server + cryptographic proof-of-possession (`PAIR:<code>` signature)
4. Registry stored on Big Mac: `device_registry.json` (file, not DB) with public keys

### Persistence Strategy
- **Client DB:** SQLite + SQLCipher (key from Keychain: `dexhub_db_key`)
- **PRAGMA:** `PRAGMA key = "x'<64_hex_chars>'"` must execute before any other command
- **Server:** Stateless (only `device_registry.json` on disk, nonce cache in RAM)
- **No `.env` secrets in production:** Use macOS Keychain or encrypted config stores

## Stack Details

### Big Mac (Python/FastAPI)
**Key Files & Patterns:**
- `requirements.txt`: FastAPI, uvicorn, openai-whisper, pynacl (Ed25519), python-dotenv, keyring
- `dexhub_server.py`: Single FastAPI app with middleware for auth, rate limiting, nonce replay detection
- **Middleware Flow:** Skip `/pair/*` and `/admin/*` (local-only), verify sig on all others
- **Nonce Cache:** In-memory dict `{device_id: {nonce: expires_at_ms}}` with TTL cleanup
- **Rate Limiting:** Token bucket (5 burst/20 per min for STT, 10 burst/60 per min for TTS); localhost exempt
- **Endpoints:**
  - `POST /stt` (verify sig) → subprocess Whisper, return text
  - `POST /tts` (verify sig) → TTS_MODE == "local" (subprocess `say`) or "gemini" (API call with backoff)
  - `POST /pair/request` (localhost only) → generate 6-digit code, log to console
  - `POST /pair/confirm` → validate code, verify sig, register device
  - `POST /admin/devices/revoke` (localhost only) → disable device

**Secrets Handling:**
- Gemini API key: `keyring.get_password("dexhub", "gemini_api_key")`
- Never log audio bytes, transcribed text, or API keys

### MacBook Air (Rust/Tauri)
**Key Files & Patterns:**
- `src-tauri/Cargo.toml`: tauri 2.0, reqwest, ed25519-dalek, rusqlite (bundled-sqlcipher), rand_core, keyring
- `src-tauri/src/main.rs`:
  - `get_or_create_key()` → Keychain lookup ("dexhub", "dexhub_device_key"), generate if missing
  - `sign_request()` → canonical string + Ed25519 sign → return (timestamp, nonce, body_hash, signature, device_id)
  - `init_db()` → raw SQLCipher key validation (must be 64 hex chars, 32 bytes), execute PRAGMA, create tables
  - `#[tauri::command]` functions: `send_stt_request()`, `send_tts_request()`, `confirm_pairing()`, card CRUD
  - Tray icon: TrayIconBuilder with Left-Click toggle (hide/show), Tauri v2 API (no TrayIcon::click_type)
  - Accessory mode: `app.set_activation_policy(tauri::ActivationPolicy::Accessory)`
- **Table Schema:** `cards (id TEXT PK, title, content, status, priority, position, audio_blob, updated_at)`

**Key Patterns:**
- Use `general_purpose::STANDARD` for base64 encoding (not URL-safe)
- Use `hex::encode/decode` for key serialization
- All URLs as raw strings: `const BIG_MAC_HOST: &str = r#"http://big-mac.tailscale.svc:5000"#;`
- Binary audio sent as `Content-Type: application/octet-stream` (unsigned body), JSON as `application/json`

### React Frontend
**Key Patterns:**
- Dependencies: @tauri-apps/api, lucide-react, react, tailwindcss
- No plugin-sql; call Rust commands directly via `invoke()`
- Design Tokens: Background `#0f172a` (Slate 950), Border `1px solid rgba(255,255,255,0.1)`, Accent `#38bdf8` (Sky) + `#f97316` (Orange)
- Views: Omni-View (Kanban, Table, Calendar modes), DexTalker (TTS), DexDictate (STT)

## Critical Workflows

### Build & Run (Development)
```bash
# Server
cd server && uvicorn dexhub_server:app --reload

# Client (Tauri dev mode)
cd client && tauri dev
```

### Pairing Flow (Production)
1. Client: `POST /pair/request` → gets 6-digit code (printed on Big Mac console)
2. User enters code on client
3. Client: `confirm_pairing(code)` → sign "PAIR:<code>" → `POST /pair/confirm` with code + pubkey + sig
4. Server: Validate sig, derive DeviceID, save to `device_registry.json`, return device_id

### Secrets Setup (Production)
```bash
# Big Mac: store API keys
keyring set dexhub gemini_api_key "YOUR_KEY"
keyring set dexhub dexhub_db_key "hexstring_64chars"

# Install & load server
cp server/com.dexhub.server.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.dexhub.server.plist
```

## Non-Obvious Conventions

1. **DeviceID Derivation:** Not UUID, but `SHA256(pubkey_bytes).hex()[0:12]`. Ensures deterministic, collisionless IDs tied to identity.
2. **Header Signing vs Body:** Headers are signed; body is not (signature covers body hash, not raw body bytes).
3. **Nonce Format:** 16 random bytes → base64 (not hex). Must be unique per request + device (replay detection).
4. **SQLCipher PRAGMA Execution:** Happens inside Rust **before** any query. No SQL transaction wrappers.
5. **TTS Mode Toggle:** Controlled by `config/dexhub_config.json` (not environment variable). Cloud mode must show subtle UI indicator (cloud icon).
6. **Timestamp Window:** 60 seconds; requests older than that are rejected. Prevents rogue server from accepting stale requests.

## Common Implementation Tasks

### Adding a New Sensory Command (STT/TTS variant)
1. Add endpoint to `dexhub_server.py` (e.g., `POST /advanced-stt`)
2. Include `dependencies=[Depends(verify_signature)]` to enforce auth
3. Add corresponding Tauri command in `main.rs` (e.g., `send_advanced_stt_request()`)
4. Follow the same signing/header pattern as existing endpoints
5. Update rate limits in middleware if needed

### Extending the Card Schema
1. Modify `CREATE TABLE` in `main.rs` `init_db()` (add columns)
2. Add migration logic if needed (check `updated_at` schema version)
3. Add new Tauri commands for new fields (e.g., `#[tauri::command] update_card_tags()`)
4. Update React UI to reflect new fields

### Changing TTS Provider
1. Modify `TTS_MODE` load in `dexhub_server.py`
2. Add new conditional in `/tts` endpoint (e.g., `if TTS_MODE == "aws-polly"`)
3. Fetch API key from Keychain (not environment)
4. Implement retry/backoff logic (exponential: 1s, 2s, 4s)

## Testing & Validation

- No automated test framework specified (add pytest + FastAPI TestClient if implementing server tests)
- **Pairing validation:** Confirm 6-digit code appears on Big Mac stdout, client receives device_id
- **Signature verification:** Use `nacl.signing.VerifyKey.verify()` on server side; confirm replay detection blocks duplicates
- **Database encryption:** Confirm key mismatch prevents DB access; key from Keychain is always 64 hex chars

## References & Key Files

- **Spec:** [Documents/DexHub_bible.md](../Documents/DexHub_bible.md) (v4.1.5 canonical)
- **Server:** `server/dexhub_server.py` (FastAPI app with complete example)
- **Client:** `client/src-tauri/src/main.rs` (Tauri + SQLCipher + signing logic)
- **Config:** `config/dexhub_config.json` (TTS mode, MagicDNS hostnames)
- **Pairing DB:** `server/device_registry.json` (device_id → public_key registry)

