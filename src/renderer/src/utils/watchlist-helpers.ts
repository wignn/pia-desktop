/**
 * Helpers for Watchlist validation and multi-list management
 */

export function validateSymbolAgainstCatalog(
  rawSymbol: string | null | undefined,
  catalog: Array<{ symbol: string }> = []
): { valid: boolean; symbol: string } {
  const clean = rawSymbol?.trim().toUpperCase() || ''
  if (!clean) {
    return { valid: false, symbol: '' }
  }

  if (catalog.length === 0) {
    // If catalog is empty/loading, allow well-formed alphanumeric symbol
    const isValidFormat = /^[A-Z0-9._/-]{1,32}$/.test(clean)
    return { valid: isValidFormat, symbol: clean }
  }

  const match = catalog.find((item) => item.symbol.toUpperCase() === clean)
  if (match) {
    return { valid: true, symbol: match.symbol.toUpperCase() }
  }

  return { valid: false, symbol: clean }
}

export function canDeleteWatchlist(watchlists: Array<{ id: string }>): boolean {
  return Array.isArray(watchlists) && watchlists.length > 1
}

export function resolveActiveWatchlistId(
  preferredId: string | null | undefined,
  watchlists: Array<{ id: string }>,
  fallbackId = 'wl-default'
): string {
  if (!watchlists || watchlists.length === 0) {
    return preferredId || fallbackId
  }

  if (preferredId && watchlists.some((w) => w.id === preferredId)) {
    return preferredId
  }

  return watchlists[0]?.id || fallbackId
}
