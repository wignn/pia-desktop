# PIA Terminal Progress Tracking

## Milestone Implementation Status

### Completed Milestones

#### [x] M0: Security, Architecture & Persistence Foundation

- **Electron Security Constraints**:
  - `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` for preload compatibility with Node IPC bridge.
  - Strict Content Security Policy (CSP) blocking unsafe-eval, inline remote script execution, and restricting font/connect sources.
  - IPC navigation filtering: `will-navigate` and `setWindowOpenHandler` strictly blocked or delegated to sanitized browser launch.
  - OS credential storage with Electron `safeStorage` (with fallbacks to encrypted session store; never storing plaintext secrets or bundling `.env` in installers).
- **SQLite Database (`sql.js`)**:
  - In-memory Wasm SQLite engine persisting to `app.getPath('userData')/pia-terminal.db`.
  - Schema for drawings, indicator configurations, watchlists, economic calendar cache, price alerts, and paper trading accounts.
  - Automatic debounced writeback (1500ms) with synchronous disk flush on `before-quit`.
- **Theme & Token Foundation**:
  - TradingView dark palette (`#131722`, `#1e222d`, `#2a2e39`, `#2962ff`, `#089981`, `#f23645`).

#### [x] M1: Chart Engine & Market Data Pipeline

- **KLineChart v10 Integration**:
  - Embedded canvas charting strictly powered by `klinecharts` v10.0.3.
  - Full support for candlestick, hollow candlestick, line, and area chart styles.
  - Multi-timeframe bar management (`1m`, `5m`, `15m`, `1h`, `4h`, `1d`, `1w`).
- **Data Pipeline & Candle Normalization Engine**:
  - Data loader architecture (`getBars`, `subscribeBar`, `unsubscribeBar`).
  - Strict timestamp normalization (seconds to UTC milliseconds) and chronological sorting.
  - Deduplication and generation-counter concurrency tracking preventing race conditions during fast symbol/timeframe switches.
  - In-flight tick buffering during historical bar fetches.
  - Dynamic fallback between `@piaa/sdk` provider and synthetic market simulator when unconfigured or offline.
- **Watchlist Panel**:
  - Multi-asset monitoring (Crypto, Forex, Metals, Commodities, Indices).
  - Real-time tick animations, net change, percent change, high/low spread, and click-to-switch symbol action.

#### [x] M2: Domain-Coordinate Drawing System

- **Pixel-to-Domain Coordinate Transformation**:
  - Overlays store domain points `{ timestamp: number, value: number }` rather than screen pixels.
  - Full visual stability across chart panning, zooming, window resizing, and timeframe changes.
  - Tools supported: Trend Segment, Ray Line, Horizontal Straight Line, Parallel Channel, Fibonacci Retracement, Freehand Brush, and Simple Text Annotation.
  - Protected by `isClearingForSymbolSwitchRef` during symbol switches to prevent premature SQLite deletion.

#### [x] M3: Technical Indicators System

- **Indicator Suite**:
  - Trend indicators: Moving Averages (SMA, EMA).
  - Oscillators: Relative Strength Index (RSI), Moving Average Convergence Divergence (MACD).
  - Volume: Sub-pane volume bars color-coded by bar direction.
- **Customizable Configuration**:
  - Configurable periods, signal lengths, and stroke colors.
  - Persistent indicator state stored in local SQLite database.

#### [x] M4: Macro Intelligence (Calendar & News)

- **Economic Calendar**:
  - Real-time events classified by high/medium/low macroeconomic impact, country flag codes, actual vs forecast vs prior figures.
- **Financial News Feed**:
  - Multi-source financial market headlines with category filters.
  - Safe external URL opening via sanitized IPC `shell.openExternal` verifying `http:` and `https:` allowlists.

#### [x] M5: Replay Engine, Price Alerts & Paper Trading Simulation

- **Historical Bar Replay**:
  - Visual backtesting simulation with Play, Pause, Step Forward, Speed control (1x, 2x, 5x, 10x), and Replay Point selection.
  - Slices candle bars to replay cutoff index and pushes stepped ticks into KLineChart's live subscriber.
- **Local Price Alerts Engine**:
  - Persistent SQLite storage for target price alerts (`above`, `below`, `cross`).
  - Real-time tick evaluation on every incoming quote.
  - Web Audio API synthesized alert chimes (no external assets needed).
  - Floating triggered alert toast banners with auto-dismiss and direct deletion controls.
- **Paper Trading Simulation Engine**:
  - Complete portfolio tracking: Cash Balance, Margin Invested, Mark-to-Market Valuations, and Total Unrealized/Realized PnL.
  - BUY / SELL market order execution with live price verification and balance constraints.
  - Optional automated Stop Loss (SL) and Take Profit (TP) trigger execution evaluated against streaming ticks.
  - Account reset capabilities to initial default balances ($100,000.00).

#### [x] M6: @piaa/sdk v1.3.2 Upgrade & Multi-Asset Catalog Discovery

- **SDK v1.3.2 Integration**:
  - Upgraded to `@piaa/sdk@1.3.2`.
  - Implemented multi-asset catalog discovery using `client.market.getSymbols({ asset_type: 'crypto' })` and `client.market.getPrices()`.
  - Discovers and tracks all 105 platform assets across Stocks, Indices, Forex, Commodities, Metals, and Crypto.
- **Enhanced Watchlist & Symbol Search**:
  - Multi-asset category filter tabs (`All`, `Stocks`, `Indices`, `Forex`, `Commodities`, `Metals`, `Crypto`, `My Watchlist`).
  - Instant live filter and custom watchlist pinning with star toggle (`★`/`☆`).
  - Dynamic price precision per asset class (Forex, JPY pairs, Commodities, Equities, Crypto).
- **Historical Viewport Stability**:
  - Fixed chart snapping back to newest candle on left scroll by isolating replay reset triggers from DataLoader historical pagination.
- **Dual-Theme Support**:
  - TradingView Dark (`#131722`) and Light (`#ffffff` / `#f0f3fa`) modes with live canvas restyling.

---

### Verification Results

- `npm run typecheck:node`: 0 errors
- `npm run typecheck:web`: 0 errors
- `npm run lint`: 0 errors, 0 warnings
- `npm run build`: Success (Main, Preload, and Renderer bundled cleanly in under 4 seconds)
