import React, { useState, useRef } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'

type BottomTabId = 'screener' | 'pine' | 'strategy' | 'trading'

interface BottomTab {
  id: BottomTabId
  label: string
}

const TABS: BottomTab[] = [
  { id: 'screener', label: 'Stock Screener' },
  { id: 'pine', label: 'Pine Editor' },
  { id: 'strategy', label: 'Strategy Tester' },
  { id: 'trading', label: 'Trading Panel' }
]

export const BottomDockPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<BottomTabId>('screener')
  const [isOpen, setIsOpen] = useState(false)
  const [drawerHeight, setDrawerHeight] = useState(220)
  const [screenerFilter, setScreenerFilter] = useState<'all' | 'gainers' | 'losers' | 'volume'>('all')

  const symbols = useMarketStore((state) => state.symbols)
  const prices = useMarketStore((state) => state.prices)
  const setSymbol = useMarketStore((state) => state.setSymbol)
  const currentSymbol = useMarketStore((state) => state.symbol)

  const isDraggingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)

  // ponytail: Native mouse drag resizer; upgrade to react-resizable-panels when multi-split persistent layout state is requested.
  const handleResizeStart = (e: React.MouseEvent): void => {
    isDraggingRef.current = true
    startYRef.current = e.clientY
    startHeightRef.current = drawerHeight

    const onMouseMove = (moveEvent: MouseEvent): void => {
      if (!isDraggingRef.current) return
      const delta = startYRef.current - moveEvent.clientY
      const nextHeight = Math.min(520, Math.max(120, startHeightRef.current + delta))
      setDrawerHeight(nextHeight)
    }

    const onMouseUp = (): void => {
      isDraggingRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Filter screener items based on live prices
  const screenerItems = React.useMemo(() => {
    let list = symbols.map((s) => {
      const q = prices[s.symbol]
      return {
        ...s,
        price: q?.price,
        change24h: q?.change24hPercent ?? 0,
        volume: q?.volume24h
      }
    })

    if (screenerFilter === 'gainers') {
      list = list.filter((i) => i.change24h > 0).sort((a, b) => b.change24h - a.change24h)
    } else if (screenerFilter === 'losers') {
      list = list.filter((i) => i.change24h < 0).sort((a, b) => a.change24h - b.change24h)
    } else if (screenerFilter === 'volume') {
      list = list.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    }

    return list
  }, [symbols, prices, screenerFilter])

  const toggleOpen = (): void => {
    setIsOpen(!isOpen)
  }

  const handleTabClick = (tabId: BottomTabId): void => {
    if (activeTab === tabId && isOpen) {
      setIsOpen(false)
    } else {
      setActiveTab(tabId)
      setIsOpen(true)
    }
  }

  return (
    <div
      style={{
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 15,
        userSelect: 'none',
        position: 'relative'
      }}
    >
      {/* Resizable Top Edge Handle (when open) */}
      {isOpen && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            top: -3,
            left: 0,
            right: 0,
            height: 6,
            cursor: 'row-resize',
            zIndex: 30
          }}
          title="Drag to resize panel"
        />
      )}

      {/* Tab Strip Bar (TradingView bottom tab bar) */}
      <div
        style={{
          height: 28,
          minHeight: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          backgroundColor: THEME_TOKENS.colors.bgSurface,
          borderBottom: isOpen ? `1px solid ${THEME_TOKENS.colors.borderSubtle}` : 'none'
        }}
      >
        {/* Left Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id && isOpen
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={`tv-btn ${isActive ? 'active' : ''}`}
                style={{
                  height: 24,
                  padding: '0 8px',
                  fontSize: 11,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textSecondary,
                  borderRadius: 3,
                  borderBottom: isActive ? `2px solid ${THEME_TOKENS.colors.accent}` : 'none'
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Right Action Icons (Chevron expand/collapse) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            onClick={toggleOpen}
            className="tv-btn"
            style={{ width: 24, height: 24, padding: 0 }}
            title={isOpen ? 'Collapse Panel' : 'Maximize Panel'}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{
                transform: isOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease'
              }}
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded Drawer Content with dynamic resizable height */}
      {isOpen && (
        <div
          style={{
            height: drawerHeight,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: THEME_TOKENS.colors.bgApp
          }}
        >
          {/* TAB 1: STOCK SCREENER */}
          {activeTab === 'screener' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 11 }}>
              {/* Filter pills */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  backgroundColor: THEME_TOKENS.colors.bgSurface
                }}
              >
                <span style={{ color: THEME_TOKENS.colors.textMuted, fontSize: 11 }}>Filter:</span>
                {(['all', 'gainers', 'losers', 'volume'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setScreenerFilter(f)}
                    className={`tv-btn ${screenerFilter === f ? 'active' : ''}`}
                    style={{
                      height: 20,
                      padding: '0 6px',
                      fontSize: 10,
                      textTransform: 'capitalize'
                    }}
                  >
                    {f}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <span style={{ color: THEME_TOKENS.colors.textMuted, fontSize: 10 }}>
                  Showing {screenerItems.length} assets
                </span>
              </div>

              {/* Table Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1.2fr',
                  padding: '6px 12px',
                  backgroundColor: THEME_TOKENS.colors.bgSurface,
                  borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  color: THEME_TOKENS.colors.textSecondary,
                  fontWeight: 600,
                  fontSize: 10
                }}
              >
                <div>Ticker</div>
                <div style={{ textAlign: 'right' }}>Last</div>
                <div style={{ textAlign: 'right' }}>Chg %</div>
                <div style={{ textAlign: 'right' }}>Volume</div>
                <div style={{ textAlign: 'right' }}>Technical Rating</div>
              </div>

              {/* Table Rows with virtualized rendering */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {screenerItems.map((item) => {
                  const isSelected = item.symbol === currentSymbol
                  const isUp = item.change24h >= 0
                  const rating =
                    item.change24h > 1.5
                      ? 'Strong Buy'
                      : item.change24h > 0
                        ? 'Buy'
                        : item.change24h > -1.5
                          ? 'Neutral'
                          : 'Sell'
                  const ratingColor =
                    item.change24h > 0 ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish

                  return (
                    <div
                      key={item.symbol}
                      onClick={() => setSymbol(item.symbol)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1.2fr',
                        padding: '5px 12px',
                        alignItems: 'center',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? THEME_TOKENS.colors.bgActive : 'transparent',
                        borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                        fontFamily: THEME_TOKENS.typography?.fontMono,
                        contentVisibility: 'auto',
                        containIntrinsicSize: '28px'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>{item.symbol}</span>
                        <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted, fontFamily: THEME_TOKENS.typography?.fontSans }}>
                          {item.name || item.category}
                        </span>
                      </div>

                      <div style={{ textAlign: 'right', color: THEME_TOKENS.colors.textPrimary }}>
                        {item.price !== undefined ? item.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '--'}
                      </div>

                      <div style={{ textAlign: 'right', fontWeight: 600, color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish }}>
                        {isUp ? '+' : ''}{item.change24h.toFixed(2)}%
                      </div>

                      <div style={{ textAlign: 'right', color: THEME_TOKENS.colors.textSecondary }}>
                        {item.volume ? (item.volume > 1e6 ? `${(item.volume / 1e6).toFixed(1)}M` : `${(item.volume / 1e3).toFixed(1)}K`) : '--'}
                      </div>

                      <div style={{ textAlign: 'right', color: ratingColor, fontWeight: 600, fontSize: 10, fontFamily: THEME_TOKENS.typography?.fontSans }}>
                        {rating}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 2: PINE SCRIPT EDITOR */}
          {activeTab === 'pine' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 11 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  backgroundColor: THEME_TOKENS.colors.bgSurface,
                  borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                }}
              >
                <span style={{ color: THEME_TOKENS.colors.textPrimary, fontWeight: 600 }}>
                  Script: My_Custom_Strategy.pine
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="tv-btn active" style={{ height: 22, fontSize: 11, padding: '0 8px' }}>
                    Save
                  </button>
                  <button type="button" className="tv-btn" style={{ height: 22, fontSize: 11, padding: '0 8px' }}>
                    Add to chart
                  </button>
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  fontFamily: 'Consolas, monospace',
                  fontSize: 12,
                  color: '#9cdcfe',
                  backgroundColor: '#1e1e1e',
                  overflowY: 'auto',
                  lineHeight: 1.5
                }}
              >
                <div><span style={{ color: '#6a9955' }}>//@version=5</span></div>
                <div><span style={{ color: '#569cd6' }}>indicator</span>(<span style={{ color: '#ce9178' }}>&quot;Custom Relative Trend&quot;</span>, overlay=<span style={{ color: '#569cd6' }}>true</span>)</div>
                <div><span style={{ color: '#4ec9b0' }}>length</span> = <span style={{ color: '#b5cea8' }}>14</span></div>
                <div><span style={{ color: '#4ec9b0' }}>src</span> = close</div>
                <div><span style={{ color: '#4ec9b0' }}>maFast</span> = ta.ema(src, <span style={{ color: '#b5cea8' }}>9</span>)</div>
                <div><span style={{ color: '#4ec9b0' }}>maSlow</span> = ta.ema(src, <span style={{ color: '#b5cea8' }}>21</span>)</div>
                <div>plot(maFast, color=color.blue, title=<span style={{ color: '#ce9178' }}>&quot;Fast EMA&quot;</span>)</div>
                <div>plot(maSlow, color=color.orange, title=<span style={{ color: '#ce9178' }}>&quot;Slow EMA&quot;</span>)</div>
              </div>
            </div>
          )}

          {/* TAB 3: STRATEGY TESTER */}
          {activeTab === 'strategy' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px 16px', gap: 12, fontSize: 12, overflowY: 'auto' }}>
              <div style={{ fontWeight: 600, color: THEME_TOKENS.colors.textBright }}>
                Performance Summary: MACD Momentum Strategy
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                <div style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, padding: 10, borderRadius: 4, border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                  <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>Net Profit</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: THEME_TOKENS.colors.bullish, marginTop: 4 }}>+$14,820.00</div>
                  <div style={{ fontSize: 10, color: THEME_TOKENS.colors.bullish }}>+29.64%</div>
                </div>

                <div style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, padding: 10, borderRadius: 4, border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                  <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>Total Closed Trades</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: THEME_TOKENS.colors.textBright, marginTop: 4 }}>142</div>
                  <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>64.8% Profitable</div>
                </div>

                <div style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, padding: 10, borderRadius: 4, border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                  <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>Profit Factor</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: THEME_TOKENS.colors.textBright, marginTop: 4 }}>1.94</div>
                  <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>Sharpe: 1.62</div>
                </div>

                <div style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, padding: 10, borderRadius: 4, border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                  <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>Max Drawdown</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: THEME_TOKENS.colors.bearish, marginTop: 4 }}>-$2,140.00</div>
                  <div style={{ fontSize: 10, color: THEME_TOKENS.colors.bearish }}>-5.42%</div>
                </div>

                <div style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, padding: 10, borderRadius: 4, border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                  <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>Avg Trade</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: THEME_TOKENS.colors.bullish, marginTop: 4 }}>+$104.36</div>
                  <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>Win/Loss: 1.8</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TRADING PANEL */}
          {activeTab === 'trading' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', height: '100%', padding: '16px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>Paper Trading Account</div>
                <div style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary, marginTop: 4 }}>Account Balance: $100,000.00 USD (Equity: $102,450.00)</div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  style={{
                    backgroundColor: THEME_TOKENS.colors.bullish,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '8px 24px',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  BUY / LONG
                </button>
                <button
                  type="button"
                  style={{
                    backgroundColor: THEME_TOKENS.colors.bearish,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '8px 24px',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  SELL / SHORT
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
