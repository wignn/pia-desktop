import React, { useState } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'
import type { Timeframe } from '@shared/types'

interface RangeOption {
  label: string
  timeframe: Timeframe
}

const RANGE_OPTIONS: RangeOption[] = [
  { label: '1D', timeframe: '5m' },
  { label: '5D', timeframe: '15m' },
  { label: '1M', timeframe: '1h' },
  { label: '3M', timeframe: '4h' },
  { label: '6M', timeframe: '1d' },
  { label: 'YTD', timeframe: '1d' },
  { label: '1Y', timeframe: '1d' },
  { label: '5Y', timeframe: '1w' },
  { label: 'All', timeframe: '1w' }
]

export const ChartRangeBar: React.FC = () => {
  const timeframe = useMarketStore((state) => state.timeframe)
  const setTimeframe = useMarketStore((state) => state.setTimeframe)

  const [activeRange, setActiveRange] = useState<string>('1M')
  const [isLogScale, setIsLogScale] = useState(false)
  const [isPercentScale, setIsPercentScale] = useState(false)
  const [isAutoScale, setIsAutoScale] = useState(true)

  const handleSelectRange = (opt: RangeOption): void => {
    setActiveRange(opt.label)
    setTimeframe(opt.timeframe)
  }

  // ponytail: Local state toggles for scale modes; upgrade to klinecharts chart.setStyles({ yAxis: { type: 'log' } }) when custom scales requested.
  return (
    <div
      style={{
        height: 28,
        minHeight: 28,
        backgroundColor: THEME_TOKENS.colors.bgApp,
        borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
        fontSize: 11,
        color: THEME_TOKENS.colors.textSecondary,
        userSelect: 'none',
        zIndex: 10
      }}
    >
      {/* Date Range Presets */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {RANGE_OPTIONS.map((opt) => {
          const isActive = activeRange === opt.label
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => handleSelectRange(opt)}
              className={`tv-btn ${isActive ? 'active' : ''}`}
              style={{
                height: 22,
                padding: '0 6px',
                fontSize: 11,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textSecondary,
                borderRadius: 3
              }}
              title={`View ${opt.label} (${opt.timeframe})`}
            >
              {opt.label}
            </button>
          )
        })}

        {/* Go to Date / Calendar Icon */}
        <button
          type="button"
          className="tv-btn"
          style={{ width: 22, height: 22, padding: 0, marginLeft: 2 }}
          title="Go to date (Alt+G)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
      </div>

      {/* Time & Scale Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {/* Percentage scale (%) */}
        <button
          type="button"
          onClick={() => setIsPercentScale(!isPercentScale)}
          className={`tv-btn ${isPercentScale ? 'active' : ''}`}
          style={{
            height: 22,
            padding: '0 5px',
            fontSize: 11,
            color: isPercentScale ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textMuted
          }}
          title="Percentage Scale Toggle"
        >
          %
        </button>

        {/* Logarithmic scale (log) */}
        <button
          type="button"
          onClick={() => setIsLogScale(!isLogScale)}
          className={`tv-btn ${isLogScale ? 'active' : ''}`}
          style={{
            height: 22,
            padding: '0 5px',
            fontSize: 11,
            color: isLogScale ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textMuted
          }}
          title="Logarithmic Scale Toggle"
        >
          log
        </button>

        {/* Auto scale (auto) */}
        <button
          type="button"
          onClick={() => setIsAutoScale(!isAutoScale)}
          className={`tv-btn ${isAutoScale ? 'active' : ''}`}
          style={{
            height: 22,
            padding: '0 5px',
            fontSize: 11,
            color: isAutoScale ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textMuted
          }}
          title="Auto Fit Scale"
        >
          auto
        </button>

        <div style={{ width: 1, height: 12, backgroundColor: THEME_TOKENS.colors.borderSubtle, margin: '0 4px' }} />

        {/* Timezone Indicator */}
        <span
          style={{
            fontSize: 10,
            color: THEME_TOKENS.colors.textMuted,
            fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
            paddingRight: 4
          }}
        >
          UTC
        </span>
      </div>
    </div>
  )
}
