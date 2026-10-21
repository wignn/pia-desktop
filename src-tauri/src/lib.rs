mod piascript;

use piascript::{PiaCandle, PiaScriptEngine, PiaScriptResult};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::time::Duration;
use tauri::Manager;

#[tauri::command]
fn execute_piascript(
    script: String,
    candles: Vec<PiaCandle>,
    initial_capital: Option<f64>,
) -> Result<PiaScriptResult, String> {
    let mut engine = PiaScriptEngine::new(&candles);
    Ok(engine.execute(&script, initial_capital))
}

#[tauri::command]
fn load_db(app: tauri::AppHandle) -> Result<Vec<u8>, String> {
    let mut dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.push("pia-terminal.db");
    if dir.exists() {
        fs::read(dir).map_err(|e| e.to_string())
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
fn save_db(app: tauri::AppHandle, data: Vec<u8>) -> Result<(), String> {
    let mut dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.push("pia-terminal.db");
    fs::write(dir, data).map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_credentials(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let _ = app;
    match keyring::Entry::new("dev.wign.pia", "credentials")
        .map_err(|e| e.to_string())?
        .get_password()
    {
        Ok(content) => Ok(Some(content)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_credentials(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let _ = app;
    let entry = keyring::Entry::new("dev.wign.pia", "credentials").map_err(|e| e.to_string())?;
    if content.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    } else {
        entry.set_password(&content).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn google_oauth_callback(url: String, expected_state: String) -> Result<serde_json::Value, String> {
    let auth_url = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if auth_url.scheme() != "https"
        || auth_url.host_str() != Some("accounts.google.com")
        || auth_url.path() != "/o/oauth2/v2/auth"
        || auth_url
            .query_pairs()
            .find(|(k, _)| k == "state")
            .map(|(_, v)| v.into_owned())
            .as_deref()
            != Some(expected_state.as_str())
        || auth_url
            .query_pairs()
            .find(|(key, _)| key == "redirect_uri")
            .map(|(_, value)| value.into_owned())
            .as_deref()
            != Some("http://127.0.0.1:43827/oauth/callback")
    {
        return Err("Unexpected Google authorization URL".into());
    }
    let listener = TcpListener::bind("127.0.0.1:43827").map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|e| e.to_string())?;

    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let result = (|| -> Result<serde_json::Value, String> {
            let deadline = std::time::Instant::now() + Duration::from_secs(180);
            loop {
                match listener.accept() {
                    Ok((mut stream, address)) => {
                        if !address.ip().is_loopback() {
                            continue;
                        }
                        let mut buffer = [0; 8192];
                        let count = stream.read(&mut buffer).map_err(|e| e.to_string())?;
                        let request = String::from_utf8_lossy(&buffer[..count]);
                        if !request.starts_with("GET ")
                            || !request
                                .to_ascii_lowercase()
                                .contains("host: 127.0.0.1:43827")
                        {
                            stream
                                .write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nInvalid callback request")
                                .ok();
                            continue;
                        }
                        let target = request
                            .split_whitespace()
                            .nth(1)
                            .ok_or("Invalid callback request")?;
                        let callback = url::Url::parse(&format!("http://127.0.0.1{target}"))
                            .map_err(|e| e.to_string())?;
                        let query_pairs: Vec<_> = callback.query_pairs().into_owned().collect();
                        if callback.path() != "/oauth/callback" {
                            stream
                                .write_all(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n")
                                .ok();
                            continue;
                        }
                        if callback.host_str() != Some("127.0.0.1")
                            || callback.port().is_some()
                            || callback.fragment().is_some()
                            || callback.username() != ""
                            || callback.password().is_some()
                            || query_pairs.iter().filter(|(key, _)| key == "state").count() != 1
                            || query_pairs.iter().filter(|(key, _)| key == "code").count() != 1
                        {
                            stream
                                .write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nInvalid callback URL")
                                .ok();
                            continue;
                        }
                        let query_pairs: Vec<_> = callback.query_pairs().into_owned().collect();
                        if query_pairs.iter().any(|(key, _)| key == "error") {
                            stream
                                .write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nGoogle sign-in was cancelled")
                                .ok();
                            return Err("Google sign-in was cancelled".into());
                        }
                        if query_pairs
                            .iter()
                            .find(|(key, _)| key == "state")
                            .map(|(_, value)| value.as_str())
                            != Some(expected_state.as_str())
                        {
                            stream
                                .write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nInvalid OAuth state")
                                .ok();
                            continue;
                        }
                        let code = query_pairs
                            .iter()
                            .find(|(key, _)| key == "code")
                            .map(|(_, value)| value.clone())
                            .ok_or("Google did not return an authorization code")?;
                        if code.is_empty() {
                            return Err("Google returned an empty authorization code".into());
                        }
                        stream
                            .write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n<title>PIA</title><p>Sign-in complete. Return to PIA Desktop.</p>")
                            .ok();
                        return Ok(serde_json::json!({"code": code, "state": expected_state}));
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        if std::time::Instant::now() >= deadline {
                            return Err("Google sign-in timed out".into());
                        }
                        std::thread::sleep(Duration::from_millis(100));
                    }
                    Err(error) => return Err(error.to_string()),
                }
            }
        })();
        let _ = sender.send(result);
    });
    receiver
        .recv_timeout(Duration::from_secs(185))
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn pia_native_candles(
    symbol: String,
    timeframe: String,
    limit: Option<u32>,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut builder = pia_sdk::PiaClient::builder();
    if let Some(key) = api_key {
        if !key.trim().is_empty() {
            builder = builder.api_key(key);
        }
    }
    if let Some(url) = base_url {
        if !url.trim().is_empty() {
            builder = builder.base_url(url);
        }
    }
    let client = builder.build().map_err(|e| e.to_string())?;
    client
        .get_candles(&symbol, &timeframe, limit)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn pia_native_request(
    path: String,
    method: Option<String>,
    query: Option<Vec<(String, String)>>,
    body: Option<serde_json::Value>,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut builder = pia_sdk::PiaClient::builder();
    if let Some(key) = api_key {
        if !key.trim().is_empty() {
            builder = builder.api_key(key);
        }
    }
    if let Some(url) = base_url {
        if !url.trim().is_empty() {
            builder = builder.base_url(url);
        }
    }
    let client = builder.build().map_err(|e| e.to_string())?;
    let m = match method.as_deref() {
        Some("POST") => reqwest::Method::POST,
        Some("PUT") => reqwest::Method::PUT,
        Some("DELETE") => reqwest::Method::DELETE,
        _ => reqwest::Method::GET,
    };
    let q: Option<Vec<(&str, &str)>> = query
        .as_ref()
        .map(|vec| vec.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect());
    client
        .request(m, &path, q.as_deref(), body.as_ref())
        .await
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            load_db,
            save_db,
            load_credentials,
            save_credentials,
            google_oauth_callback,
            pia_native_candles,
            pia_native_request,
            execute_piascript
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
