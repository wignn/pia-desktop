import React from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'
import { getSymbolPrecision } from '@shared/market-utils'

export const ChartLegend: React.FC = () => {
  const { symbol, timeframe, selectedBar, prices, symbols } = useMarketStore()
  const livePrice = symbol ? prices[symbol]?.price : undefined
  const symInfo = symbols.find((s) => s.symbol === symbol)
  const precision = getSymbolPrecision(symbol ?? '', symInfo?.category, livePrice)

  // Format numbers nicely
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

  const open = selectedBar?.open
  const high = selectedBar?.high
  const low = selectedBar?.low
  const close = selectedBar?.close ?? livePrice
  const volume = selectedBar?.volume

  const change = open !== undefined && close !== undefined ? close - open : 0
  const changePercent =
    open !== undefined && open > 0 && close !== undefined ? (change / open) * 100 : 0
  const isUp = change >= 0

  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        left: 12,
        zIndex: 10,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        fontSize: 12,
        fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 700, color: THEME_TOKENS.colors.textBright, fontSize: 13 }}>
          {symbol}
        </span>
        <span
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSurface,
            border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
            padding: '1px 5px',
            borderRadius: 3,
            color: THEME_TOKENS.colors.accent,
            fontSize: 11,
            fontWeight: 600
          }}
        >
          {timeframe.toUpperCase()}
        </span>
      </div>

      {close !== undefined && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: THEME_TOKENS.colors.textSecondary
          }}
        >
          {open !== undefined && (
            <span>
              O <span style={{ color: THEME_TOKENS.colors.textPrimary }}>{formatPrice(open)}</span>
            </span>
          )}
          {high !== undefined && (
            <span>
              H <span style={{ color: THEME_TOKENS.colors.textPrimary }}>{formatPrice(high)}</span>
            </span>
          )}
          {low !== undefined && (
            <span>
              L <span style={{ color: THEME_TOKENS.colors.textPrimary }}>{formatPrice(low)}</span>
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
            <span>
              Vol{' '}
              <span style={{ color: THEME_TOKENS.colors.textPrimary }}>{formatVol(volume)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
