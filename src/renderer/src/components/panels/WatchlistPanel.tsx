import React, { useState, useEffect, useMemo } from 'react'
import { useWatchlistStore } from '../../stores/useWatchlistStore'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'
import type { AssetCategory, SymbolInfo } from '@shared/types'

type WatchlistCategoryFilter = 'all' | AssetCategory | 'custom'

const CATEGORY_LABELS: { id: WatchlistCategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'indices', label: 'Indices' },
  { id: 'forex', label: 'Forex' },
  { id: 'commodities', label: 'Commodities' },
  { id: 'metals', label: 'Metals' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'custom', label: 'My Watchlist' }
]

export const WatchlistPanel: React.FC = () => {
  const {
    watchlists,
    activeListId,
    loadWatchlists,
    addSymbolToActiveList,
    removeSymbolFromActiveList
  } = useWatchlistStore()
  const { symbol: currentSymbol, setSymbol, symbols: marketSymbols, prices } = useMarketStore()

  const [activeCategory, setActiveCategory] = useState<WatchlistCategoryFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [newSymbolInput, setNewSymbolInput] = useState('')

  useEffect(() => {
    loadWatchlists()
  }, [loadWatchlists])

  const activeGroup = watchlists.find((w) => w.id === activeListId) || watchlists[0]

  // Only display symbols returned by the live PIA catalog.
  const allCatalogSymbols = useMemo(() => {
    const map = new Map<string, SymbolInfo>()
    for (const item of marketSymbols) {
      if (!map.has(item.symbol)) map.set(item.symbol, item)
    }
    return Array.from(map.values())
  }, [marketSymbols])

  // Symbols to display based on category filter
  const displayedSymbols = useMemo(() => {
    let baseList: Array<{
      symbol: string
      name?: string
      category?: AssetCategory
      precision?: number
    }> = []

    if (activeCategory === 'custom') {
      const customSymbols = activeGroup?.symbols || []
      const catalogMap = new Map(allCatalogSymbols.map((s) => [s.symbol, s]))
      baseList = customSymbols.map((sym) => {
        const found = catalogMap.get(sym)
        return {
          symbol: sym,
          name: found?.name,
          category: found?.category,
          precision: found?.pricePrecision
        }
      })
    } else if (activeCategory === 'all') {
      baseList = allCatalogSymbols.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        category: s.category,
        precision: s.pricePrecision
      }))
    } else {
      baseList = allCatalogSymbols
        .filter((s) => s.category === activeCategory)
        .map((s) => ({
          symbol: s.symbol,
          name: s.name,
          category: s.category,
          precision: s.pricePrecision
        }))
    }

    if (!searchQuery.trim()) return baseList

    const q = searchQuery.trim().toLowerCase()
    return baseList.filter(
      (item) =>
        item.symbol.toLowerCase().includes(q) || (item.name && item.name.toLowerCase().includes(q))
    )
  }, [activeCategory, activeGroup, allCatalogSymbols, searchQuery])

  const isCustomBookmarked = (sym: string): boolean => {
    return activeGroup?.symbols.includes(sym) ?? false
  }

  const handleToggleBookmark = (sym: string, e: React.MouseEvent): void => {
    e.stopPropagation()
    if (isCustomBookmarked(sym)) {
      removeSymbolFromActiveList(sym)
    } else {
      addSymbolToActiveList(sym)
    }
  }

  const handleAddCustomSymbol = (e: React.FormEvent): void => {
    e.preventDefault()
    const clean = newSymbolInput.trim().toUpperCase()
    if (!clean) return
    addSymbolToActiveList(clean)
    setNewSymbolInput('')
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        fontSize: 12
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 12px 6px 12px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: THEME_TOKENS.colors.textBright }}>
              Watchlist
            </span>
            <span
              style={{
                fontSize: 10,
                color: THEME_TOKENS.colors.textSecondary,
                backgroundColor: THEME_TOKENS.colors.bgSurfaceHover,
                padding: '2px 6px',
                borderRadius: 4,
                fontWeight: 600
              }}
            >
              {displayedSymbols.length}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>Source:</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: THEME_TOKENS.colors.accent,
                backgroundColor: THEME_TOKENS.colors.bgApp,
                border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
                padding: '1px 5px',
                borderRadius: 3
              }}
            >
              @piaa/sdk
            </span>
          </div>
        </div>

        {/* Category Pills */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            overflowX: 'auto',
            paddingBottom: 2,
            scrollbarWidth: 'none'
          }}
        >
          {CATEGORY_LABELS.map((cat) => {
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={(): void => setActiveCategory(cat.id)}
                className={`tv-btn ${isActive ? 'active' : ''}`}
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  fontWeight: isActive ? 600 : 400
                }}
              >
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Search Filter & Add Input */}
      <div
        style={{
          padding: '6px 12px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          gap: 6
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            backgroundColor: THEME_TOKENS.colors.bgApp,
            border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
            borderRadius: 4,
            padding: '4px 8px',
            gap: 6
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            color={THEME_TOKENS.colors.textSecondary}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={
              activeCategory === 'custom'
                ? 'Filter or add symbol...'
                : `Filter ${displayedSymbols.length} symbols...`
            }
            value={activeCategory === 'custom' ? newSymbolInput || searchQuery : searchQuery}
            onChange={(e): void => {
              setSearchQuery(e.target.value)
              if (activeCategory === 'custom') {
                setNewSymbolInput(e.target.value)
              }
            }}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              color: THEME_TOKENS.colors.textPrimary,
              fontSize: 11,
              outline: 'none'
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={(): void => {
                setSearchQuery('')
                setNewSymbolInput('')
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: THEME_TOKENS.colors.textSecondary,
                padding: 0,
                fontSize: 10
              }}
            >
              ✕
            </button>
          )}
        </div>

        {activeCategory === 'custom' && newSymbolInput.trim() && (
          <button
            type="button"
            onClick={handleAddCustomSymbol}
            className="tv-btn active"
            style={{ padding: '3px 8px', fontSize: 11, fontWeight: 600 }}
          >
            Add
          </button>
        )}
      </div>

      {/* Table Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr 1fr 24px',
          padding: '6px 12px',
          color: THEME_TOKENS.colors.textSecondary,
          fontSize: 11,
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
        }}
      >
        <span>Symbol</span>
        <span style={{ textAlign: 'right' }}>Last</span>
        <span style={{ textAlign: 'right' }}>Chg %</span>
        <span />
      </div>

      {/* Symbol Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {displayedSymbols.length === 0 && (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: THEME_TOKENS.colors.textSecondary
            }}
          >
            {activeCategory === 'custom'
              ? 'No symbols in custom watchlist. Click ☆ on any market item to pin it!'
              : 'No live symbols available.'}
          </div>
        )}

        {displayedSymbols.map((item) => {
          const sym = item.symbol
          const isSelected = sym === currentSymbol
          const quote = prices[sym]
          const price = quote?.price
          const changePercent = quote?.change24hPercent ?? 0
          const isUp = changePercent >= 0
          const bookmarked = isCustomBookmarked(sym)
          const precision =
            item.precision ?? (item.category === 'forex' ? (sym.includes('JPY') ? 3 : 5) : 2)

          return (
            <div
              key={sym}
              onClick={(): void => setSymbol(sym)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr 1fr 24px',
                padding: '6px 12px',
                alignItems: 'center',
                cursor: 'pointer',
                backgroundColor: isSelected ? THEME_TOKENS.colors.bgActive : 'transparent',
                borderLeft: isSelected
                  ? `3px solid ${THEME_TOKENS.colors.accent}`
                  : '3px solid transparent',
                transition: 'background 0.1s ease',
                borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
              }}
              onMouseEnter={(e): void => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                }
              }}
              onMouseLeave={(e): void => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
            >
              {/* Symbol Name & Category Badge */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    color: THEME_TOKENS.colors.textBright,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {sym}
                </div>
                {item.name && item.name !== sym && (
                  <div
                    style={{
                      fontSize: 10,
                      color: THEME_TOKENS.colors.textSecondary,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {item.name}
                  </div>
                )}
              </div>

              {/* Price */}
              <div
                style={{
                  textAlign: 'right',
                  fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
                  color: THEME_TOKENS.colors.textPrimary
                }}
              >
                {price !== undefined
                  ? price.toLocaleString(undefined, {
                      minimumFractionDigits: Math.min(precision, 2),
                      maximumFractionDigits: precision
                    })
                  : '--'}
              </div>

              {/* Change % */}
              <div
                style={{
                  textAlign: 'right',
                  fontWeight: 600,
                  fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
                  color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish
                }}
              >
                {quote?.change24hPercent !== undefined
                  ? `${isUp ? '+' : ''}${changePercent.toFixed(2)}%`
                  : '--'}
              </div>

              {/* Star / Bookmark Toggle Action */}
              <button
                type="button"
                onClick={(e): void => handleToggleBookmark(sym, e)}
                className="tv-btn"
                title={bookmarked ? 'Remove from My Watchlist' : 'Add to My Watchlist'}
                style={{
                  padding: 2,
                  color: bookmarked ? '#f59e0b' : THEME_TOKENS.colors.textMuted,
                  justifyContent: 'center',
                  marginLeft: 4
                }}
              >
                {bookmarked ? '★' : '☆'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
