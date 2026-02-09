mod db;
mod signer;

use base64::{engine::general_purpose, Engine as _};
use serde_json::json;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_positioner::{Position, WindowExt};

const BIG_MAC_HOST: &str = r#"http://big-mac.tailscale.svc:5000"#;

struct DBState(Mutex<rusqlite::Connection>);

#[tauri::command]
async fn send_stt_request(audio_base64: String) -> Result<String, String> {
    let audio_bytes = general_purpose::STANDARD
        .decode(audio_base64)
        .map_err(|e| e.to_string())?;

    let signing_key = signer::get_or_create_key();
    let path = "/stt";
    let url = format!("{}{}", BIG_MAC_HOST, path);

    let signed = signer::sign_request("POST", path, &audio_bytes, &signing_key);

    let client = reqwest::Client::new();
    let res = client
        .post(url)
        .body(audio_bytes)
        .header("X-DEX-DeviceId", signed.device_id)
        .header("X-DEX-Timestamp", signed.timestamp)
        .header("X-DEX-Nonce", signed.nonce)
        .header("X-DEX-BodySha256", signed.body_hash)
        .header("X-DEX-Signature", signed.signature)
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
    let payload = json!({ "text": text });
    let body_bytes = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;

    let signing_key = signer::get_or_create_key();
    let path = "/tts";
    let url = format!("{}{}", BIG_MAC_HOST, path);

    let signed = signer::sign_request("POST", path, &body_bytes, &signing_key);

    let client = reqwest::Client::new();
    let res = client
        .post(url)
        .body(body_bytes)
        .header("X-DEX-DeviceId", signed.device_id)
        .header("X-DEX-Timestamp", signed.timestamp)
        .header("X-DEX-Nonce", signed.nonce)
        .header("X-DEX-BodySha256", signed.body_hash)
        .header("X-DEX-Signature", signed.signature)
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
    let signing_key = signer::get_or_create_key();
    let (signature, pub_key_hex) = signer::sign_pairing(&code, &signing_key);

    let payload = json!({
        "code": code,
        "public_key": pub_key_hex,
        "signature": signature,
        "role": "client"
    });

    let client = reqwest::Client::new();
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let app_data_dir = app.path().app_data_dir().expect("path failed");
            let conn = db::init_db(app_data_dir);
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
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
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
            confirm_pairing
        ])
        .run(tauri::generate_context!())
        .expect("error running tauri");
}
