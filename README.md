# PIA Terminal

[![Release](https://img.shields.io/github/v/release/wignn/pia-desktop?color=2962ff&label=Release)](https://github.com/wignn/pia-desktop/releases/latest)
[![Tests](https://img.shields.io/badge/tests-205%20passed-26a69a)](https://github.com/wignn/pia-desktop/actions)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-1e222d)](https://github.com/wignn/pia-desktop/releases)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2%20%2B%20Rust-e06c75)](https://tauri.app)

PIA Terminal is a high-performance desktop charting and algorithmic trading workstation built on **Tauri v2**, **Rust**, and **React 19**. It provides low-latency financial visualization, native strategy backtesting via **PiaScript**, simulated paper execution, and real-time global macroeconomic intelligence.

---

## Key Features

### 1. PiaScript Algorithmic Engine
A lightweight, Python-like domain-specific language designed specifically for technical analysis and backtesting. The interpreter runs directly inside native Rust, eliminating JS engine overhead during heavy vector calculations.
* **Built-in Indicators**: `ema()`, `sma()`, `rsi()`, `highest()`, `lowest()`, `crossover()`, `crossunder()`.
* **Integrated Backtester**: Simulates position tracking, fill execution, slippage, and equity curves with performance metrics (Win Rate, Profit Factor, Max Drawdown).
* **Editor IntelliSense**: Zero-dependency embedded editor featuring syntax completions, parameter tooltips, line numbering gutters, and direct chart overlay bindings.

```python
# Example: EMA Trend-Following Strategy
fast = ema(close, 9)
slow = ema(close, 21)

plot(fast, color="#00bcd4", title="Fast EMA")
plot(slow, color="#ff9800", title="Slow EMA")

if crossover(fast, slow):
    buy(1)

if crossunder(fast, slow):
    close()
```

### 2. Low-Latency Financial Charts
* Rendered via **KLineCharts** canvas engine with high-FPS tick rendering.
* Configurable multi-chart grid layouts (single, split vertical, split horizontal, quad grid).
* Extensive drawing tools: Trend Lines, Fibonacci Retracements, Parallel Channels, Pitchforks, and Position Risk/Reward projection boxes.
* Native WebSocket live streaming with sub-millisecond price updates.

### 3. Real-Time Paper Trading & Order Management
* Fully offline-capable simulated trading environment with configurable capital.
* Order types: **Market**, **Limit**, **Stop-Market**, and **Take-Profit / Stop-Loss** brackets.
* Live position management with real-time unrealized PnL calculation against live bid/ask spreads.
* Order history and account balance journaling backed by local SQLite storage.

### 4. Global Macro & Geopolitical Intelligence
* **Macro Map (MapLibre GL)**: Interactive 3D vector globe visualizing sovereign bond yields, central bank rates, geopolitical signals, and supply chain hotspots.
* **Yield Curve Analyzer**: Real-time US Treasury and sovereign yield curve comparison with inversion monitoring.
* **COT Positioning**: Historical CFTC Commitment of Traders breakdown across commercial and non-commercial institutional traders.
* **SEC Filings Wire**: Automated parsing of 10-K, 10-Q, 8-K, and insider transactions.

### 5. Native Background Auto-Updater
* Integrated Tauri v2 updater with cryptographic public key verification (`minisign`).
* Non-blocking background downloads with an in-app download progress notification and one-click restart installation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Desktop Shell** | [Tauri v2](https://tauri.app/) (Rust 2024 edition) |
| **PiaScript Engine** | Native Rust AST evaluator & backtesting simulator (`pia/src-tauri/src/piascript.rs`) |
| **Frontend Framework** | React 19, TypeScript 5.8+, Vite 8 |
| **State Management** | Zustand 5 with selector-level memoization |
| **Charting Engine** | KLineCharts v10 |
| **Geospatial Engine** | MapLibre GL v6 |
| **Local Database** | SQLite via `sql.js` (AES-GCM encrypted persistence) |
| **Styling & HUD** | Custom design tokens optimized for dark-mode trading terminals |

---

## Architecture Overview

```
pia/
├── src-tauri/                 # Rust Native Backend
│   ├── src/
│   │   ├── lib.rs             # Tauri commands & plugin initializations
│   │   ├── main.rs            # Desktop application entrypoint
│   │   └── piascript.rs       # Native PiaScript interpreter & backtester
│   ├── Cargo.toml             # Rust package configuration & dependencies
│   └── tauri.conf.json        # Tauri windowing, security, and updater settings
│
└── src/                       # React 19 Client
    ├── components/
    │   ├── chart/             # KLineCharts containers, overlays, drawing tools
    │   ├── layout/            # TopToolbar, Dock panels, PiaScript editor, HUD bars
    │   ├── macromaps/         # MapLibre GL global macro visualization
    │   ├── modals/            # Symbol search, indicator manager, settings
    │   └── panels/            # Order book, tape, paper trading, COT, intelligence
    ├── services/              # Tauri IPC bridge, auto-updater, market feeds
    ├── stores/                # Zustand stores (market, chart, workspace, updater)
    └── shared/                # TypeScript domain contracts and interfaces
```

---

## Getting Started

### Prerequisites

* **Node.js**: `v20.x` or newer (or [Bun](https://bun.sh/) `v1.2+`)
* **Rust**: `1.80+` with `cargo` installed ([rustup](https://rustup.rs/))
* **Platform Dependencies**:
  * **Windows**: [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and WebView2 (preinstalled on modern Windows 10/11)
  * **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  * **Linux**: `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libxdo-dev`, `libssl-dev`

### Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/wignn/pia-desktop.git
   cd pia-desktop/pia
   ```

2. **Install dependencies**:
   ```bash
   npm install
   # or
   bun install
   ```

3. **Start the development server**:
   ```bash
   npm run tauri dev
   # or
   bun run tauri dev
   ```

### Running Tests

* **Frontend Unit & Integration Tests**:
  ```bash
  npm test
  # or
  npx vitest run
  ```

* **Rust PiaScript & Native Tests**:
  ```bash
  cd src-tauri
  cargo test --lib
  ```

### Production Build

To compile signed production binaries for your current platform:

```bash
npm run tauri build
```

Installers will be generated under `pia/src-tauri/target/release/bundle/`:
* **Windows**: `.msi` and `-setup.exe`
* **macOS**: `.dmg` and `.app`
* **Linux**: `.AppImage`, `.deb`, and `.rpm`

---

## Security & Verification

* All production release bundles are cryptographically signed using `minisign`.
* The public key configured in `tauri.conf.json` verifies update artifacts before any binary replacement occurs on disk.
* Market credentials and API keys are stored in encrypted application data storage and are never committed or exposed over unsecured channels.

---

## License

Private / Proprietary. All rights reserved.
