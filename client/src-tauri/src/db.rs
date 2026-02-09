use keyring::Entry;
use rand_core::{OsRng, RngCore};
use rusqlite::Connection;
use std::path::PathBuf;

pub fn init_db(app_data_dir: PathBuf) -> Connection {
    let entry = Entry::new("dexhub", "dexhub_db_key").expect("keyring entry");
    let mut key = entry.get_password().unwrap_or_default();

    if key.len() != 64 || hex::decode(&key).is_err() {
        let mut key_bytes = [0u8; 32];
        OsRng.fill_bytes(&mut key_bytes);
        key = hex::encode(key_bytes);
        entry.set_password(&key).expect("save db key failed");
    }

    let path = app_data_dir.join("dexhub.db");
    let conn = Connection::open(path).expect("db open failed");

    let pragma = format!("PRAGMA key = \"x'{}'\"", key);
    conn.execute(&pragma, []).expect("pragma key failed");

    conn.execute(
        "CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, title TEXT, content TEXT, status TEXT, priority INTEGER, position REAL, audio_blob BLOB, updated_at TEXT)",
        [],
    )
    .expect("create table failed");

    conn
}
