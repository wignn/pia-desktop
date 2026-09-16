# Implementation Plan & Milestone Roadmap

## Milestone Overview & Acceptance Gates

### M0 — Audit, Security & Infrastructure Foundations

- [x] Audit `@piaa/sdk` v1.2.0 and `klinecharts` v10.0.3 contracts.
- [x] Document SDK capabilities in `docs/sdk-capabilities.md`.
- [x] Design architecture and security boundaries in `docs/architecture.md`.
- [ ] Implement secure credential storage in Main (Electron `safeStorage` with fallback).
- [ ] Initialize SQLite database engine (`sql.js`) with versioned migrations.
- [ ] Set up validated IPC bridge using Zod schemas.
- [ ] Configure TradingView-inspired dark design tokens (`#0f0f0f` / `#171717` / `#2b2b2b`).
- **Gate M0**: Application launches, window loads securely with `contextIsolation`, typecheck & lint pass, zero credentials leaked to renderer.

### M1 — Realtime & Historical Charting Engine

- [ ] Implement `PiaProvider` adapter in Main process with connection pooling and subscription reference counting.
- [ ] Build historical candle fetcher with timestamp normalization (UTC ms), sorting, and strict OHLC validation.
- [ ] Implement generation ID tracking to prevent race conditions on fast symbol/timeframe switching.
- [ ] Build incremental candle reconciliation buffer for incoming realtime ticks.
- [ ] Integrate KLineChart v10 in Renderer with TradingView dark styles, crosshair, price scale, and time scale.
- [ ] Build top chart toolbar (symbol search, timeframe switcher, chart styles, full screen).
- [ ] Build right watchlist panel with live price, bid/ask, 24h change, and search filtering.
- **Gate M1**: Switching symbols rapidly never corrupts data; realtime ticks seamlessly update the active candlestick without React re-render lag; reconnection automatically resyncs history.

### M2 — Core Drawing Tools Engine

- [ ] Implement Left Drawing Toolbar (Cursor, Crosshair, Horizontal Line, Horizontal Ray, Trend Line, Ray, Extended Line, Vertical Line, Rectangle Zone, Text Note, Arrow).
- [ ] Support drawing selection, anchor point dragging, style editing (color, stroke width, dashed/solid).
- [ ] Implement Command History (Undo/Redo) with atomic drag steps.
- [ ] Serialize drawings in domain coordinates (timestamp, price) and persist into SQLite by `symbol` and `timeframe`.
- **Gate M2**: Drawings can be created, moved, edited, undone/redone, and restored reliably across app restarts on the exact same price/time coordinates.

### M3 — Advanced Drawing Tools & Visual Polish

- [ ] Implement Fibonacci Retracement with customizable ratio levels (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0).
- [ ] Implement Long Position & Short Position tools with dynamic Risk/Reward calculation, stop loss, and take profit zones.
- [ ] Implement Parallel Channel & Ruler measurement tools.
- [ ] Implement Magnet/Snap to OHLC, Lock All, Hide All, and Object Tree manager.
- [ ] Refine desktop layout dimensions to match reference screenshots (40px top bar, 48px left toolbar, 320px right watchlist, 28px bottom status bar).
- **Gate M3**: Advanced overlays render smoothly during pan/zoom; magnet snaps accurately to bar extremes; object tree enables granular selection and deletion.

### M4 — Indicators, Economic Calendar & News

- [ ] Implement Indicator Manager: EMA (20/50/200), SMA, Bollinger Bands, RSI, MACD, Volume in sub-panes.
- [ ] Build Economic Calendar panel matching reference screenshot 2 (weekly filter, impact tags, actual vs forecast vs prior, country flags).
- [ ] Build Financial News feed panel with safe external links and category filtering.
- [ ] Implement layout autosave and multi-tab workspace persistence.
- **Gate M4**: Indicators toggle without chart reload; calendar and news render cleanly with loading/empty/error states; non-released actuals show as "Pending".

### M5 — Local Alerts, Replay Mode & Multi-Chart Layout

- [ ] Implement Local Price Alerts (Price Crossing, Above, Below) with desktop native notifications and cooldowns.
- [ ] Implement Bar Replay engine with historical slice playback, speed controls, and zero forward-data leakage.
- [ ] Implement Multi-Chart Grid (1, 2, 4 charts) with shared subscription handles.
- **Gate M5**: Alerts fire reliably on live ticks; replay strictly isolates historical state from indicators; multi-chart shares subscriptions without duplicate network load.

### M6 — Paper Trading Simulation & Packaging

- [ ] Implement Paper Trading engine: simulated orders, virtual balance, positions, fill log.
- [ ] Build Collapsible Bottom Panel for active positions, order history, and account summary.
- [ ] Verify packaging via `electron-builder` on Windows.
- **Gate M6**: Fully functional packaged application runs offline/online, with clean onboarding for first-time users.
