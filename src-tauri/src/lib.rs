mod piascript;

use piascript::{PiaCandle, PiaScriptEngine, PiaScriptResult};
use std::fs;
use std::io::{Read, Write};
use std::net::{IpAddr, SocketAddr, TcpListener, ToSocketAddrs};
use std::sync::mpsc;
use std::time::Duration;
use tauri::Manager;

#[tauri::command]
fn execute_piascript(
    script: String,
    candles: Vec<PiaCandle>,
    initial_capital: Option<f64>,
) -> Result<PiaScriptResult, String> {
    if script.len() > 200_000 || candles.len() > 20_000 {
        return Err("PiaScript input exceeds the execution limits".to_string());
    }
    let mut engine = PiaScriptEngine::new(&candles);
    Ok(engine.execute(&script, initial_capital))
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct NativeHttpRequest {
    pub url: String,
    pub method: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct NativeHttpResponse {
    pub status: u16,
    pub headers: std::collections::HashMap<String, String>,
    pub body: String,
}

const MAX_NATIVE_HTTP_BYTES: usize = 10_000_000;

fn append_bounded_response_chunk(body: &mut Vec<u8>, chunk: &[u8]) -> Result<(), String> {
    if body.len().saturating_add(chunk.len()) > MAX_NATIVE_HTTP_BYTES {
        return Err("Native HTTP response exceeds 10 MB".to_string());
    }
    body.extend_from_slice(chunk);
    Ok(())
}

fn is_safe_http_ip(ip: IpAddr, allow_loopback: bool) -> bool {
    let ip = match ip {
        IpAddr::V6(v6) => v6.to_ipv4_mapped().map(IpAddr::V4).unwrap_or(IpAddr::V6(v6)),
        other => other,
    };
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            (allow_loopback && ip.is_loopback()) || (!ip.is_loopback()
                && !ip.is_private()
                && !ip.is_link_local()
                && !ip.is_broadcast()
                && a != 0
                && a < 224
                && !(a == 100 && (64..=127).contains(&b))
                && !(a == 192 && (b == 0 || (b == 88 && c == 99)))
                && !(a == 198 && ((b == 18 || b == 19) || (b == 51 && c == 100)))
                && !(a == 203 && b == 0 && c == 113))
        }
        IpAddr::V6(ip) => {
            if let Some(mapped_v4) = ip.to_ipv4() {
                return is_safe_http_ip(IpAddr::V4(mapped_v4), allow_loopback);
            }
            let s = ip.segments();
            (allow_loopback && ip.is_loopback()) || (!ip.is_loopback()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                && !ip.is_unique_local()
                && !ip.is_unicast_link_local()
                && !((s[0] & 0xffc0) == 0xfec0)
                && (s[0] & 0xe000) == 0x2000
                && !(s[0] == 0x2001 && (s[1] & 0xfe00) == 0)
                && !(s[0] == 0x2001 && s[1] == 0x0db8)
                && !(s[0] == 0x2001 && s[1] == 0x0002)
                && !(s[0] == 0x2001 && s[1] == 0x0000)
                && !(s[0] == 0x3fff && (s[1] & 0xfff0) == 0)
                && s[0] != 0x2002
                && !(s[0] == 0x0064 && s[1] == 0xff9b && (s[2] == 0 || s[2] == 1)))
        }
    }
}

fn resolve_native_http_target(url: &url::Url) -> Result<Vec<SocketAddr>, String> {
    let raw_host = url.host_str().ok_or_else(|| "Native HTTP URL is not permitted".to_string())?;
    let host = raw_host.trim_start_matches('[').trim_end_matches(']');
    let port = url.port_or_known_default().ok_or_else(|| "Native HTTP URL has no valid port".to_string())?;
    let local_ollama = port == 11434 && matches!(raw_host, "localhost" | "127.0.0.1" | "[::1]");
    if (host.eq_ignore_ascii_case("localhost") || host.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback())) && !local_ollama {
        return Err("Local HTTP access is limited to Ollama on port 11434".to_string());
    }

    let addrs: Vec<_> = if local_ollama && host.eq_ignore_ascii_case("localhost") {
        vec![SocketAddr::from(([127, 0, 0, 1], port))]
    } else {
        (host, port).to_socket_addrs().map_err(|e| e.to_string())?.collect()
    };
    if addrs.is_empty() || addrs.iter().any(|addr| !is_safe_http_ip(addr.ip(), local_ollama)) {
        return Err("Native HTTP target resolves to a restricted network address".to_string());
    }
    Ok(addrs)
}

#[tauri::command]
async fn native_http_request(req: NativeHttpRequest) -> Result<NativeHttpResponse, String> {
    let url = url::Url::parse(&req.url).map_err(|e| e.to_string())?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.as_str().len() > 8_192
    {
        return Err("Native HTTP URL is not permitted".to_string());
    }
    let host = url.host_str().unwrap().trim_start_matches('[').trim_end_matches(']');
    let addrs = resolve_native_http_target(&url)?;
    if req.body.as_ref().map_or(0, String::len) > MAX_NATIVE_HTTP_BYTES {
        return Err("Native HTTP request body exceeds 10 MB".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::none())
        .resolve_to_addrs(host, &addrs)
        .build()
        .map_err(|e| e.to_string())?;

    let method = match req.method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        _ => return Err("Native HTTP method is not permitted".to_string()),
    };

    let mut request = client.request(method, url);
    for (k, v) in req.headers {
        if matches!(k.to_ascii_lowercase().as_str(), "host" | "connection" | "proxy-authorization" | "proxy-connection" | "transfer-encoding" | "upgrade") {
            return Err("Native HTTP request contains a restricted header".to_string());
        }
        request = request.header(k, v);
    }
    if let Some(b) = req.body {
        request = request.body(b);
    }

    let mut res = request.send().await.map_err(|e| e.to_string())?;
    if res.content_length().is_some_and(|len| len > MAX_NATIVE_HTTP_BYTES as u64) {
        return Err("Native HTTP response exceeds 10 MB".to_string());
    }
    let status = res.status().as_u16();
    let mut resp_headers = std::collections::HashMap::new();
    for (k, v) in res.headers() {
        if let Ok(val) = v.to_str() {
            resp_headers.insert(k.as_str().to_string(), val.to_string());
        }
    }

    let mut bytes = Vec::new();
    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        append_bounded_response_chunk(&mut bytes, &chunk)?;
    }
    let body = String::from_utf8_lossy(&bytes).into_owned();

    Ok(NativeHttpResponse { status, headers: resp_headers, body })
}

#[cfg(test)]
mod native_http_tests {
    use super::*;

    #[test]
    fn caps_response_body_while_appending_chunks() {
        let mut body = vec![0; MAX_NATIVE_HTTP_BYTES - 1];
        assert!(append_bounded_response_chunk(&mut body, b"x").is_ok());
        assert!(append_bounded_response_chunk(&mut body, b"x").is_err());
        assert_eq!(body.len(), MAX_NATIVE_HTTP_BYTES);
    }

    #[test]
    fn restricts_private_and_special_address_ranges() {
        for ip in ["10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.1.2.3", "224.0.0.1", "255.255.255.255", "192.0.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "::", "fc00::1", "fe80::1", "fec0::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "2001:db8::1", "2001:2::1", "2002::1", "3fff::1", "fd00:ec2::254"] {
            assert!(!is_safe_http_ip(ip.parse().unwrap(), false), "unexpectedly allowed {ip}");
        }
        assert!(is_safe_http_ip("1.1.1.1".parse().unwrap(), false));
        assert!(is_safe_http_ip("2606:4700:4700::1111".parse().unwrap(), false));
    }

    #[test]
    fn only_allows_loopback_for_ollama_port() {
        assert!(resolve_native_http_target(&url::Url::parse("http://localhost:11434/v1").unwrap()).is_ok());
        assert!(resolve_native_http_target(&url::Url::parse("http://127.0.0.1:11434/v1").unwrap()).is_ok());
        assert!(resolve_native_http_target(&url::Url::parse("http://localhost:8080/").unwrap()).is_err());
        assert!(resolve_native_http_target(&url::Url::parse("http://127.0.0.1:8080/").unwrap()).is_err());
        assert!(!is_safe_http_ip("127.0.0.1".parse().unwrap(), false));
        assert!(is_safe_http_ip("127.0.0.1".parse().unwrap(), true));
    }
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
                width: 380.0,
                height: 415.0,
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
    if data.len() < 16 || !data.starts_with(b"SQLite format 3\0") {
        return Err("Refusing to persist invalid SQLite database bytes".to_string());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let db_path = dir.join("pia-terminal.db");
    let tmp_path = dir.join("pia-terminal.db.tmp");
    fs::write(&tmp_path, data).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    if db_path.exists() {
        let backup_path = dir.join("pia-terminal.db.previous");
        if backup_path.exists() {
            fs::remove_file(&backup_path).map_err(|e| e.to_string())?;
        }
        fs::rename(&db_path, &backup_path).map_err(|e| e.to_string())?;
    }
    if let Err(error) = fs::rename(&tmp_path, &db_path) {
        #[cfg(windows)]
        if db_path.exists() {
            let _ = fs::remove_file(&db_path);
        }
        #[cfg(windows)]
        let _ = fs::rename(dir.join("pia-terminal.db.previous"), &db_path);
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
async fn load_credentials() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new("dev.wign.pia", "credentials").map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(content) if !content.trim().is_empty() => Ok(Some(content)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_credentials(content: String) -> Result<(), String> {
    let entry = keyring::Entry::new("dev.wign.pia", "credentials").map_err(|e| e.to_string())?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    } else {
        entry.set_password(trimmed).map_err(|e| e.to_string())
    }
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
            native_http_request,
            execute_piascript
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
