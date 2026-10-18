# Task 1 Report: Symbol Logo Resolver & Reusable Component

## Summary
Implemented `<SymbolLogo />` and `getSymbolLogoCandidates` in `src/components/common/SymbolLogo.tsx` with a multi-tier CDN resolver, dual-currency flag badges for Forex pairs, deterministic category fallback styling, and unit test coverage in `src/utils/tv-layout.test.ts`.

## Deliverables
1. **`src/components/common/SymbolLogo.tsx`**:
   - `getSymbolLogoCandidates(symbol: string): string[]`: Resolves candidates in order:
     1. `spothq/cryptocurrency-icons`: `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${coin}.svg`
     2. `nvstly/icons`: `https://cdn.jsdelivr.net/gh/nvstly/icons@main/ticker_icons/${cleanSym}.png`
     3. `ahmeterenodaci/Nasdaq-Stock-Exchange-including-Symbols-and-Logos`: `https://cdn.jsdelivr.net/gh/ahmeterenodaci/Nasdaq-Stock-Exchange-including-Symbols-and-Logos@main/logos/${cleanSym}.png`
   - Base coin extraction for crypto tickers: Handles quote stripping (`USDT`, `USDC`, `BUSD`, `PERP`, `USD`, `EUR`, `/USD`, etc.).
   - Forex detection & dual circular flags: Parses fiat pairs (`EURUSD`, `USDJPY`, etc.) and renders overlapping dual circular badges with `lipis/flag-icons` and fallback currency symbols.
   - Fault-tolerant failover & initial badge fallback: Gracefully advances on load errors (`onError`), falling back to a circular initial badge with deterministic category background hue.
   - Standard size default is 20px with zero layout jitter.

2. **`src/utils/tv-layout.test.ts`**:
   - Added unit test suite covering:
     - Crypto candidate resolution and base coin extraction.
     - Stock candidate resolution.
     - Empty/invalid symbol handling.
     - Single ticker image rendering with candidate CDN URL.
     - Overlapping dual flag rendering for Forex pairs.
     - Fallback initials pill with deterministic category color.
     - Custom size support and empty symbol handling.

## Verification
- `bun test`: 76 passed, 0 failed across 8 files (271 expect assertions).
- `bun x tsc --noEmit`: Clean, 0 type errors.
- `bun run build`: Built production bundle successfully in 786ms.

## Commit
- `61155a6`: `feat: implement SymbolLogo component with multi-tier CDN resolver and fallback`
