use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use ed25519_dalek::{Signer, SigningKey};
use keyring::Entry;
use rand_core::{OsRng, RngCore};
use sha2::{Digest, Sha256};

pub struct SignedHeaders {
    pub timestamp: String,
    pub nonce: String,
    pub body_hash: String,
    pub signature: String,
    pub device_id: String,
}

pub fn get_or_create_key() -> SigningKey {
    let entry = Entry::new("dexhub", "dexhub_device_key").expect("keyring entry");
    match entry.get_password() {
        Ok(hex_key) => {
            let bytes = hex::decode(hex_key).expect("invalid key hex");
            SigningKey::from_bytes(bytes.try_into().expect("invalid key length"))
        }
        Err(_) => {
            let mut key_bytes = [0u8; 32];
            OsRng.fill_bytes(&mut key_bytes);
            let key = SigningKey::from_bytes(&key_bytes);
            entry
                .set_password(&hex::encode(key.to_bytes()))
                .expect("save key failed");
            key
        }
    }
}

pub fn sign_request(method: &str, path: &str, body: &[u8], key: &SigningKey) -> SignedHeaders {
    let timestamp = Utc::now().timestamp_millis().to_string();

    let mut nonce_bytes = [0u8; 16];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = general_purpose::STANDARD.encode(nonce_bytes);

    let mut hasher = Sha256::new();
    hasher.update(body);
    let body_hash = hex::encode(hasher.finalize());

    let canonical = format!(
        "{}\n{}\n{}\n{}\n{}",
        method, path, timestamp, nonce, body_hash
    );
    let signature = key.sign(canonical.as_bytes());
    let signature = general_purpose::STANDARD.encode(signature.to_bytes());

    let pub_bytes = key.verifying_key().to_bytes();
    let mut id_hasher = Sha256::new();
    id_hasher.update(pub_bytes);
    let device_id = &hex::encode(id_hasher.finalize())[0..12];

    SignedHeaders {
        timestamp,
        nonce,
        body_hash,
        signature,
        device_id: device_id.to_string(),
    }
}

pub fn sign_pairing(code: &str, key: &SigningKey) -> (String, String) {
    let msg = format!("PAIR:{}", code);
    let signature = key.sign(msg.as_bytes());
    let signature = general_purpose::STANDARD.encode(signature.to_bytes());
    let pub_key_hex = hex::encode(key.verifying_key().to_bytes());

    (signature, pub_key_hex)
}
