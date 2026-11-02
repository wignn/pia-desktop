use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{atomic::{AtomicBool, AtomicUsize, Ordering}, mpsc, Mutex},
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};

const MAX_LINE: usize = 1024 * 1024;
type PipeMessage = Result<Value, String>;
struct Session {
    stdin: ChildStdin,
    receiver: mpsc::Receiver<PipeMessage>,
    ready: bool,
    next_id: u64,
}

pub struct KronosRuntime {
    child: Mutex<Option<Child>>,
    session: Mutex<Option<Session>>,
    status: Mutex<Value>,
    closing: AtomicBool,
    starts: AtomicUsize,
    #[cfg(test)]
    fixture: Option<(PathBuf, String, Duration)>,
}

impl Default for KronosRuntime {
    fn default() -> Self {
        Self {
            child: Mutex::new(None), session: Mutex::new(None),
            status: Mutex::new(json!({"status":"idle"})), closing: AtomicBool::new(false),
            starts: AtomicUsize::new(0),
            #[cfg(test)]
            fixture: None,
        }
    }
}

fn timeframe_ms(timeframe: &str) -> Option<u64> {
    match timeframe {
        "1m" => Some(60_000), "5m" => Some(300_000), "15m" => Some(900_000), "30m" => Some(1_800_000),
        "1h" => Some(3_600_000), "4h" => Some(14_400_000), "1d" => Some(86_400_000), "1w" => Some(604_800_000),
        _ => None,
    }
}

fn safe_timestamp(value: &Value) -> Option<u64> {
    if let Some(n) = value.as_u64() {
        return (1..=9_007_199_254_740_991).contains(&n).then_some(n);
    }
    value.as_f64().filter(|f| f.is_finite() && *f >= 1.0 && *f <= 9_007_199_254_740_991.0 && f.fract() == 0.0).map(|f| f as u64)
}

fn validate_payload(payload: &Value) -> Result<(), String> {
    let fail = || "Provide a symbol, 12–256 aligned closed OHLC candles, a 1–12 horizon and six samples".to_string();
    let symbol = payload["symbol"].as_str().ok_or_else(fail)?;
    if symbol.trim().is_empty() || symbol.len() > 128 { return Err(fail()); }
    let timeframe = payload["timeframe"].as_str().ok_or_else(fail)?;
    let interval = timeframe_ms(timeframe).ok_or_else(fail)?;
    let anchor = if timeframe == "1w" { 345_600_000 } else { 0 };
    let cutoff = safe_timestamp(&payload["cutoffTimestamp"]).ok_or_else(fail)?;
    let now_ms = u64::try_from(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_| fail())?.as_millis()).map_err(|_| fail())?;
    if cutoff > now_ms + 60_000 { return Err(fail()); }
    let bars = payload["candles"].as_array().ok_or_else(fail)?;
    if !(12..=256).contains(&bars.len()) || !(1..=12).contains(&payload["pred_len"].as_u64().unwrap_or(0)) || payload["sample_count"].as_u64() != Some(6) { return Err(fail()); }
    let mut previous = None;
    for bar in bars {
        let timestamp = safe_timestamp(&bar["timestamp"]).ok_or_else(fail)?;
        if timestamp < anchor || (timestamp - anchor) % interval != 0 || timestamp + interval > cutoff || previous.is_some_and(|prev| timestamp <= prev) {
            return Err(fail());
        }
        previous = Some(timestamp);
        let mut prices = Vec::with_capacity(4);
        for key in ["open", "high", "low", "close"] {
            let number = bar[key].as_f64().filter(|n| n.is_finite()).ok_or_else(fail)?;
            prices.push(number);
        }
        if prices[2] > prices[0].min(prices[3]) || prices[1] < prices[0].max(prices[3]) { return Err(fail()); }
        if let Some(volume) = bar.get("volume") {
            if volume.as_f64().filter(|n| n.is_finite() && *n >= 0.0).is_none() { return Err(fail()); }
        }
    }
    if serde_json::to_vec(payload).map_err(|_| fail())?.len() > MAX_LINE - 256 { return Err(fail()); }
    Ok(())
}

impl KronosRuntime {
    fn snapshot(&self) -> Value { self.status.lock().unwrap().clone() }

    fn update_status(&self, status: Value, app: Option<&tauri::AppHandle>) {
        *self.status.lock().unwrap() = status.clone();
        if let Some(app) = app { let _ = app.emit("kronos-status", status); }
    }

    fn stop_child(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    pub fn shutdown(&self) {
        self.closing.store(true, Ordering::SeqCst);
        self.stop_child();
    }

    fn start(&self, app: Option<&tauri::AppHandle>) -> Result<Session, String> {
        let mut command;
        #[cfg(test)]
        if let Some((path, mode, _)) = &self.fixture {
            command = Command::new(path);
            command.arg(mode);
        } else { command = Self::command(app)?; }
        #[cfg(not(test))]
        { command = Self::command(app)?; }
        command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit())
            .env("OMP_NUM_THREADS", "2").env("MKL_NUM_THREADS", "2");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut owned = self.child.lock().unwrap();
        if self.closing.load(Ordering::SeqCst) { return Err("Application is closing".into()); }
        let mut child = command.spawn().map_err(|_| "Bundled Kronos CPU runtime is missing or cannot start".to_string())?;
        let stdin = child.stdin.take().ok_or("Worker stdin is unavailable")?;
        let stdout = child.stdout.take().ok_or("Worker stdout is unavailable")?;
        *owned = Some(child);
        self.starts.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = mpsc::sync_channel(32);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut bytes = Vec::new();
                let read = reader.by_ref().take((MAX_LINE + 1) as u64).read_until(b'\n', &mut bytes);
                let message = match read {
                    Ok(0) => Err("Local CPU worker exited; retry local AI".to_string()),
                    Ok(_) if bytes.len() > MAX_LINE || !bytes.ends_with(b"\n") => Err("Local worker exceeded protocol bounds".to_string()),
                    Ok(_) => serde_json::from_slice::<Value>(&bytes).map_err(|_| "Local worker returned malformed output".to_string()),
                    Err(_) => Err("Local worker pipe failed".to_string()),
                };
                let failed = message.is_err();
                if sender.send(message).is_err() || failed { break; }
            }
        });
        Ok(Session { stdin, receiver, ready: false, next_id: 0 })
    }

    fn command(app: Option<&tauri::AppHandle>) -> Result<Command, String> {
        let app = app.ok_or("Desktop runtime required")?;
        let name = if cfg!(windows) { "kronos-worker.exe" } else { "kronos-worker" };
        let path = app.path().resolve(format!("kronos-runtime/{name}"), tauri::path::BaseDirectory::Resource).map_err(|e| e.to_string())?;
        let mut command = Command::new(path);
        command.arg("--parent-pid").arg(std::process::id().to_string());
        Ok(command)
    }

    fn exchange(&self, session: &mut Session, mut request: Value, timeout: Duration, app: Option<&tauri::AppHandle>) -> Result<Value, String> {
        if self.closing.load(Ordering::SeqCst) { return Err("Application is closing".into()); }
        session.next_id += 1;
        let id = session.next_id;
        request["id"] = json!(id);
        let mut bytes = serde_json::to_vec(&request).map_err(|e| e.to_string())?;
        bytes.push(b'\n');
        if bytes.len() > MAX_LINE { return Err("Local worker input exceeds protocol bounds".into()); }
        session.stdin.write_all(&bytes).and_then(|_| session.stdin.flush()).map_err(|_| "Local worker pipe closed".to_string())?;
        let deadline = Instant::now() + timeout;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            let message = session.receiver.recv_timeout(remaining).map_err(|_| "Local CPU worker timed out or exited; retry local AI".to_string())??;
            if message["id"].as_u64() != Some(id) { return Err("Local worker response ID mismatch".into()); }
            match message["type"].as_str() {
                Some("result") => return message.get("result").cloned().ok_or("Missing local result".into()),
                Some("error") => return Err(message["message"].as_str().unwrap_or("Local CPU inference failed").chars().take(500).collect()),
                Some("status") => {
                    if !matches!(message["status"].as_str(), Some("downloading" | "loading" | "ready")) { return Err("Invalid local worker status".into()); }
                    self.update_status(json!({"status":message["status"],"downloadedBytes":message["downloadedBytes"],"totalBytes":message["totalBytes"]}), app);
                }
                _ => return Err("Invalid local worker message".into()),
            }
        }
    }

    fn initialize_locked(&self, slot: &mut Option<Session>, cache: PathBuf, app: Option<&tauri::AppHandle>) -> Result<(), String> {
        if slot.is_none() { *slot = Some(self.start(app)?); }
        let session = slot.as_mut().unwrap();
        if !session.ready {
            let mut timeout = Duration::from_secs(900);
            #[cfg(test)]
            if let Some((_, _, test_timeout)) = &self.fixture { timeout = *test_timeout; }
            let _ = &mut timeout;
            self.exchange(session, json!({"op":"initialize","cacheDir":cache}), timeout, app)?;
            session.ready = true;
            self.update_status(json!({"status":"ready"}), app);
        }
        Ok(())
    }

    fn initialize_at(&self, cache: PathBuf, app: Option<&tauri::AppHandle>) -> Result<(), String> {
        let mut slot = self.session.lock().unwrap();
        let result = self.initialize_locked(&mut slot, cache, app);
        if let Err(error) = &result {
            self.stop_child(); *slot = None;
            self.update_status(json!({"status":"error","error":error}), app);
        }
        result
    }

    fn forecast_at(&self, cache: PathBuf, payload: Value, app: &tauri::AppHandle) -> Result<Value, String> {
        validate_payload(&payload)?;
        let mut slot = self.session.lock().unwrap();
        let result = self.initialize_locked(&mut slot, cache, Some(app)).and_then(|_| {
            self.exchange(slot.as_mut().unwrap(), json!({"op":"forecast","payload":payload}), Duration::from_secs(120), Some(app))
        });
        if let Err(error) = &result {
            self.stop_child(); *slot = None;
            self.update_status(json!({"status":"error","error":error}), Some(app));
        }
        result
    }

    #[cfg(test)]
    fn for_test(path: PathBuf, mode: String, timeout: Duration) -> Self {
        let mut runtime = Self::default();
        runtime.fixture = Some((path, mode, timeout));
        runtime
    }
}

impl Drop for KronosRuntime { fn drop(&mut self) { self.shutdown(); } }

#[tauri::command]
pub async fn kronos_initialize(app: tauri::AppHandle, state: tauri::State<'_, std::sync::Arc<KronosRuntime>>) -> Result<(), String> {
    let runtime = state.inner().clone();
    let cache = app.path().app_data_dir().map_err(|e| e.to_string())?.join("kronos");
    tauri::async_runtime::spawn_blocking(move || runtime.initialize_at(cache, Some(&app))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn kronos_forecast(app: tauri::AppHandle, state: tauri::State<'_, std::sync::Arc<KronosRuntime>>, id: u64, payload: Value) -> Result<Value, String> {
    if id > 9007199254740991 { return Err("Invalid request ID".into()); }
    validate_payload(&payload)?;
    let runtime = state.inner().clone();
    let cache = app.path().app_data_dir().map_err(|e| e.to_string())?.join("kronos");
    tauri::async_runtime::spawn_blocking(move || runtime.forecast_at(cache, payload, &app)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn kronos_status(state: tauri::State<'_, std::sync::Arc<KronosRuntime>>) -> Value { state.snapshot() }

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::{Arc, OnceLock};

    fn fixture() -> PathBuf {
        static FIXTURE: OnceLock<PathBuf> = OnceLock::new();
        FIXTURE.get_or_init(|| {
            let dir = std::env::temp_dir().join(format!("pia kronos 日本 {}", std::process::id()));
            std::fs::create_dir_all(&dir).unwrap();
            let executable = dir.join(if cfg!(windows) { "fixture.exe" } else { "fixture" });
            assert!(Command::new("rustc").arg(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../runtime/native_fixture.rs")).arg("-o").arg(&executable).status().unwrap().success());
            executable
        }).clone()
    }

    fn runtime(mode: &str) -> KronosRuntime {
        KronosRuntime::for_test(fixture(), mode.to_string(), Duration::from_millis(500))
    }

    #[test]
    fn kronos_concurrent_initialization_owns_one_child() {
        let runtime = Arc::new(runtime("ok"));
        let mut threads = vec![];
        for _ in 0..4 {
            let runtime = runtime.clone();
            threads.push(std::thread::spawn(move || runtime.initialize_at(PathBuf::from("cache 日本"), None).unwrap()));
        }
        for thread in threads { thread.join().unwrap(); }
        assert_eq!(runtime.starts.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert_eq!(runtime.snapshot()["status"], "ready");
        runtime.shutdown();
        assert!(runtime.child.lock().unwrap().is_none());
    }

    #[test]
    fn kronos_bad_output_crash_timeout_settle_and_allow_retry() {
        for mode in ["crash", "invalid", "large", "stall"] {
            let runtime = runtime(mode);
            let start = std::time::Instant::now();
            assert!(runtime.initialize_at(PathBuf::from("cache"), None).is_err(), "{mode}");
            assert!(start.elapsed() < Duration::from_secs(5));
            assert!(runtime.child.lock().unwrap().is_none());
            assert!(runtime.initialize_at(PathBuf::from("cache"), None).is_err());
            assert_eq!(runtime.starts.load(std::sync::atomic::Ordering::SeqCst), 2);
        }
    }

    #[test]
    fn kronos_shutdown_interrupts_waiting_initialization() {
        let runtime = Arc::new(runtime("stall"));
        let waiting = runtime.clone();
        let thread = std::thread::spawn(move || waiting.initialize_at(PathBuf::from("cache"), None));
        while runtime.starts.load(std::sync::atomic::Ordering::SeqCst) == 0 { std::thread::yield_now(); }
        runtime.shutdown();
        assert!(thread.join().unwrap().is_err());
        assert!(runtime.child.lock().unwrap().is_none());
    }

    #[test]
    fn kronos_validates_input_before_transport() {
        let bars: Vec<Value> = (0..12).map(|i| json!({"timestamp":1700000100000u64 + i * 900_000,"open":100,"high":102,"low":99,"close":101,"volume":0})).collect();
        let payload = json!({"symbol":"BTCUSD","timeframe":"15m","cutoffTimestamp":1700000100000u64 + 12 * 900_000,"candles":bars,"pred_len":12,"sample_count":6});
        assert!(validate_payload(&payload).is_ok());
        for field in ["open", "close", "timestamp"] {
            let mut invalid = payload.clone();
            invalid["candles"][0][field] = json!(null);
            assert!(validate_payload(&invalid).is_err());
        }
        for mutate in [
            |p: &mut Value| p["candles"][0]["high"] = json!(98),
            |p: &mut Value| p["candles"][1]["timestamp"] = p["candles"][0]["timestamp"].clone(),
            |p: &mut Value| p["candles"].as_array_mut().unwrap().reverse(),
            |p: &mut Value| p["candles"][0]["timestamp"] = json!(1700000100001u64),
            |p: &mut Value| p["candles"][0]["timestamp"] = json!(1700000100000.5f64),
            |p: &mut Value| p["candles"][0]["timestamp"] = json!(9007199254740992u64),
            |p: &mut Value| p["timeframe"] = json!("2h"),
            |p: &mut Value| p["cutoffTimestamp"] = json!(1700000100000u64 + 12 * 900_000 - 1),
            |p: &mut Value| p["cutoffTimestamp"] = json!(u64::try_from(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()).unwrap() + 120_000),
        ] {
            let mut invalid = payload.clone();
            mutate(&mut invalid);
            assert!(validate_payload(&invalid).is_err(), "{invalid}");
        }
    }
}
