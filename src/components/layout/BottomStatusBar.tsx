import React, { useState, useEffect } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { useUpdaterStore } from '../../stores/useUpdaterStore'
import { THEME_TOKENS } from '../../theme/tokens'

export const BottomStatusBar: React.FC = () => {
  const connectionState = useMarketStore((state) => state.connectionState)
  const symbol = useMarketStore((state) => state.symbol)
  const updaterStatus = useUpdaterStore((state) => state.status)
  const installUpdate = useUpdaterStore((state) => state.installUpdate)
  const [utcTime, setUtcTime] = useState('')

  useEffect(() => {
    const updateTime = (): void => {
      const now = new Date()
      const hours = String(now.getUTCHours()).padStart(2, '0')
      const minutes = String(now.getUTCMinutes()).padStart(2, '0')
      const seconds = String(now.getUTCSeconds()).padStart(2, '0')
      setUtcTime(`${hours}:${minutes}:${seconds} (UTC)`)
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  const isConnected = connectionState.status === 'connected'

  // ponytail: Simplified market open indicator using local UTC hours; upgrade to exchange holiday calendar when exchange session spec is finalized.
  const currentUtcHour = new Date().getUTCHours()
  const isMarketOpen = currentUtcHour >= 0 && currentUtcHour < 24 // Crypto / Forex active 24/5

  return (
    <div
      style={{
        height: THEME_TOKENS.dimensions.bottomStatusHeight,
        minHeight: THEME_TOKENS.dimensions.bottomStatusHeight,
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        fontSize: 11,
        color: THEME_TOKENS.colors.textSecondary,
        zIndex: 20,
        userSelect: 'none'
      }}
    >
      {/* 1. Market Status Indicator (TradingView Green/Orange dot + Market Open) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: isConnected ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.impactMedium,
            boxShadow: `0 0 6px ${isConnected ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.impactMedium}`
          }}
        />
        <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.textPrimary }}>
          {isConnected ? (isMarketOpen ? 'Market Open' : 'Market Closed') : 'Connecting...'}
        </span>
        <span style={{ color: THEME_TOKENS.colors.textMuted }}>•</span>
        <span style={{ color: THEME_TOKENS.colors.textSecondary }}>{symbol}</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* 2. Auto-Updater Status Pill */}
      {updaterStatus.state === 'downloading' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginRight: 16,
            color: THEME_TOKENS.colors.accent,
            fontSize: 10,
            fontWeight: 600
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: THEME_TOKENS.colors.accent,
              boxShadow: `0 0 6px ${THEME_TOKENS.colors.accent}`
            }}
          />
          Updating {updaterStatus.progressPercent ?? 0}%
        </div>
      )}

      {updaterStatus.state === 'downloaded' && (
        <button
          type="button"
          onClick={() => installUpdate()}
          title="Click to restart and install update"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginRight: 16,
            padding: '2px 8px',
            backgroundColor: THEME_TOKENS.colors.bullish,
            color: '#ffffff',
            border: 'none',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <span>Update Ready [Restart]</span>
        </button>
      )}

      {/* 3. Latency & UTC Clock (Exact TradingView right-hand time badge) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isConnected && connectionState.latencyMs !== undefined && (
          <span
            style={{
              fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
              fontSize: 10,
              color: THEME_TOKENS.colors.textMuted
            }}
          >
            {connectionState.latencyMs}ms
          </span>
        )}

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
    </div>
  )
}
