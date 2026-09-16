import React, { useState } from 'react'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useChartStore } from '../../stores/useChartStore'
import { THEME_TOKENS } from '../../theme/tokens'

interface IndicatorMeta {
  name: string
  fullName: string
  category: 'Trend' | 'Oscillator' | 'Volatility' | 'Volume'
  description: string
}

const AVAILABLE_INDICATORS: IndicatorMeta[] = [
  {
    name: 'EMA',
    fullName: 'Exponential Moving Average',
    category: 'Trend',
    description: 'Weighted moving average giving higher weight to recent prices'
  },
  {
    name: 'SMA',
    fullName: 'Simple Moving Average',
    category: 'Trend',
    description: 'Arithmetic moving average calculating average price over period'
  },
  {
    name: 'BOLL',
    fullName: 'Bollinger Bands',
    category: 'Volatility',
    description: 'Volatility bands placed above and below a moving average'
  },
  {
    name: 'VOL',
    fullName: 'Volume',
    category: 'Volume',
    description: 'Trading volume bars overlaid or in dedicated pane'
  },
  {
    name: 'MACD',
    fullName: 'Moving Average Convergence Divergence',
    category: 'Oscillator',
    description: 'Trend-following momentum indicator showing relationship between two EMAs'
  },
  {
    name: 'RSI',
    fullName: 'Relative Strength Index',
    category: 'Oscillator',
    description: 'Momentum oscillator measuring speed and change of price movements'
  },
  {
    name: 'KDJ',
    fullName: 'KDJ Indicator',
    category: 'Oscillator',
    description: 'Stochastic oscillator variant with %K, %D, and %J momentum lines'
  },
  {
    name: 'WR',
    fullName: 'Williams %R',
    category: 'Oscillator',
    description: 'Momentum indicator that measures overbought and oversold levels'
  }
]

export const IndicatorModal: React.FC = () => {
  const { isIndicatorModalOpen, setIndicatorModalOpen } = useWorkspaceStore()
  const { activeIndicators, toggleIndicator } = useChartStore()
  const [search, setSearch] = useState('')

  if (!isIndicatorModalOpen) return null

  const activeNames = new Set(activeIndicators.map((i) => i.name))

  const filtered = AVAILABLE_INDICATORS.filter(
    (ind) =>
      ind.name.toLowerCase().includes(search.toLowerCase()) ||
      ind.fullName.toLowerCase().includes(search.toLowerCase()) ||
      ind.category.toLowerCase().includes(search.toLowerCase())
  )

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
      onClick={() => setIndicatorModalOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 580,
          maxHeight: 520,
          backgroundColor: THEME_TOKENS.colors.bgSurface,
          border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
          borderRadius: 8,
          boxShadow: THEME_TOKENS.colors.modalShadow,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14, color: THEME_TOKENS.colors.textBright }}>
            Indicators & Metrics
          </span>
          <button
            type="button"
            onClick={() => setIndicatorModalOpen(false)}
            className="tv-btn"
            style={{ padding: '2px 6px', fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}
          >
            ESC
          </button>
        </div>

        {/* Search */}
        <div
          style={{
            padding: '10px 16px',
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            backgroundColor: THEME_TOKENS.colors.bgApp,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <svg
            width="16"
            height="16"
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
            placeholder="Search indicator name or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              color: THEME_TOKENS.colors.textBright,
              fontSize: 13
            }}
            autoFocus
          />
        </div>

        {/* Indicators List */}
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 380 }}>
          {filtered.map((ind) => {
            const isActive = activeNames.has(ind.name)

            return (
              <div
                key={ind.name}
                onClick={() => toggleIndicator(ind.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  cursor: 'pointer',
                  backgroundColor: isActive ? THEME_TOKENS.colors.bgActive : 'transparent',
                  transition: 'background 0.12s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: THEME_TOKENS.colors.textBright
                      }}
                    >
                      {ind.name}
                    </span>
                    <span style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 12 }}>
                      {ind.fullName}
                    </span>
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        backgroundColor: THEME_TOKENS.colors.bgApp,
                        color: THEME_TOKENS.colors.textSecondary,
                        padding: '1px 5px',
                        borderRadius: 3
                      }}
                    >
                      {ind.category}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: THEME_TOKENS.colors.textMuted }}>
                    {ind.description}
                  </div>
                </div>

                <div style={{ marginLeft: 16 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      border: `1px solid ${isActive ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.borderMedium}`,
                      backgroundColor: isActive ? THEME_TOKENS.colors.accent : 'transparent',
                      color: '#ffffff'
                    }}
                  >
                    {isActive && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
