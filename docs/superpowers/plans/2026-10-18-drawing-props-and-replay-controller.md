# Drawing Properties Bar & Floating Replay Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a floating Drawing Properties Bar when overlays are selected, and a floating Replay Controller Bar during historical bar-by-bar playback.

**Architecture:**
- Create lightweight React floating components rendered inside `ChartContainer.tsx` with absolute positioning over the chart canvas.
- `DrawingPropertyBar.tsx`: Listens to `selectedOverlayId`, queries overlay styles, and triggers `chart.overrideOverlay()` for color, stroke width, and dashed style, or removes the overlay.
- `ReplayControlBar.tsx`: Controlled by `useChartStore` replay state (`isReplaying`, `isReplayPlaying`, `replaySpeedMs`, `replayCurrentIndex`, `replayTotalBars`), offering pause/play timer, step bar, speed selector, and exit button.
- Comprehensive unit tests in `src/utils/tv-layout.test.ts`.

**Tech Stack:** React 19, TypeScript, KLineCharts, Zustand (`useChartStore`), Vitest / Bun test.

## Global Constraints
- Zero new NPM dependencies; strictly use existing React, SVG icons, and Zustand store.
- Maintain TradingView visual design tokens (`THEME_TOKENS`).
- Clean TypeScript compilation without any warnings or type errors (`bun x tsc --noEmit`).

## Review Focus
1. Overlay deselection immediately unmounts or hides `DrawingPropertyBar`.
2. Color / width changes on a selected overlay persist and update KLineCharts visually in real time.
3. Replay play loop handles end-of-bars gracefully and stops timer without runaway intervals.
4. Exiting Replay Mode properly restores live bar streaming and resets candleEngine state.
5. High-DPI and resizable canvas boundaries don't clip floating toolbars.

---

### Task 1: Drawing Property Bar Component & Overlay Style Mutation

**Files:**
- Create: `pia/src/components/chart/DrawingPropertyBar.tsx`
- Modify: `pia/src/components/chart/ChartContainer.tsx`
- Test: `pia/src/utils/tv-layout.test.ts`

**Interfaces:**
- Consumes: `selectedOverlayId`, `chartRef` (or override handler), `THEME_TOKENS`
- Produces: `<DrawingPropertyBar />` floating bar component with color pills, stroke width selector, dashed style toggle, and remove button.

- [ ] **Step 1: Write test for drawing property updates in `tv-layout.test.ts`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `DrawingPropertyBar.tsx` and integrate in `ChartContainer.tsx`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Verify with `bun x tsc --noEmit`**

---

### Task 2: Floating Replay Controller Component & Interval Loop

**Files:**
- Create: `pia/src/components/chart/ReplayControlBar.tsx`
- Modify: `pia/src/components/chart/ChartContainer.tsx`
- Modify: `pia/src/components/layout/TopToolbar.tsx` (ensure Replay button toggles `setReplaying`)
- Test: `pia/src/utils/tv-layout.test.ts`

**Interfaces:**
- Consumes: `isReplaying`, `isReplayPlaying`, `replayCurrentIndex`, `replayTotalBars`, `toggleReplayPlay`, `stepReplayForward`, `setReplaying`, `setReplaySpeed` from `useChartStore`.
- Produces: `<ReplayControlBar />` positioned floating at the bottom center of the chart with play/pause, step forward, speed pill, progress counter, and close button.

- [ ] **Step 1: Write test for replay state progression and speed toggles**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `ReplayControlBar.tsx` and wire with `ChartContainer.tsx` & `TopToolbar.tsx`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Verify build with `bun run build`**

---
