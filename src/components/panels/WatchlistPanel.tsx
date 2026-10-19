import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useWatchlistStore } from '../../stores/useWatchlistStore'
import { useMarketStore } from '../../stores/useMarketStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { THEME_TOKENS } from '../../theme/tokens'
import type { AssetCategory, SymbolInfo } from '@shared/types'
import { getSymbolPrecision } from '@shared/market-utils'
import { SymbolLogo } from '../common/SymbolLogo'

export const WatchlistPanel: React.FC = () => {
  const {
    watchlists,
    activeListId,
    loadWatchlists,
    setActiveListId,
    createWatchlist,
    deleteWatchlist,
    addSymbolToActiveList,
    removeSymbolFromActiveList
  } = useWatchlistStore()

  const currentSymbol = useMarketStore((state) => state.symbol)
  const setSymbol = useMarketStore((state) => state.setSymbol)
  const marketSymbols = useMarketStore((state) => state.symbols)
  const prices = useMarketStore((state) => state.prices)
  const latestBar = useMarketStore((state) => state.latestBar)
  const setSymbolSearchOpen = useWorkspaceStore((state) => state.setSymbolSearchOpen)

  const [searchQuery, setSearchQuery] = useState('')
  const [isOptionsOpen, setIsOptionsOpen] = useState(false)
  const [isCreatingList, setIsCreatingList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [detailsHeight, setDetailsHeight] = useState(220)

  const isDraggingSplitterRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)

  const handleSplitterMouseDown = (e: React.MouseEvent): void => {
    isDraggingSplitterRef.current = true
    startYRef.current = e.clientY
    startHeightRef.current = detailsHeight

    const onMouseMove = (moveEvent: MouseEvent): void => {
      if (!isDraggingSplitterRef.current) return
      const delta = startYRef.current - moveEvent.clientY
      const nextH = Math.min(380, Math.max(140, startHeightRef.current + delta))
      setDetailsHeight(nextH)
    }

    const onMouseUp = (): void => {
      isDraggingSplitterRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  useEffect(() => {
    loadWatchlists()
  }, [loadWatchlists])

  const activeGroup = watchlists.find((w) => w.id === activeListId) || watchlists[0]

  // Consolidate unique symbols from catalog
  const catalogMap = useMemo(() => {
    const map = new Map<string, SymbolInfo>()
    for (const item of marketSymbols) {
      if (!map.has(item.symbol)) map.set(item.symbol, item)
    }
    return map
  }, [marketSymbols])

  // Filtered symbols to display in the table
  const displayedSymbols = useMemo(() => {
    const list = activeGroup?.symbols || []
    let result = list.map((sym) => {
      const found = catalogMap.get(sym)
      return {
        symbol: sym,
        name: found?.name,
        category: found?.category,
        precision: found?.pricePrecision
      }
    })

    if (!searchQuery.trim()) return result

    const q = searchQuery.trim().toLowerCase()
    return result.filter(
      (item) => item.symbol.toLowerCase().includes(q) || (item.name && item.name.toLowerCase().includes(q))
    )
  }, [activeGroup, catalogMap, searchQuery])

  // ponytail: subscribes only currently displayed watchlist symbols to WS; upgrade to server-side batch subscription if list exceeds 100 items.
  useEffect(() => {
    const symbolsToSub = displayedSymbols.map((item) => item.symbol).filter(Boolean)
    if (symbolsToSub.length === 0) return

    for (const sym of symbolsToSub) {
      void window.api.market.subscribePrice(sym)
    }

    return () => {
      for (const sym of symbolsToSub) {
        void window.api.market.unsubscribePrice(sym)
      }
    }
  }, [displayedSymbols])

  // Selected item quote and statistics for bottom card
  const selectedQuote = currentSymbol ? prices[currentSymbol] : undefined
  const selectedSymInfo = currentSymbol ? catalogMap.get(currentSymbol) : undefined
  const selectedPrecision = getSymbolPrecision(
    currentSymbol ?? '',
    selectedSymInfo?.category,
    selectedQuote?.price
  )

  const currentPrice = selectedQuote?.price ?? latestBar?.close
  const change24hPercent = selectedQuote?.change24hPercent
  const isUp = (change24hPercent ?? 0) >= 0

  // Day's high and low for Range Slider
  const dayHigh = selectedQuote?.high24h ?? latestBar?.high ?? (currentPrice ? currentPrice * 1.012 : 100)
  const dayLow = selectedQuote?.low24h ?? latestBar?.low ?? (currentPrice ? currentPrice * 0.988 : 95)
  const dayRangeSpread = dayHigh - dayLow
  const dayRangePosition =
    dayRangeSpread > 0 && currentPrice
      ? Math.min(100, Math.max(0, ((currentPrice - dayLow) / dayRangeSpread) * 100))
      : 50

  const handleCreateListSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!newListName.trim()) return
    const created = await createWatchlist(newListName.trim())
    if (created) {
      setIsCreatingList(false)
      setNewListName('')
    }
  }

  // ponytail: Watchlist item management; upgrade to Drag-and-Drop symbol reordering when react-dnd library is approved.
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        fontSize: 12,
        userSelect: 'none'
      }}
    >
      {/* 1. TRADINGVIEW WATCHLIST HEADER */}
      <div
        style={{
          height: 38,
          minHeight: 38,
          padding: '0 8px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative'
        }}
      >
        {/* Watchlist Dropdown Select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
          <select
            value={activeListId}
            onChange={(e) => setActiveListId(e.target.value)}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: THEME_TOKENS.colors.textBright,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              outline: 'none',
              maxWidth: 160,
              textOverflow: 'ellipsis'
            }}
          >
            {watchlists.map((w) => (
              <option key={w.id} value={w.id} style={{ backgroundColor: THEME_TOKENS.colors.bgSurface }}>
                {w.name}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>
            ({displayedSymbols.length})
          </span>
        </div>

        {/* Action Buttons: Add Symbol (+) & More Options (⋯) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            onClick={() => setSymbolSearchOpen(true)}
            className="tv-btn"
            style={{ width: 26, height: 26, padding: 0 }}
            title="Add symbol to watchlist"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setIsOptionsOpen(!isOptionsOpen)}
            className={`tv-btn ${isOptionsOpen ? 'active' : ''}`}
            style={{ width: 26, height: 26, padding: 0 }}
            title="Watchlist Options"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>

        {/* Options Flyout Menu */}
        {isOptionsOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 8,
              marginTop: 2,
              width: 170,
              backgroundColor: THEME_TOKENS.colors.bgSurface,
              border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
              borderRadius: 4,
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              zIndex: 100,
              padding: '4px 0'
            }}
          >
            <div
              onClick={() => { setIsCreatingList(true); setIsOptionsOpen(false) }}
              className="tv-btn"
              style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 12px', borderRadius: 0, height: 'auto' }}
            >
              + Create New List...
            </div>
            {watchlists.length > 1 && (
              <div
                onClick={async () => {
                  if (window.confirm(`Delete watchlist "${activeGroup?.name}"?`)) {
                    await deleteWatchlist(activeListId)
                  }
                  setIsOptionsOpen(false)
                }}
                className="tv-btn"
                style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 12px', borderRadius: 0, height: 'auto', color: THEME_TOKENS.colors.bearish }}
              >
                Delete List
              </div>
            )}
          </div>
        )}
      </div>

      {/* New List Inline Form */}
      {isCreatingList && (
        <form
          onSubmit={handleCreateListSubmit}
          style={{
            padding: '6px 8px',
            backgroundColor: THEME_TOKENS.colors.bgApp,
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            display: 'flex',
            gap: 4
          }}
        >
          <input
            type="text"
            placeholder="New list name..."
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              backgroundColor: THEME_TOKENS.colors.bgSurface,
              border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
              borderRadius: 3,
              color: THEME_TOKENS.colors.textPrimary,
              fontSize: 11,
              padding: '2px 6px',
              outline: 'none'
            }}
          />
          <button type="submit" className="tv-btn active" style={{ height: 22, padding: '0 6px', fontSize: 11 }}>
            Save
          </button>
          <button type="button" onClick={() => setIsCreatingList(false)} className="tv-btn" style={{ height: 22, padding: '0 6px', fontSize: 11 }}>
            Cancel
          </button>
        </form>
      )}

      {/* 2. TABLE COLUMN HEADERS (Symbol | Last | Chg | Chg %) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr 0.8fr 1fr',
          padding: '6px 8px',
          color: THEME_TOKENS.colors.textMuted,
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          backgroundColor: THEME_TOKENS.colors.bgApp
        }}
      >
        <span>Symbol</span>
        <span style={{ textAlign: 'right' }}>Last</span>
        <span style={{ textAlign: 'right' }}>Chg</span>
        <span style={{ textAlign: 'right' }}>Chg %</span>
      </div>

      {/* 3. SYMBOL ROWS LIST */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 120 }}>
        {displayedSymbols.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: THEME_TOKENS.colors.textMuted, fontSize: 11 }}>
            Watchlist empty. Click + to add symbols.
          </div>
        )}

        {displayedSymbols.map((item) => {
          const sym = item.symbol
          const isSelected = sym === currentSymbol
          const quote = prices[sym]
          const price = quote?.price
          const changePercent = quote?.change24hPercent
          const changeVal = quote?.change24h ?? (price && changePercent !== undefined ? (price * changePercent) / 100 : undefined)
          const rowUp = (changePercent ?? 0) >= 0
          const precision = item.precision ?? (sym.includes('JPY') ? 3 : 2)

          return (
            <div
              key={sym}
              onClick={() => setSymbol(sym)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr 0.8fr 1fr',
                padding: '6px 8px',
                alignItems: 'center',
                cursor: 'pointer',
                backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                borderLeft: isSelected ? '2px solid #3b82f6' : '2px solid transparent',
                borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                fontFamily: THEME_TOKENS.typography?.fontMono,
                fontVariantNumeric: 'tabular-nums',
                contentVisibility: 'auto',
                containIntrinsicSize: '30px',
                transition: 'background 0.12s ease'
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              {/* Symbol Ticker & Category Dot */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <SymbolLogo symbol={item.symbol} size={18} />
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    backgroundColor: rowUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish,
                    boxShadow: rowUp ? '0 0 6px rgba(16, 185, 129, 0.5)' : '0 0 6px rgba(244, 63, 94, 0.5)',
                    flexShrink: 0
                  }}
                />
                <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.textBright, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sym}
                </span>
              </div>

              {/* Last Price */}
              <div style={{ textAlign: 'right', color: THEME_TOKENS.colors.textPrimary, fontWeight: 500 }}>
                {price !== undefined
                  ? price.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })
                  : '--'}
              </div>

              {/* Net Change */}
              <div style={{ textAlign: 'right', color: rowUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish, fontSize: 11 }}>
                {changeVal !== undefined
                  ? `${changeVal > 0 ? '+' : ''}${changeVal.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}`
                  : '--'}
              </div>

              {/* Change % Badge (Jewel Pill) */}
              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 6px',
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: 700,
                    backgroundColor: rowUp ? THEME_TOKENS.colors.bullishBg : THEME_TOKENS.colors.bearishBg,
                    color: rowUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish,
                    border: `1px solid ${rowUp ? 'rgba(16, 185, 129, 0.22)' : 'rgba(244, 63, 94, 0.22)'}`,
                    boxShadow: rowUp ? '0 0 8px rgba(16, 185, 129, 0.08)' : '0 0 8px rgba(244, 63, 94, 0.08)'
                  }}
                >
                  {changePercent !== undefined ? `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%` : '--'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* 4. HORIZONTAL RESIZABLE SPLITTER (TradingView Drag Handle) */}
      <div
        onMouseDown={handleSplitterMouseDown}
        style={{
          height: 6,
          backgroundColor: THEME_TOKENS.colors.borderSubtle,
          cursor: 'row-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none'
        }}
        title="Drag to resize details"
      >
        <div style={{ width: 24, height: 2, backgroundColor: THEME_TOKENS.colors.borderMedium, borderRadius: 1 }} />
      </div>

      {/* 5. CANONICAL TRADINGVIEW SYMBOL DETAILS & KEY STATS CARD */}
      {currentSymbol && (
        <div
          style={{
            height: detailsHeight,
            minHeight: 140,
            backgroundColor: THEME_TOKENS.colors.bgSurface,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            overflowY: 'auto'
          }}
        >
          {/* Header & Category */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
                {currentSymbol}
              </div>
              <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                {selectedSymInfo?.name || currentSymbol} · {selectedSymInfo?.category?.toUpperCase() || 'MARKET'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (activeGroup?.symbols.includes(currentSymbol)) {
                  removeSymbolFromActiveList(currentSymbol)
                } else {
                  addSymbolToActiveList(currentSymbol)
                }
              }}
              className="tv-btn"
              style={{ width: 24, height: 24, padding: 0, color: activeGroup?.symbols.includes(currentSymbol) ? '#f59e0b' : THEME_TOKENS.colors.textMuted }}
              title="Pin to Watchlist"
            >
              {activeGroup?.symbols.includes(currentSymbol) ? '★' : '☆'}
            </button>
          </div>

          {/* Big Live Price & Change Badge */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                fontFamily: THEME_TOKENS.typography?.fontMono,
                color: THEME_TOKENS.colors.textBright
              }}
            >
              {currentPrice !== undefined
                ? currentPrice.toLocaleString(undefined, {
                    minimumFractionDigits: selectedPrecision.pricePrecision,
                    maximumFractionDigits: selectedPrecision.pricePrecision
                  })
                : '--'}
            </span>

            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish,
                fontFamily: THEME_TOKENS.typography?.fontMono
              }}
            >
              {change24hPercent !== undefined ? `${change24hPercent > 0 ? '+' : ''}${change24hPercent.toFixed(2)}%` : '--'}
            </span>
          </div>

          {/* Day's Range Slider */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>
              <span>L: {dayLow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              <span style={{ fontWeight: 600 }}>Day&apos;s Range</span>
              <span>H: {dayHigh.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            <div
              style={{
                height: 4,
                backgroundColor: THEME_TOKENS.colors.bgApp,
                borderRadius: 2,
                position: 'relative',
                overflow: 'visible'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: `${dayRangePosition}%`,
                  top: -3,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: THEME_TOKENS.colors.accent,
                  border: `2px solid ${THEME_TOKENS.colors.bgSurface}`,
                  transform: 'translateX(-50%)'
                }}
              />
            </div>
          </div>

          {/* Key Statistics 2x3 Matrix */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px 12px',
              fontSize: 10,
              paddingTop: 4,
              borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: THEME_TOKENS.colors.textSecondary }}>Prev Close</span>
              <span style={{ color: THEME_TOKENS.colors.textPrimary, fontFamily: THEME_TOKENS.typography?.fontMono }}>
                {latestBar?.open ? latestBar.open.toFixed(2) : '--'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: THEME_TOKENS.colors.textSecondary }}>Open</span>
              <span style={{ color: THEME_TOKENS.colors.textPrimary, fontFamily: THEME_TOKENS.typography?.fontMono }}>
                {latestBar?.open ? latestBar.open.toFixed(2) : '--'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: THEME_TOKENS.colors.textSecondary }}>Volume (24h)</span>
              <span style={{ color: THEME_TOKENS.colors.textPrimary, fontFamily: THEME_TOKENS.typography?.fontMono }}>
                {selectedQuote?.volume24h
                  ? selectedQuote.volume24h > 1e6
                    ? `${(selectedQuote.volume24h / 1e6).toFixed(2)}M`
                    : `${(selectedQuote.volume24h / 1e3).toFixed(1)}K`
                  : '--'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: THEME_TOKENS.colors.textSecondary }}>Category</span>
              <span style={{ color: THEME_TOKENS.colors.accent, fontWeight: 600 }}>
                {selectedSymInfo?.category || 'Forex'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
