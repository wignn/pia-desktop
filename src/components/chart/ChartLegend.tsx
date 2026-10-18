import React from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { useChartStore } from '../../stores/useChartStore'
import { THEME_TOKENS } from '../../theme/tokens'
import { getSymbolPrecision } from '@shared/market-utils'
import { SymbolLogo } from '../common/SymbolLogo'

export const ChartLegend: React.FC = () => {
  const symbol = useMarketStore((state) => state.symbol)
  const timeframe = useMarketStore((state) => state.timeframe)
  const selectedBar = useMarketStore((state) => state.selectedBar)
  const latestBar = useMarketStore((state) => state.latestBar)
  const livePrice = useMarketStore((state) =>
    state.symbol ? state.prices[state.symbol]?.price : undefined
  )
  const symInfo = useMarketStore((state) =>
    state.symbol ? state.symbols.find((item) => item.symbol === state.symbol) : undefined
  )
  const activeIndicators = useChartStore((state) => state.activeIndicators)
  const toggleIndicator = useChartStore((state) => state.toggleIndicator)

  const precision = getSymbolPrecision(symbol ?? '', symInfo?.category, livePrice)

  const formatPrice = (val?: number): string => {
    if (val === undefined || isNaN(val)) return '--'
    return val.toLocaleString(undefined, {
      minimumFractionDigits: precision.pricePrecision,
      maximumFractionDigits: precision.pricePrecision
    })
  }

  const formatVol = (val?: number): string => {
    if (val === undefined || isNaN(val)) return '--'
    if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B'
    if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M'
    if (val >= 1e3) return (val / 1e3).toFixed(2) + 'K'
    return val.toFixed(2)
  }

  const displayBar = selectedBar ?? latestBar
  const open = displayBar?.open
  const high = displayBar?.high
  const low = displayBar?.low
  const close = displayBar?.close ?? livePrice
  const volume = displayBar?.volume

  const change = open !== undefined && close !== undefined ? close - open : 0
  const changePercent =
    open !== undefined && open > 0 && close !== undefined ? (change / open) * 100 : 0
  const isUp = change >= 0

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 10,
        zIndex: 10,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        fontSize: 11,
        fontFamily: THEME_TOKENS.typography?.fontSans || 'sans-serif',
        userSelect: 'none'
      }}
    >
      {/* 1. Main Symbol Info & OHLC Status Bar */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        {/* Symbol & Timeframe & Exchange badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <SymbolLogo symbol={symbol} size={16} />
          <span style={{ fontWeight: 700, color: THEME_TOKENS.colors.textBright, fontSize: 13 }}>
            {symbol}
          </span>
          <span style={{ color: THEME_TOKENS.colors.textMuted }}>•</span>
          <span
            style={{
              color: THEME_TOKENS.colors.textSecondary,
              fontSize: 11,
              fontWeight: 600
            }}
          >
            {timeframe.toUpperCase()}
          </span>
          <span style={{ color: THEME_TOKENS.colors.textMuted }}>•</span>
          <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted, textTransform: 'uppercase' }}>
            {symInfo?.category || 'FOREX'}
          </span>
        </div>

        {/* OHLC and Net Change */}
        {close !== undefined && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: THEME_TOKENS.colors.textSecondary,
              fontFamily: THEME_TOKENS.typography?.fontMono
            }}
          >
            {open !== undefined && (
              <span>
                O <span style={{ color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish }}>{formatPrice(open)}</span>
              </span>
            )}
            {high !== undefined && (
              <span>
                H <span style={{ color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish }}>{formatPrice(high)}</span>
              </span>
            )}
            {low !== undefined && (
              <span>
                L <span style={{ color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish }}>{formatPrice(low)}</span>
              </span>
            )}
            <span>
              C{' '}
              <span
                style={{
                  color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish,
                  fontWeight: 600
                }}
              >
                {formatPrice(close)}
              </span>
            </span>
            {open !== undefined && (
              <span
                style={{
                  color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish,
                  fontWeight: 600
                }}
              >
                {isUp ? '+' : ''}
                {formatPrice(change)} ({isUp ? '+' : ''}
                {changePercent.toFixed(2)}%)
              </span>
            )}
            {volume !== undefined && (
              <span style={{ marginLeft: 2 }}>
                Vol{' '}
                <span style={{ color: THEME_TOKENS.colors.textPrimary }}>{formatVol(volume)}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. Canonical TradingView Active Indicators List */}
      {activeIndicators.map((ind) => (
        <div
          key={ind.name}
          className="legend-indicator-row"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: THEME_TOKENS.colors.textSecondary,
            padding: '1px 4px',
            borderRadius: 3,
            backgroundColor: 'rgba(30, 34, 45, 0.4)',
            maxWidth: 'fit-content'
          }}
        >
          {/* Indicator Dot & Name */}
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: ind.name.includes('EMA') ? '#2962ff' : ind.name.includes('VOL') ? '#ff9800' : '#e91e63'
            }}
          />
          <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.textBright }}>
            {ind.shortName || ind.name}
          </span>
          <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>
            ({ind.name === 'EMA' ? '9, close' : ind.name === 'VOL' ? '20' : '14'})
          </span>

          {/* Quick Indicator Action Buttons (Eye, Cross) */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 2 }}>
            <button
              type="button"
              onClick={() => toggleIndicator(ind.name)}
              style={{
                background: 'none',
                border: 'none',
                color: ind.visible ? THEME_TOKENS.colors.textSecondary : THEME_TOKENS.colors.textMuted,
                cursor: 'pointer',
                padding: '0 2px',
                fontSize: 10,
                display: 'inline-flex',
                alignItems: 'center'
              }}
              title={ind.visible ? 'Hide Indicator' : 'Show Indicator'}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
                {!ind.visible && <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" />}
              </svg>
            </button>

            <button
              type="button"
              onClick={() => toggleIndicator(ind.name)}
              style={{
                background: 'none',
                border: 'none',
                color: THEME_TOKENS.colors.textSecondary,
                cursor: 'pointer',
                padding: '0 2px',
                fontSize: 11,
                lineHeight: 1
              }}
              title="Remove Indicator"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
