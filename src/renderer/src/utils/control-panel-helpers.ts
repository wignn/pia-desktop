/**
 * Helpers for Control Panel widgets and symbol resolution
 */

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
