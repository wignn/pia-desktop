# PIA SDK Capabilities & Verified Contracts

**Package**: `@piaa/sdk`  
**Installed Version**: `1.2.0`  
**Source Repository**: [https://github.com/wignn/pia-sdk](https://github.com/wignn/pia-sdk)  
**Verification Date**: 2026-09-14

---

## 1. Overview & Connection Endpoints

The `@piaa/sdk` package provides high-performance access to the PIA Market Intelligence platform, supporting both REST APIs and In-Band authenticated WebSockets.

- **Default REST Gateway**: `https://api-engine.wign.dev`
- **Default WebSocket Gateway**: `wss://api-engine.wign.dev/api/v1/ws`
- **Client Class**: `PiaClient`
- **Authentication**: Dual header transmission (`Authorization: Bearer <key>` and `x-api-key`). In WebSocket streaming, authentication is performed In-Band via challenge-response frame upon initial connect.

```typescript
import { PiaClient } from '@piaa/sdk'

const client = new PiaClient({
  apiKey: 'wi_live_...',
  baseUrl: 'https://api-engine.wign.dev',
  wsUrl: 'wss://api-engine.wign.dev/api/v1/ws',
  timeoutMs: 15_000,
  maxRetries: 3,
  retryDelayMs: 500,
  debug: false
})
```

---

## 2. Verified REST APIs & Schemas

### 2.1 Market Price Snapshot (`client.market.getPrices`)

- **Method**: `getPrices(options?: RequestOptions): Promise<MarketPricesResponse>`
- **Response Schema**:
  ```typescript
  interface MarketPricesResponse {
    total: number
    timestamp: number
    items: MarketPrice[]
  }

  interface MarketPrice {
    symbol: string
    price: number
    bid: number
    ask: number
    high_24h?: number
    low_24h?: number
    change_24h_pct?: number
    volume_24h?: number
    asset_type?: 'fx' | 'crypto' | 'equity' | 'commodity' | 'index' | string
    session_open?: boolean
    timestamp?: number
  }
  ```
- **Tick Semantics**:
  - `price`: Last traded or mid price.
  - `bid` / `ask`: Top of book two-way quotes when available.
  - `change_24h_pct`: 24-hour price change percentage. If reference close is unavailable, this field may be undefined; UI must render `—` rather than fabricated values.

### 2.2 Historical Candlesticks (`client.market.getCandles`)

- **Method**: `getCandles(symbol: string, options?: GetCandlesOptions): Promise<CandleResponse>`
- **Supported Timeframes (`Timeframe`)**:
  `"1m" | "5m" | "15m" | "1h" | "4h" | "1d"`
- **Options**:
  ```typescript
  interface GetCandlesOptions extends RequestOptions {
    timeframe?: Timeframe // default "1h"
    limit?: number // default 100, max typically 1000
    since?: number // UTC timestamp filter start
    until?: number // UTC timestamp filter end
  }
  ```
- **Response Schema**:
  ```typescript
  interface CandleResponse {
    symbol: string
    timeframe: string
    count: number
    candles: Candle[]
  }

  interface Candle {
    time: number // UTC timestamp (seconds or milliseconds)
    open: number
    high: number
    low: number
    close: number
    volume: number
  }
  ```
- **Timestamp & Normalization Rules**:
  - `Candle.time` must be normalized to milliseconds (`time > 1e11 ? time : time * 1000`) for KLineChart consumption.
  - Candles must be strictly deduplicated and sorted in ascending order (`t[i] < t[i+1]`).
  - Strict validation: `low <= Math.min(open, close)` and `high >= Math.max(open, close)`. Non-finite numbers are filtered out.
  - Market gaps are preserved without synthetic candle fabrication.

### 2.3 Economic Calendar (`client.economic.getCalendar`)

- **Method**: `getCalendar(options?: GetCalendarOptions): Promise<EconomicCalendarResponse>`
- **Response Schema**:
  ```typescript
  interface EconomicCalendarResponse {
    total: number
    items: EconomicEvent[]
  }

  interface EconomicEvent {
    id?: string
    event: string
    country: string
    currency?: string
    date: string // ISO format (YYYY-MM-DD)
    time?: string // HH:mm or empty
    actual?: number | null
    forecast?: number | null
    previous?: number | null
    impact?: 'high' | 'medium' | 'low' | string
  }
  ```
- **Semantic Rule**: Unreleased `actual` values are `null` (displayed as `Pending` in the UI, never `0`).

### 2.4 Financial News (`client.news.getNews`)

- **Method**: `getNews(options?: GetNewsOptions): Promise<NewsFeedResponse>`
- **Response Schema**:
  ```typescript
  interface NewsFeedResponse {
    total: number
    items: NewsArticle[]
  }

  interface NewsArticle {
    id: string
    title: string
    summary: string
    url: string
    source: string
    symbols?: string[]
    published_at: string
  }
  ```
- **Safety**: Remote URLs are opened only via desktop system browser with strict protocol allowlisting (`http:`, `https:`).

---

## 3. Verified Realtime WebSocket Streaming

- **Client Property**: `client.realtime` (`RealtimeClient` extending `TypedEventEmitter`)
- **Lifecycle Methods**:
  - `connect()`: Initiates socket connection and in-band authentication.
  - `subscribe(symbols: string | string[])`: Adds symbol(s) to active subscription set.
  - `unsubscribe(symbols: string | string[])`: Removes symbol(s) from subscription set.
  - `disconnect()`: Cleanly closes socket and halts automatic reconnection.
  - `getState()`: Returns `"DISCONNECTED" | "CONNECTING" | "AUTHENTICATING" | "AUTHENTICATED" | "CLOSING"`.
- **Events**:
  - `connect`: Socket established.
  - `authenticated`: Payload `{ user_id?: string, plan?: string, ws_connections_max?: number }`.
  - `tick`: Payload `MarketPrice` with updated price/bid/ask.
  - `snapshot`: Array of current market prices.
  - `disconnect`: Payload `{ code: number, reason: string, wasClean: boolean }`.
  - `error`: Emitted on transport or protocol errors.

---

## 4. Rate Limiting, Retry & Resilience

- **Rate Limit Tracking**: Monitored via `client.getRateLimitInfo()` (`limit`, `remaining`, `resetSeconds`, `dailyLimit`, `dailyRemaining`).
- **RateLimitError**: Carries `retryAfterSeconds`.
- **Automatic Reconnection**:
  - Managed by `RealtimeClient` with backoff.
  - Application layer performs history resync on reconnect to prevent candlestick gaps caused during socket disconnection.
- **Reference Counting**: Multiple components or alert monitors subscribing to the same symbol share a single SDK subscription handle to avoid duplicate network load.

---

## 5. Runtime Access & Credential Handling

- **Live Mode**: Requires valid API key stored via OS secure storage (Electron `safeStorage`) in production or encrypted app data.
- **Unauthenticated / Onboarding State**:
  - Clearly shows connection status: `Disconnected (No API Key)`.
  - Presents a setup modal for user to configure their key.
  - Does NOT display mock fixtures as live data.
