# Task 3 Brief: Create ImportPositionsModal.tsx for Manual Entry & Batch Import

**Files:**
- Create: `pia/src/components/modals/ImportPositionsModal.tsx`
- Modify: `pia/src/stores/useWorkspaceStore.ts`
- Modify: `pia/src/App.tsx`
- Create/Test: `pia/src/components/modals/ImportPositionsModal.test.ts`

**Goal:**
Build a luxury institutional modal allowing traders to:
1. Quickly add any arbitrary entry position with flexible lots, symbol, side, arbitrary price, and SL/TP ("Quick Entry" tab).
2. Paste external position reports/text or CSV with live preview table and one-click import ("Batch Import" tab).
3. Export current positions to CSV ("Export Positions" tab).
DO NOT mention third-party software names (like MT5, MT4, MetaTrader, etc.).

**Requirements:**
1. In `src/stores/useWorkspaceStore.ts`:
   - Add `isImportPositionsModalOpen: boolean` (default false).
   - Add `setImportPositionsModalOpen: (open: boolean) => void`.
2. In `src/components/modals/ImportPositionsModal.tsx`:
   - High-end obsidian frosted glass styling matching `THEME_TOKENS` (`bgApp`, `bgSurface`, `borderSubtle`, `accent`, `bullish`, `bearish`).
   - Title: "Position Manager & Import".
   - 3 Chamfered Tabs:
     - **Tab 1: Quick Entry**
       - Symbol picker or text input with uppercase normalization (prefilled with current active symbol from `useMarketStore`).
       - Side toggle: `BUY / LONG` (bullish green) vs `SELL / SHORT` (ruby red).
       - Account mode toggle: `Standard (100k)` vs `Cent (1k / ¢)`.
       - Lot size selector: Quick pills (`0.01`, `0.05`, `0.10`, `0.25`, `0.50`, `1.00`, `2.00`, `5.00`) + custom lot input.
       - Entry Price: "Market Price" button (loads current bid/ask) or custom numeric input for any arbitrary price.
       - Stop Loss & Take Profit: inputs with pip helper buttons (+10, +25, +50 pips).
       - Optional Ticket # and Comment.
       - "Add Position" button -> calls `usePaperTradingStore.openPosition(...)` -> closes modal or shows success toast.
     - **Tab 2: Batch Import**
       - Textarea placeholder: "Paste trade position report, statement lines, or CSV rows here...\nExample:\nEURUSD BUY 0.50 1.12250 SL 1.12000 TP 1.12600\nBTCUSDT SELL 0.10 82500".
       - Default account type toggle (`Standard` vs `Cent`).
       - As user types/pastes, calls `parsePositionText(...)` in real time and renders live Preview Table:
         - Columns: Symbol, Side, Lots, Entry Price, SL, TP, Ticket.
       - If there are parsing errors/warnings, shows subtle warning badge.
       - "Import X Positions" button -> calls `usePaperTradingStore.importPositions(parsed.positions)` -> closes modal.
     - **Tab 3: Export**
       - Shows current positions count and preview.
       - "Copy CSV to Clipboard" button and "Download CSV" action.
   - Close button (X) and Escape key listener.
3. In `src/App.tsx`:
   - Import and render `<ImportPositionsModal />` when `isImportPositionsModalOpen` is true (or controlled inside modal).
4. Tests in `src/components/modals/ImportPositionsModal.test.ts`:
   - Test rendering Quick Entry tab with symbol, side, lot pills, and submit button.
   - Test switching to Batch Import tab and displaying parsed preview table when text is entered.
   - Test Export tab.
5. Verify `bun test` passes and `bun x tsc --noEmit` is clean.
6. Commit with message: `feat(trading): add luxury import positions modal for quick & batch entry`.
