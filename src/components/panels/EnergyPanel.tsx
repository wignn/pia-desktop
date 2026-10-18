import React, { useState, useEffect, useCallback } from 'react'
import { THEME_TOKENS } from '../../theme/tokens'
import type { EnergyDashboardData } from '@shared/types'

export const EnergyPanel: React.FC = () => {
  const [energy, setEnergy] = useState<EnergyDashboardData | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const loadData = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setIsLoading(true)
      const data = await window.api.energy.getDashboard()
      setEnergy(data)
    } catch (err) {
      console.error('[EnergyPanel] Failed to fetch energy dashboard:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    window.api.energy
      .getDashboard()
      .then((data) => {
        if (!cancelled) {
          setEnergy(data)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[EnergyPanel] Failed to fetch energy dashboard:', err)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        fontSize: 12
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 12px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, color: THEME_TOKENS.colors.textBright }}>
          Energy Complex & Cracks
        </span>

        <button
          type="button"
          onClick={() => loadData(true)}
          className="tv-btn"
          title="Refresh Energy Data"
          disabled={isLoading}
          style={{ padding: 4 }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              animation: isLoading ? 'spin 1s linear infinite' : 'none'
            }}
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {!isLoading && !energy && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            Live energy dashboard unavailable.
          </div>
        )}
        {energy && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Crude Oil Benchmarks Card */}
            <div
              style={{
                backgroundColor: THEME_TOKENS.colors.bgApp,
                padding: 12,
                borderRadius: 4,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: THEME_TOKENS.colors.textSecondary,
                  marginBottom: 8,
                  textTransform: 'uppercase'
                }}
              >
                Crude Benchmarks & Spread
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                    WTI Crude
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      fontFamily: THEME_TOKENS.typography?.fontMono,
                      color: THEME_TOKENS.colors.textBright,
                      marginTop: 2
                    }}
                  >
                    {energy.wtiPrice === undefined
                      ? 'Unavailable'
                      : `$${energy.wtiPrice.toFixed(2)}`}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                    Brent Crude
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      fontFamily: THEME_TOKENS.typography?.fontMono,
                      color: THEME_TOKENS.colors.textBright,
                      marginTop: 2
                    }}
                  >
                    {energy.brentPrice === undefined
                      ? 'Unavailable'
                      : `$${energy.brentPrice.toFixed(2)}`}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  fontSize: 11
                }}
              >
                <span style={{ color: THEME_TOKENS.colors.textSecondary }}>WTI/Brent Spread:</span>
                <span
                  style={{
                    fontWeight: 700,
                    fontFamily: THEME_TOKENS.typography?.fontMono,
                    color: THEME_TOKENS.colors.accent
                  }}
                >
                  {energy.wtiBrentSpread === undefined
                    ? 'Unavailable'
                    : `$${energy.wtiBrentSpread.toFixed(2)} / bbl`}
                </span>
              </div>
            </div>

            {/* 3:2:1 Crack Spread Refining Margin Card */}
            <div
              style={{
                backgroundColor: THEME_TOKENS.colors.bgApp,
                padding: 12,
                borderRadius: 4,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: THEME_TOKENS.colors.textSecondary,
                    textTransform: 'uppercase'
                  }}
                >
                  3:2:1 Crack Margin
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 3,
                    textTransform: 'uppercase',
                    backgroundColor:
                      energy.refiningMarginStatus === undefined
                        ? THEME_TOKENS.colors.bgSurface
                        : energy.refiningMarginStatus === 'expanding'
                          ? `${THEME_TOKENS.colors.bullish}22`
                          : `${THEME_TOKENS.colors.bearish}22`,
                    color:
                      energy.refiningMarginStatus === undefined
                        ? THEME_TOKENS.colors.textSecondary
                        : energy.refiningMarginStatus === 'expanding'
                          ? THEME_TOKENS.colors.bullish
                          : THEME_TOKENS.colors.bearish
                  }}
                >
                  {energy.refiningMarginStatus ?? 'Unavailable'}
                </span>
              </div>

              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  fontFamily: THEME_TOKENS.typography?.fontMono,
                  color: THEME_TOKENS.colors.textBright
                }}
              >
                {energy.crackSpread321 === undefined
                  ? 'Unavailable'
                  : `$${energy.crackSpread321.toFixed(2)}`}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: THEME_TOKENS.colors.textSecondary
                  }}
                >
                  {' '}
                  / bbl
                </span>
              </div>

              <div style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary, marginTop: 4 }}>
                Refinery profitability indicator: 3 bbl crude into 2 bbl gasoline + 1 bbl
                distillate.
              </div>
            </div>

            {/* Natural Gas Storage & Inventory Card */}
            <div
              style={{
                backgroundColor: THEME_TOKENS.colors.bgApp,
                padding: 12,
                borderRadius: 4,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: THEME_TOKENS.colors.textSecondary,
                  marginBottom: 8,
                  textTransform: 'uppercase'
                }}
              >
                Henry Hub & Gas Storage
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                    Henry Hub Spot
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      fontFamily: THEME_TOKENS.typography?.fontMono,
                      color: THEME_TOKENS.colors.textBright,
                      marginTop: 2
                    }}
                  >
                    {energy.henryHubPrice === undefined
                      ? 'Unavailable'
                      : `$${energy.henryHubPrice.toFixed(3)}`}
                    <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                      /MMBtu
                    </span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                    Working Storage
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      fontFamily: THEME_TOKENS.typography?.fontMono,
                      color: THEME_TOKENS.colors.textBright,
                      marginTop: 2
                    }}
                  >
                    {energy.naturalGasStorageBcf === undefined
                      ? 'Unavailable'
                      : energy.naturalGasStorageBcf.toLocaleString()}
                    <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                      {' '}
                      Bcf
                    </span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  fontSize: 11
                }}
              >
                <span style={{ color: THEME_TOKENS.colors.textSecondary }}>
                  Vs. 5-Year Average:
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    fontFamily: THEME_TOKENS.typography?.fontMono,
                    color:
                      energy.storageVs5YrAvgPct === undefined
                        ? THEME_TOKENS.colors.textSecondary
                        : energy.storageVs5YrAvgPct > 0
                          ? THEME_TOKENS.colors.bearish // Above average = bearish natural gas
                          : THEME_TOKENS.colors.bullish
                  }}
                >
                  {energy.storageVs5YrAvgPct === undefined
                    ? 'Unavailable'
                    : `${energy.storageVs5YrAvgPct > 0 ? '+' : ''}${energy.storageVs5YrAvgPct.toFixed(1)}%`}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
