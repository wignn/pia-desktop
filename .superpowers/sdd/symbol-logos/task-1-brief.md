# Task 1 Brief: Create Symbol Logo Resolver & Reusable Component

## Summary
Implement a high-performance, fault-tolerant `<SymbolLogo />` component in `pia/src/components/common/SymbolLogo.tsx` and unit tests in `pia/src/utils/tv-layout.test.ts`.

## Requirements
1. Resolve logo candidates using:
   - `spothq/cryptocurrency-icons`: `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${coin}.svg`
   - `nvstly/icons`: `https://cdn.jsdelivr.net/gh/nvstly/icons@main/ticker_icons/${cleanSym}.png`
   - `ahmeterenodaci/Nasdaq-Stock-Exchange-including-Symbols-and-Logos`: `https://cdn.jsdelivr.net/gh/ahmeterenodaci/Nasdaq-Stock-Exchange-including-Symbols-and-Logos@main/logos/${cleanSym}.png`
2. For crypto tickers, strip quote currencies (`USDT`, `USD`, `BUSD`, `PERP`, `/USD`, etc.) to find the base coin (e.g. `BTCUSDT` -> `btc`).
3. For Forex pairs (e.g. `EURUSD`, `USDJPY`, `GBPUSD`), display overlapping dual circular flags or currency badges.
4. If image fails or loading fails, failover to subsequent candidate URL, and if all fail or symbol is obscure, gracefully render a rounded pill/circle with 1-2 initial letters and deterministic category background color.
5. Zero layout distortion; standard size default is 20px (circular, object-fit contain/cover).
6. Export:
   - `export const SymbolLogo: React.FC<{ symbol: string; size?: number; style?: React.CSSProperties }>`
   - `export function getSymbolLogoCandidates(symbol: string): string[]`
7. Add tests in `pia/src/utils/tv-layout.test.ts` proving candidate resolution and fallback rendering. Ensure `bun test` passes and `bun x tsc --noEmit` is clean.
