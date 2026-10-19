mod piascript;

use std::fs;
use tauri::Manager;
use piascript::{PiaCandle, PiaScriptEngine, PiaScriptResult};

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
fn load_credentials(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let mut dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.push("pia_credentials.json");
    if dir.exists() {
        let content = fs::read_to_string(dir).map_err(|e| e.to_string())?;
        Ok(Some(content))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn save_credentials(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let mut dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.push("pia_credentials.json");
    fs::write(dir, content).map_err(|e| e.to_string())
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
    let q: Option<Vec<(&str, &str)>> = query.as_ref().map(|vec| {
        vec.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect()
    });
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
            pia_native_candles,
            pia_native_request,
            execute_piascript
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
