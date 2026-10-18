# Task 1 Report: Drawing Property Bar Component & Overlay Style Mutation

**Status:** DONE  
**Commit:** `287a031` (`feat: add floating drawing properties bar and style mutation`)  
**Tests:** `bun test src/utils/tv-layout.test.ts` passed (10 pass, 0 fail), `bun x tsc --noEmit` passed (0 errors)

---

## 1. Overview & Objectives

Implemented the floating `DrawingPropertyBar` toolbar and live overlay styling mutation system for KLineChart drawings in the PIA terminal.

When an overlay (trendline, rectangle, circle, ray, etc.) is clicked on the chart canvas, the floating property bar appears directly above the viewport allowing dynamic customization of:
1. **Quick Color Palette:** Blue (`#2962ff`), Green (`#089981`), Red (`#f23645`), Yellow (`#ffb703`), Purple (`#9c27b0`), White (`#ffffff`).
2. **Stroke Width:** `1px`, `2px`, `3px`.
3. **Stroke Style:** `solid`, `dashed`.
4. **Delete Button:** Deletes the active drawing and dismisses the toolbar.

When the overlay is deselected or removed, the floating bar cleanly unmounts.

---

## 2. Changes Summary

### Created:
- `pia/src/components/chart/DrawingPropertyBar.tsx`
  - Floating horizontal container anchored at `top: 14`, `left: 50%`, `transform: translateX(-50%)`, `zIndex: 40`.
  - Styled with `THEME_TOKENS`, dark theme backdrop, subtle borders, and box shadow.
  - Returns `null` if `selectedId === null`.
  - Exports `DrawingPropertyBarProps`, `DRAWING_PALETTE_COLORS`, `STROKE_WIDTHS`, `STROKE_STYLES`, and `mapOverlayStyles`.

### Modified:
- `pia/src/components/chart/ChartContainer.tsx`
  - Added React state `selectedOverlayId` alongside `selectedOverlayIdRef`.
  - Connected `onSelected` and `onDeselected` overlay callbacks in both drawing creation and symbol restoration routines to update `selectedOverlayId`.
  - Added `handleUpdateOverlayStyle` invoking `chartRef.current?.overrideOverlay` with mapped line, polygon, and circle style payloads.
  - Added `handleDeleteSelectedOverlay` invoking `chartRef.current?.removeOverlay` and resetting `selectedOverlayId`.
  - Integrated `<DrawingPropertyBar />` above chart canvas.
  - Reset `selectedOverlayId` on keydown (Delete/Backspace) and drawing clear signals.
- `pia/src/utils/tv-layout.test.ts`
  - Added unit test suite asserting `mapOverlayStyles` complete and partial payloads for line, polygon, and circle structures.
  - Asserted specification values for `DRAWING_PALETTE_COLORS`, `STROKE_WIDTHS`, and `STROKE_STYLES`.
  - Asserted `DrawingPropertyBar` conditional rendering (`null` when `selectedId` is null, HTML elements present when active).
  - Asserted property change and delete handler invocations.

---

## 3. Verification

```bash
$ bun test src/utils/tv-layout.test.ts
bun test v1.4.0 (34cbb9a40)

 10 pass
 0 fail
 54 expect() calls
Ran 10 tests across 1 file. [101.00ms]

$ bun x tsc --noEmit
# exited with 0
```
