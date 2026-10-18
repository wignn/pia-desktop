# Task 2 Report: Floating Replay Controller Component & Interval Loop

**Status:** DONE  
**Commit:** `2a9f153` (`feat: add floating replay controller with bar-by-bar playback`)  
**Tests:** `bun test src/utils/tv-layout.test.ts` passed (15 pass, 0 fail), `bun test` passed (66 pass, 0 fail), `bun x tsc --noEmit` passed (0 errors), `bun run build` passed

---

## 1. Overview & Objectives

Implemented the floating `ReplayControlBar` toolbar and bar-by-bar historical playback loop in the PIA terminal.

When Replay mode is activated via the TopToolbar Replay button, the floating controller appears at the bottom-center of the chart viewport with:
1. **Header & Status Indicator:** "Bar Replay" label with dynamic pulsing dot (bullish green when playing, accent blue when paused).
2. **Jump to Start:** Rewinds to bar index 1 (`jumpReplayTo(1)`).
3. **Play / Pause Button:** Toggles automated playback (`toggleReplayPlay`), displaying play / pause SVG icons and automatically disabling when reaching the end of available bars.
4. **Step Forward Button:** Advances 1 bar (`stepReplayForward`), advancing historical simulation by one tick.
5. **Speed Selector Pills:** `0.5x` (2000ms), `1x` (1000ms), `2x` (500ms), `5x` (200ms), and `10x` (100ms) with active highlighting via `setReplaySpeed`.
6. **Progress Counter:** Monospace status counter displaying `{replayCurrentIndex} / {replayTotalBars}`.
7. **Exit Replay (X):** Calls `setReplaying(false)` restoring live streaming and resetting engine state.
8. **Automated Interval Timer:** An active `useEffect` runs `setInterval(stepReplayForward, replaySpeedMs)` when `isReplaying && isReplayPlaying`, cleanly clearing the timer on pause, unmount, or when `replayCurrentIndex >= replayTotalBars`.

---

## 2. Changes Summary

### Created:
- `pia/src/components/chart/ReplayControlBar.tsx`
  - Positioned floating at `bottom: 16`, `left: '50%'`, `transform: 'translateX(-50%)'`, `zIndex: 30`.
  - Styled with `THEME_TOKENS`, TradingView dark surface, subtle borders, backdrop blur, and drop shadow.
  - Returns `null` when `isReplaying` is false.
  - Supports props with fallback to `useChartStore` for testing and custom composition.
  - Exports `REPLAY_SPEED_OPTIONS` and `formatReplayProgress`.

### Modified:
- `pia/src/components/chart/ChartContainer.tsx`
  - Destructured `isReplaying` from `useChartStore`.
  - Mounted `<ReplayControlBar />` inside the chart viewport wrapper when `isReplaying` is active.
- `pia/src/components/layout/TopToolbar.tsx`
  - Connected Replay button click handler to `setReplaying(!isReplaying)`.
  - Added explicit active styling (`THEME_TOKENS.colors.accent`, active background tint, and bold weight) when `isReplaying` is true.
- `pia/src/App.tsx` & `pia/src/components/panels/ReplayToolbar.tsx`
  - Replaced legacy duplicate placeholder toolbar with `ReplayControlBar` to eliminate duplicate interval loops.
- `pia/src/utils/tv-layout.test.ts`
  - Added unit test suite covering `REPLAY_SPEED_OPTIONS` (0.5x, 1x, 2x, 5x, 10x), `formatReplayProgress`, `useChartStore` replay actions (play/pause, speed updates, exit reset), and `ReplayControlBar` rendering and handlers.

---

## 3. Verification

```bash
$ bun test src/utils/tv-layout.test.ts
bun test v1.4.0 (34cbb9a40)

 15 pass
 0 fail
 82 expect() calls
Ran 15 tests across 1 file. [83.00ms]

$ bun test
bun test v1.4.0 (34cbb9a40)

 66 pass
 0 fail
 221 expect() calls
Ran 66 tests across 8 files. [100.00ms]

$ bun x tsc --noEmit
# exited with 0 (no errors)

$ bun run build
vite v8.3.4 building client environment for production...
✓ 2106 modules transformed.
✓ built in 3.07s
```
