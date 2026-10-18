/**
 * Helpers for Control Panel widgets and symbol resolution
 */

import { TIMEFRAMES } from '@shared/types'
import type { Timeframe } from '@shared/types'

export function resolveControlWidgetSymbol(
  activeSymbol: string | null | undefined,
  catalog: Array<{ symbol: string }> = [],
  fallback = 'XAUUSD'
): string {
  const clean = activeSymbol?.trim().toUpperCase()
  if (clean) {
    if (catalog.length === 0 || catalog.some((s) => s.symbol.toUpperCase() === clean)) {
      return clean
    }
  }
  if (catalog.length > 0 && catalog[0]?.symbol) {
    return catalog[0].symbol.toUpperCase()
  }
  return fallback
}

export function resolveControlWidgetTimeframe(
  value: unknown,
  fallback: Timeframe = '15m'
): Timeframe {
  return typeof value === 'string' && TIMEFRAMES.includes(value as Timeframe)
    ? (value as Timeframe)
    : fallback
}
