# Task 5 Brief: Upgrade Bottom Dock "Trading Panel" into Full Institutional Account Manager

**Files:**
- Modify: `pia/src/components/layout/BottomDockPanel.tsx`
- Create/Test: `pia/src/components/layout/BottomDockPanel.test.ts`

**Goal:**
Upgrade the bottom dock "Trading Panel" tab (`activeTab === 'trading'`) from a static placeholder into a full-featured TradingView-grade institutional Account Manager & Positions Table. DO NOT mention third-party software names (like MT5, MT4, MetaTrader).

**Requirements:**
1. In `src/components/layout/BottomDockPanel.tsx`:
   - Connect to `usePaperTradingStore`:
     - `account`, `accountType`, `setAccountType`, `closePosition`, `closeAllPositions`.
   - Connect to `useWorkspaceStore`:
     - `setImportPositionsModalOpen`.
   - Connect to `useMarketStore`:
     - `prices`, `setSymbol`, `currentSymbol`.
   - **Account Metrics Header**:
     - Mode Toggle Pill: `[Standard Account (USD $)]` vs `[Cent Account (USC ¢)]` (calls `setAccountType`).
     - Balance badge: `$100,000.00` (or `10,000,000 ¢`).
     - Equity badge: Balance + Total Unrealized PnL.
     - Unrealized PnL badge: jewel badge with emerald/ruby glow, e.g. `+$1,245.50 (+1.25%)`.
     - Margin Used badge: `$1,250.00`.
     - Free Margin badge: Equity - Margin Used.
     - Margin Level: `(Equity / Margin Used) * 100%` (or `--` if 0).
     - Action Buttons:
       - `[+ Quick Position]` -> opens `setImportPositionsModalOpen(true)` on Quick Entry tab.
       - `[↓ Import Positions]` -> opens `setImportPositionsModalOpen(true)` on Batch Import tab.
       - `[✕ Close All]` -> confirmation prompt or 1-click close all with `closeAllPositions()`.
   - **Positions & Orders Table**:
     - Sticky Header with columns:
       - `Ticket` (or ID snippet)
       - `Symbol` (with `<SymbolLogo symbol={pos.symbol} size={14} />`)
       - `Side` (BUY jewel green / SELL ruby red pill)
       - `Lots` (e.g. `0.50 L`)
       - `Mode` (`Std` / `Cent`)
       - `Entry Price` (formatted with symbol precision)
       - `Mark Price` (live price from `prices[pos.symbol]`)
       - `Stop Loss` (or `--`)
       - `Take Profit` (or `--`)
       - `PnL ($ / ¢)` (jewel tone, green/red with sign)
       - `Action` (`[✕]` close button with red hover)
     - Row Interactions:
       - Clicking row sets active symbol in `useMarketStore.setSymbol(pos.symbol)`.
       - Clicking close button `[✕]` calls `closePosition(pos.id, markPrice)`.
     - Empty State:
       - Sleek institutional empty card: "No open positions. Click + Quick Position or ↓ Import Positions to get started."
2. Tests in `src/components/layout/BottomDockPanel.test.ts`:
   - Test that clicking or rendering the `trading` tab shows account balance, equity, and the standard/cent toggle.
   - Test that active positions are rendered in the table with Symbol, Side, Lots, and Close button.
   - Test that toggling Standard/Cent calls `setAccountType`.
   - Test that clicking the close button calls `closePosition`.
3. Verify `bun test` passes and `bun x tsc --noEmit` is clean.
4. Commit with message: `feat(layout): upgrade bottom dock trading panel into institutional account manager`.
