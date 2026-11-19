use serde::{Deserialize, Serialize};
use std::sync::{Arc, LazyLock, Mutex};
use tauri::ipc::{Channel, Response};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketTick {
    pub s: String, // symbol
    pub p: f64,    // price
    pub t: i64,    // timestamp in ms
    pub v: f64,    // tick volume / quantity
    pub d: i8,     // direction / side: 1 buy, -1 sell, 0 neutral
}

// Global thread-safe list of active tick subscribers
type TickChannelList = Arc<Mutex<Vec<Channel<MarketTick>>>>;
static TICK_CHANNELS: LazyLock<TickChannelList> =
    LazyLock::new(|| Arc::new(Mutex::new(Vec::new())));

pub fn broadcast_tick(tick: MarketTick) {
    let mut channels = match TICK_CHANNELS.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    channels.retain(|ch| ch.send(tick.clone()).is_ok());
}

pub fn register_tick_channel(channel: Channel<MarketTick>) {
    let mut channels = match TICK_CHANNELS.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    channels.push(channel);
}

/// Binary packing for candles:
/// 6x f64 (48 bytes) per bar (little-endian): [timestamp_ms, open, high, low, close, volume]
pub fn pack_candles_binary(raw_candles: &[serde_json::Value]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(raw_candles.len() * 48);
    for item in raw_candles {
        let ts = item
            .get("timestamp")
            .or_else(|| item.get("time"))
            .and_then(|v| v.as_f64().or_else(|| v.as_i64().map(|i| i as f64)))
            .unwrap_or(0.0);
        let open = item.get("open").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let high = item.get("high").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let low = item.get("low").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let close = item.get("close").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let volume = item
            .get("volume")
            .and_then(|v| v.as_f64().or_else(|| v.as_i64().map(|i| i as f64)))
            .unwrap_or(0.0);

        bytes.extend_from_slice(&ts.to_le_bytes());
        bytes.extend_from_slice(&open.to_le_bytes());
        bytes.extend_from_slice(&high.to_le_bytes());
        bytes.extend_from_slice(&low.to_le_bytes());
        bytes.extend_from_slice(&close.to_le_bytes());
        bytes.extend_from_slice(&volume.to_le_bytes());
    }
    bytes
}

/// Direct binary pack from PiaCandle struct slice
#[allow(dead_code)]
pub fn pack_pia_candles_binary(candles: &[crate::piascript::PiaCandle]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(candles.len() * 48);
    for c in candles {
        let ts = c.timestamp as f64;
        let vol = c.volume.unwrap_or(0.0);

        bytes.extend_from_slice(&ts.to_le_bytes());
        bytes.extend_from_slice(&c.open.to_le_bytes());
        bytes.extend_from_slice(&c.high.to_le_bytes());
        bytes.extend_from_slice(&c.low.to_le_bytes());
        bytes.extend_from_slice(&c.close.to_le_bytes());
        bytes.extend_from_slice(&vol.to_le_bytes());
    }
    bytes
}

#[tauri::command]
pub async fn pia_native_candles_binary(
    symbol: String,
    timeframe: String,
    limit: Option<u32>,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<Response, String> {
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
    let json_val = client
        .get_candles(&symbol, &timeframe, limit)
        .await
        .map_err(|e| e.to_string())?;

    let array_ref = if let Some(arr) = json_val.as_array() {
        arr
    } else if let Some(arr) = json_val.get("candles").and_then(|v| v.as_array()) {
        arr
    } else if let Some(arr) = json_val.get("data").and_then(|v| v.as_array()) {
        arr
    } else {
        return Err("Unexpected candles JSON structure from backend".to_string());
    };

    let packed = pack_candles_binary(array_ref);
    Ok(Response::new(packed))
}

#[tauri::command]
pub fn subscribe_market_ticks(channel: Channel<MarketTick>) -> Result<(), String> {
    register_tick_channel(channel);
    Ok(())
}

#[tauri::command]
pub fn emit_native_market_tick(tick: MarketTick) -> Result<(), String> {
    broadcast_tick(tick);
    Ok(())
}
