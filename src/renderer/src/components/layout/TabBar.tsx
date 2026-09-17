import React from 'react'
import { useTabStore } from '../../stores/useTabStore'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'

export const TabBar: React.FC = () => {
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    closeTab,
    openHubInNewTab,
    openMacroMapsInNewTab,
    openControlPanelInNewTab
  } = useTabStore()
  const { prices } = useMarketStore()

  const formatPrice = (p?: number): string => {
    if (p === undefined || p === null) return ''
    if (p >= 1000)
      return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (p >= 1) return p.toFixed(3)
    return p.toFixed(6)
  }

  return (
    <div
      style={{
        height: 38,
        minHeight: 38,
        backgroundColor: THEME_TOKENS.colors.bgApp,
        borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 8,
        paddingRight: 8,
        gap: 2,
        userSelect: 'none',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'none',
        zIndex: 20
      }}
    >
      {/* Tabs List */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%', gap: 4 }}>
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
                gap: 8,
                height: 30,
                padding: '0 10px',
                borderRadius: '4px 4px 0 0',
                backgroundColor: isActive ? THEME_TOKENS.colors.bgSurface : 'transparent',
                borderTop: isActive
                  ? `2px solid ${THEME_TOKENS.colors.accent}`
                  : '2px solid transparent',
                borderLeft: `1px solid ${isActive ? THEME_TOKENS.colors.borderSubtle : 'transparent'}`,
                borderRight: `1px solid ${isActive ? THEME_TOKENS.colors.borderSubtle : 'transparent'}`,
                cursor: 'pointer',
                fontSize: 12,
                color: isActive
                  ? THEME_TOKENS.colors.textBright
                  : THEME_TOKENS.colors.textSecondary,
                fontWeight: isActive ? 600 : 500,
                transition: 'all 0.12s ease',
                whiteSpace: 'nowrap',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                  e.currentTarget.style.color = THEME_TOKENS.colors.textPrimary
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = THEME_TOKENS.colors.textSecondary
                }
              }}
            >
              {/* Tab Icon / Type Indicator */}
              {tab.type === 'hub' ? (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isActive ? THEME_TOKENS.colors.accent : 'currentColor'}
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
              ) : tab.type === 'macromaps' ? (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isActive ? THEME_TOKENS.colors.accent : 'currentColor'}
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              ) : (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isActive ? THEME_TOKENS.colors.accent : 'currentColor'}
                  strokeWidth="2"
                >
                  <path d="M3 3v18h18" />
                  <path d="M18 17V9" />
                  <path d="M13 17V5" />
                  <path d="M8 17v-3" />
                </svg>
              )}

              {/* Tab Label */}
              <span>{tab.customName || tab.title}</span>

              {/* Live Ticker Price & % badge for chart tabs */}
              {tab.type === 'chart' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                  <span
                    style={{
                      padding: '1px 4px',
                      borderRadius: 2,
                      backgroundColor: THEME_TOKENS.colors.bgApp,
                      color: THEME_TOKENS.colors.textSecondary,
                      fontSize: 10
                    }}
                  >
                    {tab.timeframe}
                  </span>

                  {quote && (
                    <span
                      style={{
                        color: isPositive
                          ? THEME_TOKENS.colors.bullish
                          : THEME_TOKENS.colors.bearish,
                        fontWeight: 600,
                        fontSize: 11
                      }}
                    >
                      {formatPrice(quote.price)}
                    </span>
                  )}
                </div>
              )}

              {/* Interactive Close Tab Button (×) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                title="Close Tab"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  border: 'none',
                  background: 'transparent',
                  color: THEME_TOKENS.colors.textSecondary,
                  cursor: 'pointer',
                  padding: 0,
                  marginLeft: 2,
                  fontSize: 14,
                  lineHeight: 1
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgApp
                  e.currentTarget.style.color = THEME_TOKENS.colors.textBright
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = THEME_TOKENS.colors.textSecondary
                }}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {/* New Tab (+) Button */}
      <button
        type="button"
        onClick={openHubInNewTab}
        title="Open New Tab (Supercharts Hub)"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: 4,
          border: 'none',
          backgroundColor: 'transparent',
          color: THEME_TOKENS.colors.textSecondary,
          cursor: 'pointer',
          padding: 0,
          marginLeft: 4,
          transition: 'all 0.1s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
          e.currentTarget.style.color = THEME_TOKENS.colors.textBright
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = THEME_TOKENS.colors.textSecondary
        }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Macro Maps New Tab Button */}
      <button
        type="button"
        onClick={() => openMacroMapsInNewTab('inflation')}
        title="Open Macro Maps (World Thematic) in New Tab"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          height: 26,
          padding: '0 7px',
          borderRadius: 4,
          border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          backgroundColor: 'rgba(41, 98, 255, 0.08)',
          color: THEME_TOKENS.colors.accent,
          cursor: 'pointer',
          marginLeft: 6,
          fontSize: 11,
          fontWeight: 600,
          transition: 'all 0.1s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.18)'
          e.currentTarget.style.borderColor = THEME_TOKENS.colors.accent
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.08)'
          e.currentTarget.style.borderColor = THEME_TOKENS.colors.borderSubtle
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span>Macro Maps</span>
      </button>

      {/* Control Panel / War Room New Tab Button */}
      <button
        type="button"
        onClick={openControlPanelInNewTab}
        title="Open Control Panel & Financial War Room in New Tab"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          height: 26,
          padding: '0 8px',
          borderRadius: 4,
          border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          backgroundColor: 'rgba(8, 153, 129, 0.1)',
          color: '#089981',
          cursor: 'pointer',
          marginLeft: 4,
          fontSize: 11,
          fontWeight: 600,
          transition: 'all 0.1s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(8, 153, 129, 0.2)'
          e.currentTarget.style.borderColor = '#089981'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(8, 153, 129, 0.1)'
          e.currentTarget.style.borderColor = THEME_TOKENS.colors.borderSubtle
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
        <span>Control Panel</span>
      </button>
    </div>
  )
}
