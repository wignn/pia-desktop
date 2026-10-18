# Task 1: Drawing Property Bar Component & Overlay Style Mutation

**Files:**
- Create: `pia/src/components/chart/DrawingPropertyBar.tsx`
- Modify: `pia/src/components/chart/ChartContainer.tsx`
- Test: `pia/src/utils/tv-layout.test.ts`

**Interfaces:**
- Consumes:
  - `selectedOverlayId`: string | null (from ChartContainer state / ref)
  - `onUpdateStyle`: (styles: { color?: string; borderSize?: number; borderStyle?: 'solid' | 'dashed' }) => void
  - `onDelete`: () => void
  - `THEME_TOKENS`: colors, zIndex
- Produces:
  - `<DrawingPropertyBar />`: floating bar placed at top of chart when an overlay is selected.
  - Buttons / controls:
    1. Color palette dropdown / quick pills (Blue `#2962ff`, Green `#089981`, Red `#f23645`, Yellow `#ffb703`, Purple `#9c27b0`, White `#ffffff`)
    2. Stroke width selector: `1px`, `2px`, `3px`
    3. Stroke style selector: `solid`, `dashed`
    4. Delete / Trash button (calls `onDelete`)

**Constraints:**
- Must disappear when overlay is deselected (`selectedOverlayId` becomes null).
- Must call `chart.overrideOverlay({ id: selectedOverlayId, styles: ... })` so styles apply dynamically.
- Zero extra dependencies.
- Pass `bun test src/utils/tv-layout.test.ts` and `bun x tsc --noEmit`.
