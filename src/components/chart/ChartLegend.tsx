import React from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
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
      {/* 1. Main Symbol Info & OHLC Status Bar with Frosted Capsule */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          flexWrap: 'nowrap',
          gap: 8,
          lineHeight: '20px',
          whiteSpace: 'nowrap',
          backgroundColor: 'rgba(11, 14, 20, 0.72)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
          borderRadius: 6,
          padding: '2px 8px'
        }}
      >
        {/* Symbol & Timeframe & Exchange badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <SymbolLogo symbol={symbol} size={16} />
          <span style={{ fontWeight: 700, color: THEME_TOKENS.colors.textBright, fontSize: 13, letterSpacing: '0.02em' }}>
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
          <span
            style={{
              fontSize: 9,
              color: THEME_TOKENS.colors.gold,
              backgroundColor: THEME_TOKENS.colors.goldBg,
              border: '1px solid rgba(245, 158, 11, 0.22)',
              borderRadius: 3,
              padding: '0 4px',
              textTransform: 'uppercase',
              fontWeight: 700,
              letterSpacing: '0.04em'
            }}
          >
            {symInfo?.category || 'FOREX'}
          </span>
        </div>

        {/* OHLC and Net Change */}
        {close !== undefined && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              color: THEME_TOKENS.colors.textSecondary,
              fontFamily: THEME_TOKENS.typography?.fontMono,
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {open !== undefined && (
              <span>
                O <span style={{ color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish, fontWeight: 500 }}>{formatPrice(open)}</span>
              </span>
            )}
            {high !== undefined && (
              <span>
                H <span style={{ color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish, fontWeight: 500 }}>{formatPrice(high)}</span>
              </span>
            )}
            {low !== undefined && (
              <span>
                L <span style={{ color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish, fontWeight: 500 }}>{formatPrice(low)}</span>
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
    </div>
  )
}
