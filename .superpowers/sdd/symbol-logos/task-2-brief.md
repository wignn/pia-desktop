# Task 2 Brief: Integrate Symbol Logos into Top Toolbar, Watchlist, Search Modal & Chart Legend

## Summary
Integrate the newly created `<SymbolLogo />` component into all 4 core TradingView areas:
1. `pia/src/components/layout/TopToolbar.tsx`: Display next to the active symbol button.
2. `pia/src/components/panels/WatchlistPanel.tsx`: Display on the left of each ticker symbol in the table row.
3. `pia/src/components/modals/SymbolSearchModal.tsx`: Display on each search item row before the ticker text.
4. `pia/src/components/chart/ChartLegend.tsx`: Display before the symbol name in the top-left chart legend.

## Interfaces
- Consumes: `import { SymbolLogo } from '../common/SymbolLogo'` (or appropriate relative path)
- `<SymbolLogo symbol={symbol} size={16 | 18 | 20} />`

## Requirements
1. **TopToolbar**:
   - In the symbol trigger button, place `<SymbolLogo symbol={symbol} size={18} />` right before the symbol name text.
2. **WatchlistPanel**:
   - In each watchlist row, render `<SymbolLogo symbol={item.symbol} size={18} />` at the start of the symbol cell, aligned with the ticker text and description.
3. **SymbolSearchModal**:
   - In each result item, render `<SymbolLogo symbol={item.symbol} size={20} />` to the left of the ticker text.
4. **ChartLegend**:
   - In the legend bar, render `<SymbolLogo symbol={symbol} size={16} />` before the bold symbol ticker.
5. **Testing**:
   - Add unit tests in `src/utils/tv-layout.test.ts` verifying that `TopToolbar`, `WatchlistPanel`, `SymbolSearchModal`, and `ChartLegend` render with `<SymbolLogo />`.
   - Run `bun test`, `bun x tsc --noEmit`, and `bun run build` to verify clean build without any regressions or warnings.
6. Commit changes with clear message.
