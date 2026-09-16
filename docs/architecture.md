# PIA Terminal Architecture Specification

## 1. System Overview

PIA Terminal is an institutional-grade, multi-process desktop trading application inspired by TradingView Desktop. It is built using Electron, React 19, TypeScript, and KLineChart v10, with real-time market data sourced from `@piaa/sdk`.

```
+-------------------------------------------------------------------------+
|                              Electron Main                              |
|                                                                         |
|  +-------------------+  +-------------------+  +---------------------+  |
|  |   PiaClient SDK   |  |   Subscription    |  |    Local SQLite     |  |
|  |  (REST + Realtime)|  |   Manager (Ref)   |  | (sql.js + Autosave) |  |
|  +---------+---------+  +---------+---------+  +----------+----------+  |
|            |                      |                       |             |
|            +----------------------+-----------------------+             |
|                                   |                                     |
|                       Validated IPC Handlers (Zod)                      |
+-----------------------------------+-------------------------------------+
                                    |
                            Preload Bridge
                  (contextBridge, strictly typed API)
                                    |
+-----------------------------------+-------------------------------------+
|                         Renderer Process (React)                        |
|                                                                         |
|  +--------------------+  +--------------------+  +-------------------+  |
|  |  Chart Shell       |  |  Drawing Manager   |  |  Watchlist &      |  |
|  |  (KLineChart v10)  |  |  (Overlays/Undo)   |  |  Calendar Panels  |  |
|  +--------------------+  +--------------------+  +-------------------+  |
|  +--------------------+  +--------------------+  +-------------------+  |
|  |  Zustand Stores    |  |  Reconciliation    |  |  TradingView Dark |  |
|  |  (UI / Workspace)  |  |  Data Engine       |  |  Design Tokens    |  |
|  +--------------------+  +--------------------+  +-------------------+  |
+-------------------------------------------------------------------------+
```

---

## 2. Process Separation & Security Boundaries

### 2.1 Main Process (`src/main/`)

- **Sole custodian of secrets and external network I/O**:
  - Encrypted credential storage via Electron `safeStorage`.
  - Instantiation of `PiaClient` (`@piaa/sdk`).
  - Network streaming, subscription reference counting, and heartbeat monitoring.
  - Local SQLite persistence engine (`sql.js`), handling schema migrations, transactions, and debounced disk write-backs.
- **IPC Safety**:
  - All IPC channel inputs are validated using `zod` schemas.
  - Sender frame validation (`event.senderFrame === mainWindow.webContents.mainFrame`).
  - Raw `ipcRenderer` is never exposed.

### 2.2 Preload Process (`src/preload/`)

- Exposes a minimal, immutable API via `contextBridge.exposeInMainWorld('api', ...)`.
- Type contracts defined in `src/shared/types.ts` and `src/preload/index.d.ts`.
- Prevents any direct access to Node.js `process`, `fs`, or native bindings.

### 2.3 Renderer Process (`src/renderer/`)

- Strict UI layer running React 19 and KLineChart canvas rendering.
- State management separated across discrete Zustand slices:
  - `useMarketStore`: active symbol, timeframe, quotes, connection status.
  - `useChartStore`: active indicators, chart layout, drawing tool selection.
  - `useWatchlistStore`: watchlist symbols, groups, sorting.
  - `useWorkspaceStore`: panel widths, collapsible states, active right tab.
  - `useCalendarStore`: macroeconomic events, filters, date range.
  - `useNewsStore`: news articles, categories, cache.

### 2.4 Shared Contracts (`src/shared/`)

- TypeScript interfaces, Zod validation schemas, and IPC channel names shared between Main, Preload, and Renderer without runtime Node dependencies.

---

## 3. Realtime Market Data & Reconciliation Pipeline

### 3.1 Problem: Race Conditions During Symbol Switch

When switching symbols (e.g., from `XAUUSD` to `BTCUSDT`), slow REST responses from the prior symbol can overwrite the newer symbol's chart data, or early WebSocket ticks can arrive before historical bars finish loading.

### 3.2 Solution: Generation IDs & Incremental Buffering

1. **Generation Counter**: Every symbol/timeframe switch generates a monotonic `requestId`. Any historical REST payload arriving with an outdated `requestId` is silently dropped.
2. **Tick Buffering**: While historical bars are fetching, incoming realtime ticks for the target symbol are queued in a high-speed ring buffer.
3. **Reconciliation**:
   - Historical bars are normalized, validated, and sorted.
   - The buffer is drained against the latest historical bar:
     - If `tick.timestamp` falls within the current open bar, update `close = tick.price`, `high = Math.max(high, tick.price)`, `low = Math.min(low, tick.price)`.
     - If `tick.timestamp` belongs to a subsequent bar period, create and append a new bar.
4. **Resync on Reconnect**: When the WebSocket reconnects after a drop, a lightweight history resync is dispatched to ensure no intermediate bars were missed during the outage.

---

## 4. Drawing Tools & Command History Architecture

### 4.1 Domain Coordinates Persistence

All drawings are stored in domain coordinates:

- `timestamp`: UTC millisecond value.
- `value`: Numerical price level.
  Drawings are never stored as screen pixel coordinates (`x, y`), ensuring perfect positioning across zoom levels, window resizes, timeframe shifts, and app restarts.

### 4.2 Undo/Redo via Command Pattern

Every drawing manipulation emits a discrete command:

- `CreateDrawingCommand(drawing)`
- `MoveDrawingCommand(drawingId, oldPoints, newPoints)`
- `UpdateStyleCommand(drawingId, oldStyle, newStyle)`
- `DeleteDrawingCommand(drawing)`
  A single continuous drag operation on an anchor produces exactly one atomic undo step upon mouse release.

---

## 5. Local Storage & Database Schema

The SQLite database (`userData/pia-terminal.db`) stores user configuration with schema versioning:

- `workspaces`: Tab layouts, split views, active panels.
- `chart_settings`: Symbol, timeframe, zoom range, theme parameters.
- `drawings`: Drawings serialized by symbol and timeframe.
- `indicators`: Active indicators, parameters (periods, colors).
- `watchlists`: User-defined symbol lists and groups.
- `alerts`: Alert threshold configurations and trigger history.
- `paper_accounts`: Virtual balances, simulation positions, and order logs.

Disk writes are debounced (2000ms) during active charting and flushed immediately on `before-quit`.
