# Task 2: Floating Replay Controller Component & Interval Loop

**Files:**
- Create: `pia/src/components/chart/ReplayControlBar.tsx`
- Modify: `pia/src/components/chart/ChartContainer.tsx`
- Modify: `pia/src/components/layout/TopToolbar.tsx`
- Test: `pia/src/utils/tv-layout.test.ts`

**Interfaces:**
- Consumes from `useChartStore`:
  - `isReplaying`: boolean
  - `isReplayPlaying`: boolean
  - `replaySpeedMs`: number
  - `replayCurrentIndex`: number
  - `replayTotalBars`: number
  - `setReplaying`: (active: boolean) => void
  - `toggleReplayPlay`: () => void
  - `setReplaySpeed`: (speedMs: number) => void
  - `stepReplayForward`: () => void
  - `jumpReplayTo`: (index: number) => void
- Produces:
  - `<ReplayControlBar />`: floating horizontal bar positioned bottom-center over the chart when `isReplaying` is true.
  - Controls:
    1. Jump / Reset to start button
    2. Play / Pause button (changes icon depending on `isReplayPlaying`)
    3. Step forward 1 bar button
    4. Speed pill / dropdown: options `0.5x` (2000ms), `1x` (1000ms), `2x` (500ms), `5x` (200ms), `10x` (100ms)
    5. Progress text: `Bar {replayCurrentIndex} / {replayTotalBars}`
    6. Exit / Close button (`X`) calling `setReplaying(false)`
  - Automatic playback loop: inside `ReplayControlBar` (or `ChartContainer`), an active `useEffect` runs `setInterval(stepReplayForward, replaySpeedMs)` when `isReplaying && isReplayPlaying`. Stops when `replayCurrentIndex >= replayTotalBars`.
  - In `TopToolbar.tsx`: clicking the Replay button triggers `setReplaying(!isReplaying)`.

**Constraints:**
- Must only show when `isReplaying` is true.
- Zero extra dependencies; use SVG icons and `THEME_TOKENS`.
- Clean interval cleanup on unmount or pause to prevent memory leaks / runaway loops.
- Pass `bun test src/utils/tv-layout.test.ts` and `bun x tsc --noEmit`.
