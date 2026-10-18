import React from 'react'
import { useTabStore } from '../../stores/useTabStore'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'

export const TabBar: React.FC = () => {
  const { tabs, activeTabId, setActiveTabId, closeTab, addTab } = useTabStore()
  const prices = useMarketStore((state) => state.prices)

  const formatPrice = (p?: number): string => {
    if (p === undefined || p === null) return ''
    if (p >= 1000)
      return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (p >= 1) return p.toFixed(2)
    return p.toFixed(4)
  }

  const handleAddNewTab = (): void => {
    const currentSymbol = useMarketStore.getState().symbol || 'XAUUSD'
    const currentTimeframe = useMarketStore.getState().timeframe || '1h'
    addTab({
      title: `${currentSymbol}, ${currentTimeframe}`,
      type: 'chart',
      symbol: currentSymbol,
      timeframe: currentTimeframe
    })
  }

  return (
    <div
      style={{
        height: THEME_TOKENS.dimensions.tabBarHeight,
        minHeight: THEME_TOKENS.dimensions.tabBarHeight,
        backgroundColor: THEME_TOKENS.colors.bgApp,
        borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 6,
        paddingRight: 6,
        gap: 2,
        userSelect: 'none',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'none',
        zIndex: 20
      }}
    >
      {/* Tabs List */}
      <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%', gap: 1 }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const quote = tab.symbol ? prices[tab.symbol] : undefined
          const isPositive = (quote?.change24hPercent ?? 0) >= 0

          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 27,
                padding: '0 10px',
                borderRadius: '4px 4px 0 0',
                backgroundColor: isActive ? THEME_TOKENS.colors.bgSurface : 'transparent',
                borderBottom: isActive
                  ? `2px solid ${THEME_TOKENS.colors.accent}`
                  : '2px solid transparent',
                borderLeft: `1px solid ${isActive ? THEME_TOKENS.colors.borderSubtle : 'transparent'}`,
                borderRight: `1px solid ${isActive ? THEME_TOKENS.colors.borderSubtle : 'transparent'}`,
                borderTop: `1px solid ${isActive ? THEME_TOKENS.colors.borderSubtle : 'transparent'}`,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? THEME_TOKENS.colors.textBright : THEME_TOKENS.colors.textSecondary,
                maxWidth: 200,
                transition: 'all 0.1s ease',
                position: 'relative'
              }}
            >
              {/* Tab Category indicator dot */}
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: isActive ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.borderMedium
                }}
              />

              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.2px'
                }}
              >
                {tab.title}
              </span>

              {tab.type === 'chart' && quote && quote.price !== undefined && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: THEME_TOKENS.typography.fontMono,
                    color: isPositive ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish,
                    fontWeight: 600
                  }}
                >
                  {formatPrice(quote.price)}
                </span>
              )}

              {tabs.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 14,
                    height: 14,
                    borderRadius: 2,
                    fontSize: 12,
                    color: THEME_TOKENS.colors.textMuted,
                    marginLeft: 2
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = THEME_TOKENS.colors.textBright
                    e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = THEME_TOKENS.colors.textMuted
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                  title="Close Tab"
                >
                  ×
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* New Tab (+) button (Canonical TradingView tab add) */}
      <button
        type="button"
        onClick={handleAddNewTab}
        className="tv-btn"
        style={{
          width: 24,
          height: 24,
          padding: 0,
          color: THEME_TOKENS.colors.textSecondary,
          borderRadius: 3,
          marginLeft: 2
        }}
        title="Open New Tab (Ctrl+T)"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <div style={{ flex: 1 }} />
    </div>
  )
}
