# Task 4 Brief: Implement Interactive Chart Position Overlays on KLineCharts

**Files:**
- Create: `pia/src/components/chart/position-overlay-sync.ts`
- Modify: `pia/src/components/chart/ChartContainer.tsx`
- Create/Test: `pia/src/components/chart/position-overlay-sync.test.ts`

**Goal:**
Render live visual position lines on the active chart for any open positions of the current symbol:
1. **Entry Price Line**: Solid line (cyan/blue or bullish green/bearish red) across the chart at `entryPrice`, with a badge indicating Side, Lots, Entry Price, and Live PnL in USD or Cent (e.g. `[BUY 0.50 L @ 1.12350 | +$45.20 (+18.2 pips)]`).
2. **Take Profit (TP) Line**: Emerald dashed line at `takeProfit` with badge `[TP 1.12800 | +$250.00]`.
3. **Stop Loss (SL) Line**: Ruby dashed line at `stopLoss` with badge `[SL 1.11900 | -$180.00]`.
4. Overlays update in real time when live ticks update `prices`, and are removed cleanly when positions close or symbol changes.

**Requirements:**
1. In `src/components/chart/position-overlay-sync.ts`:
   - Export `syncPositionOverlays`:
     ```ts
     export interface PositionOverlaySyncParams {
       chart: Chart | null
       positions: PaperPosition[]
       currentSymbol: string | null
       prices: Record<string, PriceQuote>
       accountType: 'standard' | 'cent'
       onClosePosition?: (positionId: string) => void
     }
     export function syncPositionOverlays(params: PositionOverlaySyncParams, activeOverlayIdsRef: { current: Set<string> }): void
     export function clearPositionOverlays(chart: Chart | null, activeOverlayIdsRef: { current: Set<string> }): void
     ```
   - Logic:
     - Filter `positions` where `pos.symbol === currentSymbol`.
     - For each position:
       - Entry overlay ID: `pos_entry_${pos.id}`
       - TP overlay ID: `pos_tp_${pos.id}` (if `pos.takeProfit`)
       - SL overlay ID: `pos_sl_${pos.id}` (if `pos.stopLoss`)
     - Calculate live PnL & pip difference against `prices[currentSymbol]?.price`:
       - If `accountType === 'cent'`: format as `+1,250 ¢` or `-$450 ¢`.
       - If `accountType === 'standard'`: format as `+$45.20` or `-$18.50`.
     - Uses `chart.createOverlay({ name: 'priceLine', id: ..., points: [{ value: price }], styles: ... })`.
       - KLineCharts `priceLine` style options:
         - Line: `styles.line.color`, `styles.line.size`, `styles.line.style` ('solid' | 'dashed').
         - Text / tag: `styles.text.color`, `styles.text.size`, `styles.text.family`.
     - If overlay already exists on chart, update or recreate so label and PnL stay synced with live ticks.
     - Remove any previously tracked overlay IDs that are no longer in the filtered set using `chart.removeOverlay({ id })`.
2. In `src/components/chart/ChartContainer.tsx`:
   - Keep a `positionOverlayIdsRef = useRef<Set<string>>(new Set())`.
   - In `useEffect` listening to `positions`, `prices`, `symbol`, `accountType`:
     - Calls `syncPositionOverlays(...)`.
   - On cleanup/unmount or symbol switch, calls `clearPositionOverlays(...)`.
3. In `src/components/chart/position-overlay-sync.test.ts`:
   - Mock chart with `createOverlay` and `removeOverlay`.
   - Test creating Entry, TP, and SL overlays for matching positions.
   - Test that non-matching symbol positions are ignored.
   - Test overlay cleanup when position is closed or symbol changes.
   - Test formatting of Standard vs Cent PnL tags.
4. Verify `bun test` passes and `bun x tsc --noEmit` is clean.
5. Commit with message: `feat(chart): render live position, TP, and SL lines with real-time PnL badges`.
