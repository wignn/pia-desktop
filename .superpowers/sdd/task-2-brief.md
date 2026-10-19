# Task 2 Brief: Build External Position Text/CSV Parser Utility

**Files:**
- Create: `pia/src/utils/position-parser.ts`
- Create: `pia/src/utils/position-parser.test.ts`

**Goal:**
Build a resilient parser that parses arbitrary trade position reports, pasted text lines, or CSV files into normalized `PaperPosition` candidate objects, and formats positions for CSV export. DO NOT mention third-party software names (like MT5, MT4, MetaTrader, etc.) in code or comments. Use neutral terminology ("External Positions", "Trade Report", "Position Parser").

**Requirements:**
1. Functions to export from `src/utils/position-parser.ts`:
   - `parsePositionText(text: string, defaultAccountType: 'standard' | 'cent' = 'standard'): ParsePositionsResult`
     - Returns `{ positions: Array<Omit<PaperPosition, 'id' | 'timestamp'> & { ticket?: string }>, errors: string[], totalParsed: number }`.
   - `exportPositionsToCsv(positions: PaperPosition[], accountType: 'standard' | 'cent' = 'standard'): string`
     - Generates CSV string with headers: `Ticket,Symbol,Side,Lots,AccountType,EntryPrice,StopLoss,TakeProfit,OpenTime`
2. Resilience in `parsePositionText`:
   - Handles multi-line strings, CRLF/LF line endings, ignores blank lines and comments (`#` or `//`).
   - Ignores header rows like `Ticket,Symbol,Type,Lots,Open Price,S/L,T/P` or `Symbol Type Volume Price`.
   - Format 1: Table format (comma, tab, or multiple spaces):
     e.g.: `1048291 EURUSD BUY 0.50 1.12250 1.12000 1.12600`
     e.g.: `XAUUSD,SELL,0.10,4180.50,4200.00,4150.00`
   - Format 2: Shorthand text:
     e.g.: `BUY 0.25 BTCUSDT @ 82500 SL 81000 TP 85000`
     e.g.: `EURUSD BUY 0.10 @ 1.12350`
   - Normalized outputs:
     - `symbol`: uppercase trimmed (e.g. `EURUSD`).
     - `side`: `'buy'` or `'sell'`.
     - `size`: positive float (e.g. `0.5`).
     - `entryPrice`: positive float (e.g. `1.1225`).
     - `stopLoss`: optional positive float.
     - `takeProfit`: optional positive float.
     - `ticket`: optional string if ticket number detected.
     - `accountType`: `defaultAccountType` or inferred.
3. Tests in `src/utils/position-parser.test.ts`:
   - Test tabular format with commas, tabs, and spaces.
   - Test shorthand format (`BUY 0.10 BTCUSDT @ 82500`).
   - Test ignoring header lines and blank lines.
   - Test invalid lines reporting meaningful error messages without crashing.
   - Test `exportPositionsToCsv` output format.
4. Verify `bun test src/utils/position-parser.test.ts` passes and `bun x tsc --noEmit` is clean.
5. Commit with message: `feat(trading): create external position text/csv parser utility`.
