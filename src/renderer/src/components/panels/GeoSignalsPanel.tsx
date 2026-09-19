import React, { useState, useEffect, useCallback } from 'react'
import { THEME_TOKENS } from '../../theme/tokens'
import { useMarketStore } from '../../stores/useMarketStore'
import type { GeoSignalEventItem, GeoSignalsMapRegion, GeoAssetImpactItem } from '@shared/types'

export const GeoSignalsPanel: React.FC = () => {
  const setSymbol = useMarketStore((state) => state.setSymbol)
  const [events, setEvents] = useState<GeoSignalEventItem[]>([])
  const [regions, setRegions] = useState<GeoSignalsMapRegion[]>([])
  const [impacts, setImpacts] = useState<GeoAssetImpactItem[]>([])
  const [activeTab, setActiveTab] = useState<'events' | 'map' | 'impacts'>('events')
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const loadGeoData = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setIsLoading(true)
      const [evData, regData, impData] = await Promise.all([
        window.api.geosignals.getEvents(),
        window.api.geosignals.getMap(),
        window.api.geosignals.getAssetImpacts()
      ])
      setEvents(evData)
      setRegions(regData)
      setImpacts(impData)
    } catch (err) {
      console.error('[GeoSignalsPanel] Failed to fetch geopolitical data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.api.geosignals.getEvents(),
      window.api.geosignals.getMap(),
      window.api.geosignals.getAssetImpacts()
    ])
      .then(([evData, regData, impData]) => {
        if (!cancelled) {
          setEvents(evData)
          setRegions(regData)
          setImpacts(impData)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[GeoSignalsPanel] Failed to fetch geopolitical data:', err)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const getSeverityColor = (sev: string): string => {
    switch (sev) {
      case 'critical':
        return THEME_TOKENS.colors.bearish
      case 'high':
        return '#f97316'
      case 'medium':
      case 'elevated':
        return '#f59e0b'
      default:
        return THEME_TOKENS.colors.accent
    }
  }

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
          Geopolitical Risk Radar
        </span>

        <button
          type="button"
          onClick={() => loadGeoData(true)}
          className="tv-btn"
          title="Refresh Geopolitical Signals"
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

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          backgroundColor: THEME_TOKENS.colors.bgApp
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('events')}
          style={{
            flex: 1,
            padding: '7px 4px',
            fontSize: 11,
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color:
              activeTab === 'events'
                ? THEME_TOKENS.colors.accent
                : THEME_TOKENS.colors.textSecondary,
            borderBottom:
              activeTab === 'events'
                ? `2px solid ${THEME_TOKENS.colors.accent}`
                : '2px solid transparent'
          }}
        >
          Live Events ({events.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('map')}
          style={{
            flex: 1,
            padding: '7px 4px',
            fontSize: 11,
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color:
              activeTab === 'map' ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textSecondary,
            borderBottom:
              activeTab === 'map'
                ? `2px solid ${THEME_TOKENS.colors.accent}`
                : '2px solid transparent'
          }}
        >
          Chokepoints
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('impacts')}
          style={{
            flex: 1,
            padding: '7px 4px',
            fontSize: 11,
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color:
              activeTab === 'impacts'
                ? THEME_TOKENS.colors.accent
                : THEME_TOKENS.colors.textSecondary,
            borderBottom:
              activeTab === 'impacts'
                ? `2px solid ${THEME_TOKENS.colors.accent}`
                : '2px solid transparent'
          }}
        >
          Asset Impact
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {!isLoading && events.length === 0 && regions.length === 0 && impacts.length === 0 && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            Live geopolitical data unavailable.
          </div>
        )}

        {/* TAB 1: LIVE EVENTS */}
        {activeTab === 'events' && !isLoading && events.length === 0 && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            Live geopolitical events unavailable.
          </div>
        )}
        {activeTab === 'events' && events.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {events.map((ev) => (
              <div
                key={ev.id}
                style={{
                  backgroundColor: THEME_TOKENS.colors.bgApp,
                  padding: 10,
                  borderRadius: 4,
                  border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 4,
                    gap: 6
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      color: THEME_TOKENS.colors.textBright,
                      fontSize: 12,
                      lineHeight: 1.3
                    }}
                  >
                    {ev.title}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 5px',
                      borderRadius: 3,
                      textTransform: 'uppercase',
                      backgroundColor: `${getSeverityColor(ev.severity)}22`,
                      color: getSeverityColor(ev.severity),
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {ev.severity}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 10,
                    color: THEME_TOKENS.colors.textSecondary,
                    marginBottom: 6
                  }}
                >
                  <span>{ev.region}</span>
                  <span>•</span>
                  <span style={{ textTransform: 'capitalize' }}>{ev.category}</span>
                  <span>•</span>
                  <span>
                    {new Date(ev.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: THEME_TOKENS.colors.textPrimary,
                    lineHeight: 1.4,
                    marginBottom: 8
                  }}
                >
                  {ev.summary}
                </div>

                {ev.affectedAssets && ev.affectedAssets.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                      Impact:
                    </span>
                    {ev.affectedAssets.map((ast) => (
                      <button
                        key={ast}
                        type="button"
                        onClick={() => setSymbol(ast)}
                        style={{
                          fontSize: 10,
                          padding: '1px 5px',
                          borderRadius: 2,
                          backgroundColor: THEME_TOKENS.colors.bgSurface,
                          border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                          color: THEME_TOKENS.colors.accent,
                          cursor: 'pointer'
                        }}
                      >
                        {ast}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: CHOKEPOINTS & REGIONAL RISK MAP */}
        {activeTab === 'map' && !isLoading && regions.length === 0 && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            Geopolitical risk map unavailable.
          </div>
        )}
        {activeTab === 'map' && regions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {regions.map((reg) => (
              <div
                key={reg.region}
                style={{
                  backgroundColor: THEME_TOKENS.colors.bgApp,
                  padding: 10,
                  borderRadius: 4,
                  border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 6
                  }}
                >
                  <span style={{ fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
                    {reg.region}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 3,
                      textTransform: 'uppercase',
                      backgroundColor: `${getSeverityColor(reg.riskLevel)}22`,
                      color: getSeverityColor(reg.riskLevel)
                    }}
                  >
                    {reg.riskLevel}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 8,
                    fontSize: 11,
                    marginTop: 6
                  }}
                >
                  <div>
                    <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 10 }}>
                      Active Hotspots
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        color: THEME_TOKENS.colors.textBright,
                        marginTop: 2
                      }}
                    >
                      {reg.activeHotspots} incidents
                    </div>
                  </div>

                  <div>
                    <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 10 }}>
                      Chokepoint Transit
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        color:
                          reg.chokepointStatus.toLowerCase().includes('disrupt') ||
                          reg.chokepointStatus.toLowerCase().includes('threat')
                            ? THEME_TOKENS.colors.bearish
                            : THEME_TOKENS.colors.bullish,
                        marginTop: 2
                      }}
                    >
                      {reg.chokepointStatus}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: ASSET VULNERABILITY */}
        {activeTab === 'impacts' && !isLoading && impacts.length === 0 && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            Geopolitical asset impacts unavailable.
          </div>
        )}
        {activeTab === 'impacts' && impacts.length > 0 && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 60px 1.2fr',
                padding: '4px 8px',
                fontSize: 10,
                fontWeight: 600,
                color: THEME_TOKENS.colors.textSecondary,
                borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
              }}
            >
              <span>ASSET</span>
              <span style={{ textAlign: 'center' }}>RISK</span>
              <span style={{ textAlign: 'right' }}>DRIVER</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {impacts.map((imp) => (
                <div
                  key={imp.symbol}
                  onClick={() => setSymbol(imp.symbol)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 60px 1.2fr',
                    padding: '8px 8px',
                    borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    cursor: 'pointer',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
                      {imp.symbol}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color:
                          imp.supplyDisruptionRisk === 'high'
                            ? THEME_TOKENS.colors.bearish
                            : imp.supplyDisruptionRisk === 'medium'
                              ? '#f59e0b'
                              : THEME_TOKENS.colors.bullish
                      }}
                    >
                      {imp.supplyDisruptionRisk.toUpperCase()} SUPPLY RISK
                    </div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: THEME_TOKENS.typography?.fontMono,
                        color:
                          imp.riskScore > 70
                            ? THEME_TOKENS.colors.bearish
                            : imp.riskScore > 40
                              ? '#f59e0b'
                              : THEME_TOKENS.colors.bullish
                      }}
                    >
                      {imp.riskScore}
                    </span>
                  </div>

                  <div
                    style={{
                      textAlign: 'right',
                      fontSize: 11,
                      color: THEME_TOKENS.colors.textSecondary
                    }}
                  >
                    {imp.primaryDriver}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
