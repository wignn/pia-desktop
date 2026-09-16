import React, { useState, useEffect } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'

export const BottomStatusBar: React.FC = () => {
  const { connectionState, symbol, timeframe, isLoadingCandles } = useMarketStore()
  const [utcTime, setUtcTime] = useState('')

  useEffect(() => {
    const updateTime = (): void => {
      const now = new Date()
      const utcString = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
      setUtcTime(utcString)
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  const getStatusColor = (): string => {
    switch (connectionState.status) {
      case 'connected':
        return THEME_TOKENS.colors.bullish
      case 'connecting':
        return THEME_TOKENS.colors.impactMedium
      case 'error':
      case 'disconnected':
        return THEME_TOKENS.colors.bearish
      default:
        return THEME_TOKENS.colors.textMuted
    }
  }

  const getStatusText = (): string => {
    switch (connectionState.status) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting...'
      case 'error':
        return connectionState.error || 'Connection Error'
      case 'disconnected':
        return 'Disconnected'
      default:
        return 'Idle'
    }
  }

  return (
    <div
      style={{
        height: THEME_TOKENS.dimensions.bottomStatusHeight,
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        fontSize: 11,
        color: THEME_TOKENS.colors.textSecondary,
        zIndex: 20
      }}
    >
      {/* Connection Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: getStatusColor(),
            boxShadow: `0 0 6px ${getStatusColor()}`
          }}
        />
        <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.textPrimary }}>
          {getStatusText()}
        </span>
        {connectionState.latencyMs !== undefined && connectionState.status === 'connected' && (
          <span
            style={{
              fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
              color: THEME_TOKENS.colors.textSecondary
            }}
          >
            ({connectionState.latencyMs}ms)
          </span>
        )}
      </div>

      <div
        style={{
          width: 1,
          height: 14,
          backgroundColor: THEME_TOKENS.colors.borderMedium,
          margin: '0 12px'
        }}
      />

      {/* Symbol & Timeframe badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: THEME_TOKENS.colors.textPrimary, fontWeight: 600 }}>{symbol}</span>
        <span style={{ color: THEME_TOKENS.colors.textMuted }}>•</span>
        <span style={{ color: THEME_TOKENS.colors.accent, fontWeight: 600 }}>{timeframe}</span>
        {isLoadingCandles && (
          <span style={{ color: THEME_TOKENS.colors.impactMedium, fontSize: 10 }}>
            [Fetching Bars...]
          </span>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Bar Engine */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 16 }}>
        <span style={{ color: THEME_TOKENS.colors.textMuted }}>Engine:</span>
        <span style={{ color: THEME_TOKENS.colors.textPrimary, fontWeight: 500 }}>
          KLineChart v10
        </span>
      </div>

      {/* UTC Clock */}
      <div
        style={{
          fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
          color: THEME_TOKENS.colors.textPrimary,
          fontSize: 11
        }}
      >
        {utcTime}
      </div>
    </div>
  )
}
