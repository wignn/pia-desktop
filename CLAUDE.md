# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development & Execution

- `npm run dev`: Start Electron application in development mode with HMR via electron-vite.
- `npm run start`: Preview the built application.

### Typecheck & Linting

- `npm run typecheck`: Run full TypeScript check across both Node and Web targets.
- `npm run typecheck:node`: Check main, preload, and config files against `tsconfig.node.json`.
- `npm run typecheck:web`: Check renderer code against `tsconfig.web.json`.
- `npm run lint`: Lint TypeScript and React files with ESLint (`eslint --cache .`).
- `npm run format`: Format code using Prettier (`prettier --write .`).

_Note: No automated test runner (e.g., Vitest or Jest) is currently configured in `package.json`._

### Build & Package

- `npm run build`: Run typecheck and compile all bundles via electron-vite (`out/`).
- `npm run build:unpack`: Build and unpack into local directory (`electron-builder --dir`).
- `npm run build:win`: Build installer package for Windows.
- `npm run build:mac`: Build installer package for macOS.
- `npm run build:linux`: Build installer package for Linux.

## Architecture & Code Structure

### Electron Multi-Process Model

- **Main Process (`src/main/`)**: Handles Electron application lifecycle, browser window initialization, DevTools shortcut registration, and IPC listeners (`ipcMain`).
- **Preload Script (`src/preload/`)**: Exposes safe IPC APIs (`window.electron`, `window.api`) to renderer via `contextBridge.exposeInMainWorld`. Type definitions for exposed globals live in `src/preload/index.d.ts`.
- **Renderer Process (`src/renderer/`)**: React 19 application bundled with Vite (`@vitejs/plugin-react`), mounted from `src/renderer/index.html` and `src/renderer/src/main.tsx`. The `@renderer/*` alias maps to `src/renderer/src/*`.
- **Packaging Config**: `electron-builder.yml` defines the installer settings and packaging configurations. App icons and OS-specific resources reside in `build/` and `resources/`.

### TypeScript Configuration

Configured using project references from root `tsconfig.json`:

- `tsconfig.node.json`: Handles Node environment files (`electron.vite.config.*`, `src/main/**/*`, `src/preload/**/*`).
- `tsconfig.web.json`: Handles browser/renderer environment files (`src/renderer/src/**/*`) with JSX support and `@renderer/*` path alias.

### Project Domain & Guidelines (from AGENTS.md)

- **Domain**: Desktop financial trading terminal application.
- **Charting Engine**: Strictly use **KLineChart** (do not replace with Lightweight Charts or alternative libraries) to support drawing tools and overlays.
- **Data Feed**: Integrates with `@piaa/sdk` for historical candle data and realtime tick feeds.
- **Design & Persistence**: Dark theme (`#131722`) inspired by TradingView, with structured local persistence for drawing tools, indicator configurations (EMA, SMA, RSI, MACD, Volume), and chart layout state.
