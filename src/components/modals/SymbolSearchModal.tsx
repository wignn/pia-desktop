import React, { useState, useEffect, useRef } from 'react'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'
import type { AssetCategory } from '@shared/types'
import { SymbolLogo } from '../common/SymbolLogo'

const CATEGORIES = ['all', 'stocks', 'indices', 'forex', 'commodities', 'metals', 'crypto'] as const

export const SymbolSearchModal: React.FC = () => {
  const { isSymbolSearchOpen, setSymbolSearchOpen } = useWorkspaceStore()
  if (!isSymbolSearchOpen) return null
  return <SymbolSearchDialog />
}

const SymbolSearchDialog: React.FC = () => {
  const { setSymbolSearchOpen } = useWorkspaceStore()
  const symbols = useMarketStore((state) => state.symbols)
  const setSymbol = useMarketStore((state) => state.setSymbol)
  const prices = useMarketStore((state) => state.prices)

  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | AssetCategory>('all')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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

  // Reset selected index when query or tab changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query, activeTab])

  const handleSelectSymbol = (sym: string): void => {
    setSymbol(sym)
    setSymbolSearchOpen(false)
  }

  // Keyboard navigation: ArrowUp, ArrowDown, Enter, Tab, Escape
  // ponytail: In-memory keyboard selection; upgrade to cmdk library when fuzzy search scoring & group headings are required.
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) {
        handleSelectSymbol(filtered[selectedIndex].symbol)
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const currentIdx = CATEGORIES.indexOf(activeTab as any)
      const nextIdx = e.shiftKey
        ? (currentIdx - 1 + CATEGORIES.length) % CATEGORIES.length
        : (currentIdx + 1) % CATEGORIES.length
      setActiveTab(CATEGORIES[nextIdx])
    }
  }

  // Auto-scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement | undefined
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

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
          width: 580,
          maxHeight: 500,
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
            placeholder="Search symbol, ticker, or name (↑↓ to navigate, Enter to pick)..."
            value={query}
            onChange={(e): void => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              color: THEME_TOKENS.colors.textBright,
              fontSize: 14,
              fontWeight: 600,
              outline: 'none'
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
            backgroundColor: THEME_TOKENS.colors.bgApp,
            userSelect: 'none'
          }}
        >
          {CATEGORIES.map((tab) => (
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
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted, alignSelf: 'center' }}>
            Tab ⇥ to switch
          </span>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            maxHeight: 360,
            userSelect: 'none'
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{ padding: 32, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
            >
              {symbols.length === 0
                ? 'No live symbols available.'
                : `No symbols matched "${query}"`}
            </div>
          )}

          {filtered.map((item, idx) => {
            const isSelected = idx === selectedIndex
            const quote = prices[item.symbol]
            const price = quote?.price
            const changePercent = quote?.change24hPercent ?? 0
            const isUp = changePercent >= 0

            return (
              <div
                key={item.symbol}
                onClick={(): void => handleSelectSymbol(item.symbol)}
                onMouseEnter={(): void => setSelectedIndex(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '9px 16px',
                  borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  cursor: 'pointer',
                  backgroundColor: isSelected ? THEME_TOKENS.colors.bgActive : 'transparent',
                  borderLeft: isSelected ? `3px solid ${THEME_TOKENS.colors.accent}` : '3px solid transparent',
                  contentVisibility: 'auto',
                  containIntrinsicSize: '40px'
                }}
              >
                <SymbolLogo symbol={item.symbol} size={20} />
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
                      {isUp ? '+' : ''}{changePercent.toFixed(2)}%
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
