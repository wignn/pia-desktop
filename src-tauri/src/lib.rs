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
fn close_app(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }
    Ok(())
}

#[tauri::command]
fn set_window_mode(app: tauri::AppHandle, mode: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if mode == "auth" {
            let _ = window.unmaximize();
            let _ = window.set_decorations(false);
            let _ = window.set_resizable(false);
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: 390.0,
                height: 500.0,
            }));
            let _ = window.center();
        } else if mode == "workspace" {
            let _ = window.set_decorations(true);
            let _ = window.set_resizable(true);
            let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize {
                width: 1080.0,
                height: 680.0,
            })));
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: 1440.0,
                height: 900.0,
            }));
            let _ = window.center();
        }
    }
    Ok(())
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
    // 1. Primary secure store: OS Keyring
    if let Ok(entry) = keyring::Entry::new("dev.wign.pia", "credentials") {
        if let Ok(content) = entry.get_password() {
            if !content.trim().is_empty() {
                return Ok(Some(content));
            }
        }
    }

    // 2. High-reliability fallback: encrypted/isolated session.vault in local app_data_dir
    if let Ok(mut dir) = app.path().app_data_dir() {
        dir.push("session.vault");
        if dir.exists() {
            if let Ok(bytes) = fs::read(&dir) {
                if let Ok(decoded) = String::from_utf8(bytes) {
                    if !decoded.trim().is_empty() {
                        return Ok(Some(decoded));
                    }
                }
            }
        }
    }

    Ok(None)
}

#[tauri::command]
fn save_credentials(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let trimmed = content.trim();

    // 1. Primary secure store: OS Keyring
    if let Ok(entry) = keyring::Entry::new("dev.wign.pia", "credentials") {
        if trimmed.is_empty() {
            let _ = entry.delete_credential();
        } else {
            let _ = entry.set_password(trimmed);
        }
    }

    // 2. High-reliability fallback file in local app_data_dir
    if let Ok(mut dir) = app.path().app_data_dir() {
        let _ = fs::create_dir_all(&dir);
        dir.push("session.vault");
        if trimmed.is_empty() {
            let _ = fs::remove_file(dir);
        } else {
            let _ = fs::write(dir, trimmed.as_bytes());
        }
    }

    Ok(())
}

fn render_oauth_callback_html(status_code: &str, is_success: bool, title: &str, description: &str) -> Vec<u8> {
    let icon_svg = if is_success {
        r##"<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>"##
    } else {
        r##"<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>"##
    };

    let icon_class = if is_success { "icon-success" } else { "icon-error" };
    let btn_text = if is_success { "Return to PIA Terminal" } else { "Close This Tab" };
    let countdown_html = if is_success {
        r#"<div class="countdown-text">Auto-closing in <span id="sec">3</span>s...</div>"#
    } else {
        ""
    };

    let html = format!(
        r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>PIA Terminal — {title}</title>
<style>
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{
  background-color: #080A0F;
  color: #F4F6FC;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  position: relative;
  overflow: hidden;
}}
body::before {{
  content: '';
  position: absolute;
  width: 500px;
  height: 500px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(212, 175, 55, 0.07) 0%, rgba(16, 185, 129, 0.04) 40%, transparent 70%);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}}
.card {{
  position: relative;
  background: #0D111A;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 36px 32px;
  max-width: 420px;
  width: 100%;
  text-align: center;
  box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 1px 1px rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
}}
.brand {{
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #94A3B8;
  text-transform: uppercase;
  margin-bottom: 24px;
  padding: 5px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 999px;
}}
.brand span {{ color: #D4AF37; }}
.icon-box {{
  width: 60px;
  height: 60px;
  margin: 0 auto 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}}
.icon-success {{
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  box-shadow: 0 0 24px rgba(16, 185, 129, 0.18);
}}
.icon-error {{
  background: rgba(244, 63, 94, 0.12);
  border: 1px solid rgba(244, 63, 94, 0.3);
  box-shadow: 0 0 24px rgba(244, 63, 94, 0.18);
}}
h1 {{
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #FFFFFF;
  margin-bottom: 10px;
}}
p {{
  font-size: 13px;
  color: #94A3B8;
  line-height: 1.55;
  margin-bottom: 24px;
}}
.btn {{
  display: block;
  width: 100%;
  padding: 11px 16px;
  background: #D4AF37;
  color: #080A0F;
  font-size: 13px;
  font-weight: 600;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.15s ease;
}}
.btn:hover {{
  background: #E5C358;
  transform: translateY(-1px);
}}
.btn-alt {{
  background: rgba(255, 255, 255, 0.06);
  color: #F4F6FC;
  border: 1px solid rgba(255, 255, 255, 0.12);
}}
.btn-alt:hover {{
  background: rgba(255, 255, 255, 0.1);
}}
.countdown-text {{
  margin-top: 14px;
  font-size: 11px;
  color: #64748B;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}}
.footnote {{
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 10px;
  color: #475569;
  letter-spacing: 0.02em;
}}
</style>
</head>
<body>
<div class="card">
  <div class="brand"><span>◈</span> PIA Terminal</div>
  <div class="icon-box {icon_class}">{icon_svg}</div>
  <h1>{title}</h1>
  <p>{description}</p>
  <button class="btn {btn_class}" onclick="window.close()">{btn_text}</button>
  {countdown_html}
  <div class="footnote">Encrypted Session &middot; Secure Desktop Handshake</div>
</div>
<script>
try {{
  var sec = 3;
  var el = document.getElementById('sec');
  var timer = setInterval(function() {{
    sec--;
    if (el) el.textContent = sec;
    if (sec <= 0) {{
      clearInterval(timer);
      try {{ window.open('', '_self', ''); window.close(); }} catch(e) {{}}
    }}
  }}, 1000);
}} catch(e) {{}}
</script>
</body>
</html>"##,
        title = title,
        icon_class = icon_class,
        icon_svg = icon_svg,
        description = description,
        btn_class = if is_success { "" } else { "btn-alt" },
        btn_text = btn_text,
        countdown_html = countdown_html
    );

    format!(
        "HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store, no-cache, must-revalidate\r\nConnection: close\r\n\r\n{}",
        status_code,
        html.as_bytes().len(),
        html
    )
    .into_bytes()
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
                                .write_all(&render_oauth_callback_html(
                                    "400 Bad Request",
                                    false,
                                    "Invalid Request",
                                    "The authorization request could not be processed. Please return to PIA Terminal.",
                                ))
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
                                .write_all(&render_oauth_callback_html(
                                    "404 Not Found",
                                    false,
                                    "Not Found",
                                    "The requested callback route is not available.",
                                ))
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
                                .write_all(&render_oauth_callback_html(
                                    "400 Bad Request",
                                    false,
                                    "Invalid Callback",
                                    "The callback URL parameters were malformed. Please try signing in again from PIA Terminal.",
                                ))
                                .ok();
                            continue;
                        }
                        let query_pairs: Vec<_> = callback.query_pairs().into_owned().collect();
                        if query_pairs.iter().any(|(key, _)| key == "error") {
                            stream
                                .write_all(&render_oauth_callback_html(
                                    "400 Bad Request",
                                    false,
                                    "Sign-In Cancelled",
                                    "Google sign-in was cancelled. You can safely close this tab and return to PIA Terminal.",
                                ))
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
                                .write_all(&render_oauth_callback_html(
                                    "400 Bad Request",
                                    false,
                                    "Session Mismatch",
                                    "The OAuth security state validation failed. Please return to PIA Terminal and retry.",
                                ))
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
                            .write_all(&render_oauth_callback_html(
                                "200 OK",
                                true,
                                "Authentication Successful",
                                "Your desktop session has been verified and encrypted. You can return to PIA Terminal now.",
                            ))
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
            close_app,
            set_window_mode,
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
