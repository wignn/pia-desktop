import React, { useState, useEffect, useRef } from 'react'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'
import type { AssetCategory } from '@shared/types'

const SymbolSearchDialog: React.FC = () => {
  const { setSymbolSearchOpen } = useWorkspaceStore()
  const symbols = useMarketStore((state) => state.symbols)
  const setSymbol = useMarketStore((state) => state.setSymbol)
  const prices = useMarketStore((state) => state.prices)

  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | AssetCategory>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = symbols.filter((item) => {
    const matchesTab = activeTab === 'all' || item.category === activeTab
    const matchesQuery =
      item.symbol.toLowerCase().includes(query.toLowerCase()) ||
      item.name.toLowerCase().includes(query.toLowerCase())
    return matchesTab && matchesQuery
  })

  const handleSelectSymbol = (sym: string): void => {
    setSymbol(sym)
    setSymbolSearchOpen(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: THEME_TOKENS.colors.modalBackdrop,
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '80px'
      }}
      onClick={(): void => setSymbolSearchOpen(false)}
    >
      <div
        onClick={(e): void => e.stopPropagation()}
        style={{
          width: 560,
          maxHeight: 480,
          backgroundColor: THEME_TOKENS.colors.bgSurface,
          border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
          borderRadius: 8,
          boxShadow: THEME_TOKENS.colors.modalShadow,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <svg
            width="18"
            height="18"
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
            ref={inputRef}
            type="text"
            placeholder="Search symbol, ticker, or market (e.g. BTC, XAU, EUR)..."
            value={query}
            onChange={(e): void => setQuery(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              color: THEME_TOKENS.colors.textBright,
              fontSize: 14,
              fontWeight: 600
            }}
          />
          <button
            type="button"
            onClick={(): void => setSymbolSearchOpen(false)}
            className="tv-btn"
            style={{ padding: '2px 6px', fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}
          >
            ESC
          </button>
        </div>

        {/* Category Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '8px 16px',
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            backgroundColor: THEME_TOKENS.colors.bgApp
          }}
        >
          {(['all', 'stocks', 'indices', 'forex', 'commodities', 'metals', 'crypto'] as const).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={(): void => setActiveTab(tab)}
                className={`tv-btn ${activeTab === tab ? 'active' : ''}`}
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  textTransform: 'capitalize'
                }}
              >
                {tab}
              </button>
            )
          )}
        </div>

        {/* Results List */}
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 340 }}>
          {filtered.length === 0 && (
            <div
              style={{ padding: 32, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
            >
              {symbols.length === 0
                ? 'No live symbols available.'
                : `No symbols matched "${query}"`}
            </div>
          )}

          {filtered.map((item) => {
            const quote = prices[item.symbol]
            const price = quote?.price
            const changePercent = quote?.change24hPercent ?? 0
            const isUp = changePercent >= 0

            return (
              <div
                key={item.symbol}
                onClick={(): void => handleSelectSymbol(item.symbol)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 16px',
                  borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  cursor: 'pointer',
                  transition: 'background 0.1s ease'
                }}
                onMouseEnter={(e): void => {
                  e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                }}
                onMouseLeave={(e): void => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: THEME_TOKENS.colors.textBright
                      }}
                    >
                      {item.symbol}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        backgroundColor: THEME_TOKENS.colors.bgApp,
                        color: THEME_TOKENS.colors.textSecondary,
                        padding: '1px 5px',
                        borderRadius: 3
                      }}
                    >
                      {item.category}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
                    {item.name}
                  </span>
                </div>

                {price !== undefined && (
                  <div
                    style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
                        color: THEME_TOKENS.colors.textBright
                      }}
                    >
                      {price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
                        color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish
                      }}
                    >
                      {isUp ? '+' : ''}
                      {changePercent.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const SymbolSearchModal: React.FC = () => {
  const { isSymbolSearchOpen } = useWorkspaceStore()
  if (!isSymbolSearchOpen) return null
  return <SymbolSearchDialog />
}
