# Institutional Paper Trading & External Position Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a luxury TradingView-grade Paper Trading system with Standard (100k) and Cent (1k/micro) account modes, flexible lot sizing anywhere on the chart, arbitrary price entry, external position import/parser, and live chart position line overlays (Entry, TP, SL).

**Architecture:** Extend `usePaperTradingStore` to handle `accountType` ('standard' | 'cent'), contract sizing, arbitrary entry prices, and batch position import. Provide an external position text/CSV parser (`position-parser.ts`) with a luxury `ImportPositionsModal.tsx`. Render live positions directly onto KLineCharts via dynamic price line overlays with live PnL tags. Upgrade both the Bottom Dock "Trading Panel" into a full Account Manager table and the Right Dock `PaperTradingPanel.tsx` with quick-trading lot pills, pip steppers, and arbitrary entry controls.

**Tech Stack:** React 19, TypeScript, Zustand, KLineCharts v10, SQLite persistence (Tauri v2), CSS variables / luxury jewel theme tokens.

**Spec:** Direct user specification for institutional paper trading with Standard vs Cent options, arbitrary lot sizing/entry price placement, external position import without third-party vendor naming, and visual chart integration.

## Global Constraints
- Avoid mentioning any third-party terminal or broker names (e.g. MT5, MetaTrader, etc.) in user-facing UI; use neutral institutional terminology ("External Positions", "Import Positions", "Account Import", "Broker Sync / Report").
- Support both **Standard** (1.00 lot = 100,000 units, USD $) and **Cent** (1.00 lot = 1,000 units, USC / ¢) account modes with instant toggling and accurate PnL calculations.
- Support arbitrary lot sizes (0.01 to 100.0+) and arbitrary entry prices (current market price or any custom price level across all asset types).
- Render live position lines on the active chart with colored lines (Entry, Take Profit, Stop Loss) and real-time PnL badges.
- Keep all unit tests passing (`bun test`) and TypeScript strict mode clean (`bun x tsc --noEmit`).

## Review Focus
1. Cent vs Standard account math: Cent balances ($1 = 100 ¢) and micro lot multipliers (1,000 vs 100,000 units) must calculate margin and PnL correctly without overflow or unit confusion.
2. External position parser resilience: Must parse multiple text formats (space-separated, comma-separated, tab-delimited, and common report columns) gracefully ignoring invalid lines.
3. Chart overlay lifecycle: Position lines on KLineCharts must update when price changes, remove when position closes, and switch cleanly when the user changes symbols.
4. Arbitrary price validation: Custom entry prices must be strictly positive numbers and validate cleanly against SL/TP directions (e.g., BUY SL must be below entry price).
5. Offline / Local persistence: All newly created or imported positions must persist in SQLite via `window.api.paper.saveAccount` and survive app reloads.

---

### Task 1: Update Types & Store for Standard/Cent Accounts and Position Import

**Files:**
- Modify: `src/shared/types.ts:163-181`
- Modify: `src/stores/usePaperTradingStore.ts:1-180`
- Test: `src/stores/usePaperTradingStore.test.ts`

**Interfaces:**
- Consumes: `PriceQuote`, `PaperAccount`, `PaperPosition`
- Produces: `usePaperTradingStore` with `accountType` ('standard' | 'cent'), `setAccountType`, `importPositions`, `updatePosition`, `closeAllPositions`, and updated `openPosition` supporting arbitrary entry prices and lot types.

- [ ] **Step 1: Write the failing test for Standard/Cent account logic and position import**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Update `src/shared/types.ts`**
- [ ] **Step 4: Implement enhanced store methods in `src/stores/usePaperTradingStore.ts`**
- [ ] **Step 5: Run tests to verify they pass**
- [ ] **Step 6: Commit**

---

### Task 2: Build External Position Text/CSV Parser Utility

**Files:**
- Create: `src/utils/position-parser.ts`
- Test: `src/utils/position-parser.test.ts`

**Interfaces:**
- Produces:
  `parsePositionText(text: string, defaultAccountType?: 'standard' | 'cent'): ParsedPositionResult`
  `exportPositionsToCsv(positions: PaperPosition[], accountType: 'standard' | 'cent'): string`

- [ ] **Step 1: Write tests for `position-parser.test.ts`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `src/utils/position-parser.ts`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: Create `ImportPositionsModal.tsx` for Manual Entry & Batch Import

**Files:**
- Create: `src/components/modals/ImportPositionsModal.tsx`
- Modify: `src/stores/useWorkspaceStore.ts`
- Modify: `src/App.tsx`
- Test: `src/components/modals/ImportPositionsModal.test.ts`

**Interfaces:**
- Consumes: `useWorkspaceStore`, `usePaperTradingStore`, `parsePositionText`, `exportPositionsToCsv`
- Produces: Luxury modal with Quick Entry, Batch Import, and Export tabs.

- [ ] **Step 1: Write test for `ImportPositionsModal.test.ts`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Add `isImportPositionsModalOpen` to `useWorkspaceStore`**
- [ ] **Step 4: Implement `src/components/modals/ImportPositionsModal.tsx` and mount in `App.tsx`**
- [ ] **Step 5: Run tests to verify they pass**
- [ ] **Step 6: Commit**

---

### Task 4: Implement Interactive Chart Position Overlays on KLineCharts

**Files:**
- Create: `src/components/chart/position-overlay-sync.ts`
- Modify: `src/components/chart/ChartContainer.tsx`
- Test: `src/components/chart/position-overlay-sync.test.ts`

**Interfaces:**
- Consumes: `chart` instance, `PaperPosition[]`, `PriceQuote`, `currentSymbol`, `accountType`
- Produces: `syncPositionOverlays(...)` managing KLineCharts overlays for Entry, TP, SL lines.

- [ ] **Step 1: Write test for `position-overlay-sync.test.ts`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `src/components/chart/position-overlay-sync.ts`**
- [ ] **Step 4: Integrate into `ChartContainer.tsx`**
- [ ] **Step 5: Run tests to verify they pass**
- [ ] **Step 6: Commit**

---

### Task 5: Upgrade Bottom Dock "Trading Panel" into Full Institutional Account Manager

**Files:**
- Modify: `src/components/layout/BottomDockPanel.tsx`
- Test: `src/components/layout/BottomDockPanel.test.ts`

**Interfaces:**
- Consumes: `usePaperTradingStore`, `useMarketStore`, `useWorkspaceStore`
- Produces: Professional Account Manager table with Standard/Cent toggle, metric badges, and interactive positions table.

- [ ] **Step 1: Write test for BottomDockPanel Trading tab**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement Account Manager in `BottomDockPanel.tsx`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 6: Upgrade Right Dock `PaperTradingPanel.tsx` with Standard/Cent Toggle, Arbitrary Entry, and Presets

**Files:**
- Modify: `src/components/panels/PaperTradingPanel.tsx`
- Test: `src/components/panels/PaperTradingPanel.test.ts`

**Interfaces:**
- Consumes: `usePaperTradingStore`, `useMarketStore`, `useWorkspaceStore`
- Produces: Luxury quick trading panel with Standard/Cent toggle, lot pills, pip steppers, and arbitrary entry price.

- [ ] **Step 1: Write test for `PaperTradingPanel.test.ts`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement enhanced `PaperTradingPanel.tsx`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 7: Full System Verification & Regression Suite

**Files:**
- Test: All unit test suites (`bun test`)
- Typecheck: Full codebase (`bun x tsc --noEmit`)

- [ ] **Step 1: Run complete test suite**
- [ ] **Step 2: Run TypeScript type checker**
- [ ] **Step 3: Verification commit**
