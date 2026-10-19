# Task 6 Brief: Upgrade Right Dock PaperTradingPanel.tsx with Standard/Cent Toggle, Arbitrary Entry, and Presets

**Files:**
- Modify: `pia/src/components/panels/PaperTradingPanel.tsx`
- Create/Test: `pia/src/components/panels/PaperTradingPanel.test.ts`

**Goal:**
Upgrade the right-sidebar Paper Trading panel into a luxury institutional trading terminal widget with:
1. Standard vs Cent account toggle pill at the top.
2. Market Execution vs Custom / Arbitrary Entry Price mode.
3. Quick Lot preset pills (`0.01`, `0.05`, `0.10`, `0.25`, `0.50`, `1.00`, `2.00`, `5.00`) + custom input.
4. Pip steppers for SL and TP (+10, +25, +50 pips).
5. Margin / contract info summary (Margin required, Pip value).
6. "Import Positions" button opening `setImportPositionsModalOpen(true, 'import')`.
7. Active positions list with 1-click close and PnL.
DO NOT mention third-party software names (like MT5, MT4, MetaTrader).

**Requirements:**
1. In `src/components/panels/PaperTradingPanel.tsx`:
   - Connect to `usePaperTradingStore`:
     - `account`, `accountType`, `setAccountType`, `openPosition`, `closePosition`, `resetAccount`, `lastExecutedAction`.
   - Connect to `useWorkspaceStore`:
     - `setImportPositionsModalOpen`.
   - Connect to `useMarketStore`:
     - `symbol`, `prices`.
   - **Header Section**:
     - Title: "Paper Trading".
     - Standard / Cent pill toggle:
       - `[Standard (100k)]` vs `[Cent (1k)]` (updates `setAccountType`).
     - Account metrics capsule:
       - Balance ($ or ¢), Equity, Total Unrealized PnL badge.
   - **Order Entry Section**:
     - Execution Mode: `Market` vs `Custom Entry`.
       - If `Market`: uses live ask (for BUY) / bid (for SELL).
       - If `Custom Entry`: shows numeric input for arbitrary entry price.
     - Side selector:
       - `BUY / LONG` button (live ask price displayed)
       - `SELL / SHORT` button (live bid price displayed)
     - Lot Size selector:
       - 8 Quick lot pills (`0.01`, `0.05`, `0.10`, `0.25`, `0.50`, `1.00`, `2.00`, `5.00`).
       - Custom lot size number input.
     - SL / TP inputs:
       - Stop Loss input + pip quick buttons (`+10`, `+25`, `+50`).
       - Take Profit input + pip quick buttons (`+10`, `+25`, `+50`).
     - Order estimate:
       - Margin required (in USD or Cent).
       - Est. Value.
     - Submit Button:
       - High-visibility chamfered jewel button: `BUY 0.50 L @ 1.12350` or `SELL 0.50 L @ 1.12340`.
       - On click: calls `openPosition(...)`.
   - **Positions & Utilities**:
     - Action shortcut: `[↓ Import Positions]` button (opens modal).
     - Positions list:
       - For each open position: Symbol, Side badge, Lots, Entry Price, Live PnL, `[✕]` close button.
     - Reset account button with confirmation.
2. In `src/components/panels/PaperTradingPanel.test.ts`:
   - Test rendering Standard vs Cent account toggle.
   - Test changing lot size via preset pills.
   - Test switching to Custom Entry mode reveals custom price input.
   - Test submitting order invokes `openPosition`.
   - Test clicking `[↓ Import Positions]` invokes `setImportPositionsModalOpen`.
   - Test clicking close on a position invokes `closePosition`.
3. Verify `bun test` passes and `bun x tsc --noEmit` is clean.
4. Commit with message: `feat(panels): upgrade paper trading panel with standard/cent toggle and arbitrary entry`.
