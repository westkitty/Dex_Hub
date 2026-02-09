# DexHub AI Handoff Prompt

You are taking over the DexHub workspace at /Users/username/Projects/DexHub. Below is a concise record of what was implemented and updated.

## Summary of Completed Work

### 1) Repo path normalization in spec
- Updated the DexHub spec file at [Documents/DexHub_bible.md](Documents/DexHub_bible.md) to use the canonical repo root path.
- Replaced all occurrences of `/Users/username/Projects/Anti_grav/DexHub` with `/Users/username/Projects/DexHub`.
- Verified no remaining references to the old path or `Anti_grav` fragments.

### 2) Prompt 8.5 — Hardened Tauri Shell (client)
Created the Rust/Tauri shell scaffolding under [client/src-tauri/](client/src-tauri/):
- [client/src-tauri/Cargo.toml](client/src-tauri/Cargo.toml)
  - Added dependencies: tauri v2, reqwest, ed25519-dalek, rand_core, rusqlite (bundled-sqlcipher), keyring, base64, sha2, serde, tauri-plugin-positioner.
- [client/src-tauri/src/signer.rs](client/src-tauri/src/signer.rs)
  - Implements Ed25519 signing and header generation:
    - Headers: X-DEX-DeviceId, X-DEX-Timestamp, X-DEX-Nonce, X-DEX-BodySha256, X-DEX-Signature
    - Canonical string: METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256
  - Keychain-backed key generation for `dexhub_device_key`.
  - `sign_pairing()` supports PAIR:<code> signature for pairing.
- [client/src-tauri/src/db.rs](client/src-tauri/src/db.rs)
  - SQLCipher initialization using `dexhub_db_key` from Keychain.
  - Validates 64 hex chars; generates new key if missing/invalid.
  - Executes `PRAGMA key = "x'<hex>'"` before any SQL.
  - Creates `cards` table schema.
- [client/src-tauri/src/main.rs](client/src-tauri/src/main.rs)
  - Accessory mode: `app.set_activation_policy(tauri::ActivationPolicy::Accessory)`.
  - Tray icon via Tauri v2 `TrayIconBuilder`, left click toggles window.
  - Commands implemented: `send_stt_request`, `send_tts_request`, `confirm_pairing`.
  - Uses raw string base URL `http://big-mac.tailscale.svc:5000`.

### 3) Prompt 8.6 — Trusted Sensory Server (Python/FastAPI)
Created server files under [server/](server/):
- [server/requirements.txt](server/requirements.txt)
  - FastAPI, uvicorn, whisper, pynacl, keyring, requests, etc.
- [server/device_registry.json](server/device_registry.json)
  - Initialized as empty registry `{}`.
- [server/dexhub_server.py](server/dexhub_server.py)
  - FastAPI app with signature verification dependency.
  - Nonce replay cache with TTL; timestamp window (60s).
  - Token bucket rate limiting (20/min for /stt, 60/min for /tts), localhost exempt.
  - Endpoints: `/stt`, `/tts`, `/pair/request`, `/pair/confirm`, `/admin/devices/revoke`.
  - `TTS_MODE` from `config/dexhub_config.json`; supports `local` and `gemini`.
  - Gemini API key fetched dynamically from Keychain (`dexhub`, `gemini_api_key`).

### 4) Prompt 8.7 — Tablet Portal (Web)
Created a minimal hardened tablet portal under [portal/](portal/):
- [portal/index.html](portal/index.html)
  - Pairing UI + basic `/tts` action + queue controls.
- [portal/styles.css](portal/styles.css)
  - UI styling aligned with DexHub tokens.
- [portal/app.js](portal/app.js)
  - WebCrypto Ed25519 keypair generation on first load.
  - Keys stored in IndexedDB (not localStorage).
  - Pairing: signs `PAIR:<code>` and POSTs to `/pair/confirm`.
  - Signed requests to `/tts` with required headers.
  - Offline queue stored in IndexedDB; `OFFLINE_MODE=metadata_only` (only metadata stored).

## Current Project Structure (relevant parts)
- [Documents/DexHub_bible.md](Documents/DexHub_bible.md)
- [client/src-tauri/Cargo.toml](client/src-tauri/Cargo.toml)
- [client/src-tauri/src/main.rs](client/src-tauri/src/main.rs)
- [client/src-tauri/src/signer.rs](client/src-tauri/src/signer.rs)
- [client/src-tauri/src/db.rs](client/src-tauri/src/db.rs)
- [server/dexhub_server.py](server/dexhub_server.py)
- [server/requirements.txt](server/requirements.txt)
- [portal/index.html](portal/index.html)
- [portal/app.js](portal/app.js)

## Notes / Caveats
- Workspace root: /Users/username/Projects/DexHub (canonical in spec).
- There is no React UI scaffold yet; only the portal and Tauri backend were created.
- No tests were added.
- Build/run commands are referenced in the spec: `cd server && uvicorn dexhub_server:app --reload` and `cd client && tauri dev`.
- The server binds to `0.0.0.0:5000` for reachability, but **do not** browse `http://0.0.0.0:5000/`. Use `http://127.0.0.1:5000/docs` locally on Big Mac, or `http://big-mac.tailscale.svc:5000/docs` from other nodes.

## What You Should Do Next
- Continue with the next prompt in DexHub_bible.md after 8.7.
- If needed, add any missing config files (e.g., `config/dexhub_config.json`) or expand UI functionality.
- Validate Tauri build, server startup, and portal pairing flow end-to-end.
