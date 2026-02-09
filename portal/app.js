const HOST = "http://big-mac.tailscale.svc:5000";
const OFFLINE_MODE = "metadata_only";

const statusEl = document.getElementById("status");
const pairingEl = document.getElementById("pairing");
const controlsEl = document.getElementById("controls");
const pairButton = document.getElementById("pair-button");
const pairCodeInput = document.getElementById("pair-code");
const pairResult = document.getElementById("pair-result");
const ttsButton = document.getElementById("tts-button");
const ttsInput = document.getElementById("tts-text");
const ttsAudio = document.getElementById("tts-audio");
const apiOutput = document.getElementById("api-output");
const queueFlush = document.getElementById("queue-flush");
const queueCount = document.getElementById("queue-count");

const dbName = "dexhub_portal";
const keyStore = "keys";
const queueStore = "queue";

function setStatus(text) {
  statusEl.textContent = text;
}

function show(el) {
  el.classList.remove("hidden");
}

function hide(el) {
  el.classList.add("hidden");
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sha256Hex(data) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(keyStore)) {
        db.createObjectStore(keyStore);
      }
      if (!db.objectStoreNames.contains(queueStore)) {
        db.createObjectStore(queueStore, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbSet(storeName, key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function dbAdd(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.add(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbClear(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function loadKeys() {
  const stored = await dbGet(keyStore, "ed25519");
  if (!stored) {
    return null;
  }

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    base64ToBytes(stored.privateKey),
    { name: "Ed25519" },
    true,
    ["sign"]
  );

  const publicKey = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(stored.publicKey),
    { name: "Ed25519" },
    true,
    ["verify"]
  );

  return {
    privateKey,
    publicKey,
    publicKeyRaw: base64ToBytes(stored.publicKey),
  };
}

async function generateAndStoreKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );

  const privateKeyBytes = await crypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey
  );
  const publicKeyBytes = await crypto.subtle.exportKey("raw", keyPair.publicKey);

  await dbSet(keyStore, "ed25519", {
    privateKey: bytesToBase64(new Uint8Array(privateKeyBytes)),
    publicKey: bytesToBase64(new Uint8Array(publicKeyBytes)),
  });

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeyRaw: new Uint8Array(publicKeyBytes),
  };
}

async function ensureKeys() {
  let keys = await loadKeys();
  if (!keys) {
    keys = await generateAndStoreKeys();
  }
  return keys;
}

async function buildSignedHeaders(method, path, bodyBytes, keys) {
  const timestamp = Date.now().toString();
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = bytesToBase64(nonceBytes);
  const bodyHash = await sha256Hex(bodyBytes);

  const canonical = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const signatureBytes = await crypto.subtle.sign(
    { name: "Ed25519" },
    keys.privateKey,
    new TextEncoder().encode(canonical)
  );

  const signature = bytesToBase64(new Uint8Array(signatureBytes));
  const deviceHash = await sha256Hex(keys.publicKeyRaw.buffer);
  const deviceId = deviceHash.slice(0, 12);

  return {
    "X-DEX-DeviceId": deviceId,
    "X-DEX-Timestamp": timestamp,
    "X-DEX-Nonce": nonce,
    "X-DEX-BodySha256": bodyHash,
    "X-DEX-Signature": signature,
  };
}

async function signedFetch(path, options = {}) {
  const method = options.method || "POST";
  const bodyBytes = options.body || new Uint8Array();
  const keys = await ensureKeys();

  const headers = await buildSignedHeaders(method, path, bodyBytes, keys);
  const mergedHeaders = {
    ...headers,
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(`${HOST}${path}`, {
      method,
      body: bodyBytes.length ? bodyBytes : undefined,
      headers: mergedHeaders,
    });

    return res;
  } catch (error) {
    await queueRequest({
      method,
      path,
      headers: mergedHeaders,
      bodyHash: mergedHeaders["X-DEX-BodySha256"],
      createdAt: Date.now(),
      mode: OFFLINE_MODE,
    });
    await updateQueueCount();
    throw error;
  }
}

async function queueRequest(entry) {
  await dbAdd(queueStore, entry);
}

async function updateQueueCount() {
  const items = await dbAll(queueStore);
  queueCount.textContent = `Queued: ${items.length}`;
}

async function flushQueue() {
  const items = await dbAll(queueStore);
  if (!items.length) {
    apiOutput.textContent = "Queue empty.";
    return;
  }

  let replayable = 0;
  for (const item of items) {
    if (!item.body) {
      continue;
    }
    replayable += 1;
    await fetch(`${HOST}${item.path}`, {
      method: item.method,
      headers: item.headers,
      body: item.body,
    });
  }

  await dbClear(queueStore);
  await updateQueueCount();
  apiOutput.textContent = `Queue flushed. Replayable entries: ${replayable}.`;
}

async function pairDevice() {
  const code = pairCodeInput.value.trim();
  if (code.length !== 6) {
    pairResult.textContent = "Enter a 6-digit code.";
    return;
  }

  const keys = await ensureKeys();
  const message = new TextEncoder().encode(`PAIR:${code}`);
  const signatureBytes = await crypto.subtle.sign(
    { name: "Ed25519" },
    keys.privateKey,
    message
  );

  const signature = bytesToBase64(new Uint8Array(signatureBytes));
  const publicKeyHex = bytesToHex(keys.publicKeyRaw);

  const payload = {
    code,
    public_key: publicKeyHex,
    signature,
    role: "tablet",
  };

  const res = await fetch(`${HOST}/pair/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  pairResult.textContent = res.ok ? "Paired." : text;
  if (res.ok) {
    hide(pairingEl);
    show(controlsEl);
  }
}

async function sendTts() {
  const text = ttsInput.value.trim();
  if (!text) {
    apiOutput.textContent = "Enter text for /tts.";
    return;
  }

  const payload = JSON.stringify({ text });
  const res = await signedFetch("/tts", {
    method: "POST",
    body: new TextEncoder().encode(payload),
    headers: { "Content-Type": "application/json" },
  });

  const body = await res.text();
  apiOutput.textContent = body;

  if (!res.ok) {
    return;
  }

  try {
    const data = JSON.parse(body);
    if (data.audio && data.format === "aiff") {
      ttsAudio.src = `data:audio/aiff;base64,${data.audio}`;
      ttsAudio.play().catch(() => {});
    }
  } catch (error) {
    // ignore parse errors
  }
}

async function init() {
  setStatus("Loading keys…");
  await ensureKeys();
  await updateQueueCount();

  setStatus("Ready");
  show(pairingEl);
}

pairButton.addEventListener("click", () => {
  pairDevice().catch((err) => {
    pairResult.textContent = err.message || "Pairing failed.";
  });
});

ttsButton.addEventListener("click", () => {
  sendTts().catch((err) => {
    apiOutput.textContent = err.message || "Request failed.";
  });
});

queueFlush.addEventListener("click", () => {
  flushQueue().catch((err) => {
    apiOutput.textContent = err.message || "Flush failed.";
  });
});

init().catch((err) => {
  setStatus("Init failed");
  apiOutput.textContent = err.message || "Initialization failed.";
});
