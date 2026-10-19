# Task 1 Brief: Update Types & Store for Standard/Cent Accounts and Position Import

**Files:**
- Modify: `pia/src/shared/types.ts:163-181`
- Modify: `pia/src/stores/usePaperTradingStore.ts:1-180`
- Create/Test: `pia/src/stores/usePaperTradingStore.test.ts`

**Goal:**
Support both 'standard' (USD $, 1.0 lot = 100k units for forex) and 'cent' (USC ¢, 1.0 lot = 1,000 micro units) account modes, arbitrary entry prices, lot presets, and batch position importing with SQLite persistence.

**Requirements:**
1. In `src/shared/types.ts`:
   - `PaperPosition`: add `accountType?: 'standard' | 'cent'`, `ticket?: string`, `comment?: string`, `lotType?: 'standard' | 'cent'`, `source?: 'manual' | 'import'`.
   - `PaperAccount`: add `accountType?: 'standard' | 'cent'`.
2. In `src/stores/usePaperTradingStore.ts`:
   - State property: `accountType: 'standard' | 'cent'` (default 'standard').
   - Action: `setAccountType(type: 'standard' | 'cent')`.
   - Update `openPosition`:
     - Allow optional `ticket?: string`, `comment?: string`, `accountType?: 'standard' | 'cent'`, `source?: 'manual' | 'import'`.
     - Allow any positive `price` (arbitrary entry price).
     - Margin check: In standard mode notional = size * price (or size * 100k / leverage); in cent mode margin is calculated in USC. Keep margin requirement check reasonable.
   - Action: `importPositions(positions: Array<{ symbol: string; side: 'buy' | 'sell'; size: number; price: number; stopLoss?: number; takeProfit?: number; accountType?: 'standard' | 'cent'; ticket?: string; comment?: string }>)`:
     - Generates IDs if missing (`pos_import_${Date.now()}_...`).
     - Prepends/appends all valid positions to `account.positions`.
     - Calls `window.api.paper.saveAccount(updatedAccount)`.
     - Returns `{ success: boolean, count: number, error?: string }`.
   - Action: `updatePosition(id: string, updates: { stopLoss?: number; takeProfit?: number; entryPrice?: number; size?: number })`:
     - Updates the specific position in `account.positions` and saves to database.
   - Action: `closeAllPositions(symbol?: string)`:
     - Closes all positions (or only matching `symbol` if provided) using current prices or entry prices.
3. Test file `src/stores/usePaperTradingStore.test.ts`:
   - Mock `window.api.paper.getAccount` and `window.api.paper.saveAccount`.
   - Test toggling account type.
   - Test opening position with arbitrary entry price.
   - Test importing positions.
   - Test updating position SL/TP.
   - Test closing all positions.
   - Ensure `bun test src/stores/usePaperTradingStore.test.ts` passes.
