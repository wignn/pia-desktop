import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'
import type { OptionChainData, OptionGexData, OptionSummaryData } from '@shared/types'

export const OptionsPanel: React.FC = () => {
  const { symbol, symbols } = useMarketStore()
  const symInfo = symbol ? symbols.find((item) => item.symbol === symbol) : undefined
  const [chain, setChain] = useState<OptionChainData | null>(null)
  const [gex, setGex] = useState<OptionGexData | null>(null)
  const [summary, setSummary] = useState<OptionSummaryData | null>(null)
  const [activeTab, setActiveTab] = useState<'chain' | 'gex' | 'summary'>('gex')
  const [selectedExp, setSelectedExp] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const loadOptionsData = useCallback(
    async (showLoading = false) => {
      if (!symbol) return
      try {
        if (showLoading) setIsLoading(true)
        const [cData, gData, sData] = await Promise.all([
          symInfo?.capabilities.options ? window.api.options.getChain(symbol) : Promise.resolve(null),
          symInfo?.capabilities.gex ? window.api.options.getGex(symbol) : Promise.resolve(null),
          window.api.options.getSummary()
        ])
        setChain(cData)
        setGex(gData)
        setSummary(sData)
        setSelectedExp((prev) =>
          !prev && cData?.expirations?.length ? cData.expirations[0] : prev
        )
      } catch (err) {
        console.error('[OptionsPanel] Failed to fetch options data:', err)
      } finally {
        setIsLoading(false)
      }
    },
    [symbol, symInfo]
  )

  useEffect(() => {
    let cancelled = false
    if (!symbol) {
      setChain(null)
      setGex(null)
      setIsLoading(false)
      return () => {
        cancelled = true
      }
    }
    Promise.all([
      symInfo?.capabilities.options ? window.api.options.getChain(symbol) : Promise.resolve(null),
      symInfo?.capabilities.gex ? window.api.options.getGex(symbol) : Promise.resolve(null),
      window.api.options.getSummary()
    ])
      .then(([cData, gData, sData]) => {
        if (!cancelled) {
          setChain(cData)
          setGex(gData)
          setSummary(sData)
          setSelectedExp((prev) =>
            !prev && cData?.expirations?.length ? cData.expirations[0] : prev
          )
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[OptionsPanel] Failed to fetch options data:', err)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [symbol, symInfo])

  const formatGex = (val?: number): string => {
    if (val === undefined) return 'Unavailable'
    const sign = val > 0 ? '+' : ''
    if (Math.abs(val) >= 1e9) return `${sign}${(val / 1e9).toFixed(2)}B`
    if (Math.abs(val) >= 1e6) return `${sign}${(val / 1e6).toFixed(2)}M`
    if (Math.abs(val) >= 1e3) return `${sign}${(val / 1e3).toFixed(1)}K`
    return `${sign}${val.toFixed(0)}`
  }

  const formatNumber = (val?: number, digits = 2): string =>
    val === undefined ? 'Unavailable' : val.toFixed(digits)

  const maxAbsGex = useMemo(() => {
    if (!gex || gex.levels.length === 0) return 1
    return Math.max(
      1,
      ...gex.levels.map((l) => Math.max(Math.abs(l.callGex ?? 0), Math.abs(l.putGex ?? 0)))
    )
  }, [gex])

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: THEME_TOKENS.colors.textBright }}>
            Options & Derivatives
          </span>
          <span
            style={{
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 3,
              backgroundColor: THEME_TOKENS.colors.bgActive,
              color: THEME_TOKENS.colors.accent,
              fontWeight: 600
            }}
          >
            {symbol}
          </span>
        </div>

        <button
          type="button"
          onClick={() => loadOptionsData(true)}
          className="tv-btn"
          title="Refresh Options"
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

      {/* Sub-Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          backgroundColor: THEME_TOKENS.colors.bgApp
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('gex')}
          style={{
            flex: 1,
            padding: '7px 4px',
            fontSize: 11,
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color:
              activeTab === 'gex' ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textSecondary,
            borderBottom:
              activeTab === 'gex'
                ? `2px solid ${THEME_TOKENS.colors.accent}`
                : '2px solid transparent'
          }}
        >
          GEX Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('chain')}
          style={{
            flex: 1,
            padding: '7px 4px',
            fontSize: 11,
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color:
              activeTab === 'chain'
                ? THEME_TOKENS.colors.accent
                : THEME_TOKENS.colors.textSecondary,
            borderBottom:
              activeTab === 'chain'
                ? `2px solid ${THEME_TOKENS.colors.accent}`
                : '2px solid transparent'
          }}
        >
          Option Chain
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          style={{
            flex: 1,
            padding: '7px 4px',
            fontSize: 11,
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color:
              activeTab === 'summary'
                ? THEME_TOKENS.colors.accent
                : THEME_TOKENS.colors.textSecondary,
            borderBottom:
              activeTab === 'summary'
                ? `2px solid ${THEME_TOKENS.colors.accent}`
                : '2px solid transparent'
          }}
        >
          Market PCR
        </button>
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {!isLoading && !gex && !chain && !summary && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            Live options data unavailable for {symbol || 'the selected symbol'}.
          </div>
        )}

        {/* TAB 1: GEX PROFILE */}
        {activeTab === 'gex' && gex && (
          <div>
            {/* Net GEX Banner */}
            <div
              style={{
                backgroundColor: THEME_TOKENS.colors.bgApp,
                padding: 10,
                borderRadius: 4,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                marginBottom: 12
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
                <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
                  NET GAMMA EXPOSURE
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
                    color:
                      gex.netGex !== undefined && gex.netGex >= 0
                        ? THEME_TOKENS.colors.bullish
                        : THEME_TOKENS.colors.bearish
                  }}
                >
                  {formatGex(gex.netGex)}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 6,
                  fontSize: 10,
                  marginTop: 8
                }}
              >
                <div
                  style={{
                    backgroundColor: THEME_TOKENS.colors.bgSurface,
                    padding: 6,
                    borderRadius: 3
                  }}
                >
                  <div style={{ color: THEME_TOKENS.colors.textSecondary }}>Zero Gamma</div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: THEME_TOKENS.colors.textBright,
                      marginTop: 2,
                      fontFamily: THEME_TOKENS.typography?.fontMono
                    }}
                  >
                    {gex.zeroGammaLevel === undefined
                      ? 'Unavailable'
                      : `$${gex.zeroGammaLevel.toLocaleString()}`}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: THEME_TOKENS.colors.bgSurface,
                    padding: 6,
                    borderRadius: 3
                  }}
                >
                  <div style={{ color: THEME_TOKENS.colors.bullish }}>Call Wall</div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: THEME_TOKENS.colors.textBright,
                      marginTop: 2,
                      fontFamily: THEME_TOKENS.typography?.fontMono
                    }}
                  >
                    {gex.callWall === undefined
                      ? 'Unavailable'
                      : `$${gex.callWall.toLocaleString()}`}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: THEME_TOKENS.colors.bgSurface,
                    padding: 6,
                    borderRadius: 3
                  }}
                >
                  <div style={{ color: THEME_TOKENS.colors.bearish }}>Put Wall</div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: THEME_TOKENS.colors.textBright,
                      marginTop: 2,
                      fontFamily: THEME_TOKENS.typography?.fontMono
                    }}
                  >
                    {gex.putWall === undefined ? 'Unavailable' : `$${gex.putWall.toLocaleString()}`}
                  </div>
                </div>
              </div>
            </div>

            {/* GEX Level Histogram */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: THEME_TOKENS.colors.textSecondary,
                marginBottom: 8,
                textTransform: 'uppercase'
              }}
            >
              Gamma by Strike (Puts vs Calls)
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {gex.levels.map((lvl) => {
                const callPct = Math.min(
                  100,
                  Math.round((Math.abs(lvl.callGex ?? 0) / maxAbsGex) * 100)
                )
                const putPct = Math.min(
                  100,
                  Math.round((Math.abs(lvl.putGex ?? 0) / maxAbsGex) * 100)
                )
                const isZero =
                  gex.zeroGammaLevel !== undefined && Math.abs(lvl.strike - gex.zeroGammaLevel) < 20

                return (
                  <div
                    key={lvl.strike}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 60px 1fr',
                      alignItems: 'center',
                      fontSize: 10,
                      gap: 4
                    }}
                  >
                    {/* Put GEX bar (aligns right) */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', height: 12 }}>
                      <div
                        style={{
                          width: `${putPct}%`,
                          backgroundColor: THEME_TOKENS.colors.bearish,
                          borderRadius: '2px 0 0 2px'
                        }}
                      />
                    </div>

                    {/* Strike Center */}
                    <div
                      style={{
                        textAlign: 'center',
                        fontWeight: isZero ? 700 : 500,
                        color: isZero
                          ? THEME_TOKENS.colors.accent
                          : THEME_TOKENS.colors.textPrimary,
                        backgroundColor: isZero ? THEME_TOKENS.colors.bgActive : 'transparent',
                        borderRadius: 2,
                        fontFamily: THEME_TOKENS.typography?.fontMono
                      }}
                    >
                      ${lvl.strike}
                    </div>

                    {/* Call GEX bar (aligns left) */}
                    <div style={{ display: 'flex', justifyContent: 'flex-start', height: 12 }}>
                      <div
                        style={{
                          width: `${callPct}%`,
                          backgroundColor: THEME_TOKENS.colors.bullish,
                          borderRadius: '0 2px 2px 0'
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TAB 2: OPTION CHAIN */}
        {activeTab === 'chain' && chain && (
          <div>
            {/* Expiration Selector */}
            {chain.expirations.length > 0 && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10 }}>
                {chain.expirations.map((exp) => (
                  <button
                    key={exp}
                    type="button"
                    onClick={() => setSelectedExp(exp)}
                    className={`tv-btn ${selectedExp === exp ? 'active' : ''}`}
                    style={{
                      fontSize: 10,
                      padding: '3px 8px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {exp}
                  </button>
                ))}
              </div>
            )}

            {/* Chain Table */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1.2fr 1fr 1fr',
                padding: '4px 6px',
                fontSize: 10,
                fontWeight: 600,
                color: THEME_TOKENS.colors.textSecondary,
                borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                textAlign: 'center'
              }}
            >
              <span style={{ color: THEME_TOKENS.colors.bullish }}>CALL BID</span>
              <span style={{ color: THEME_TOKENS.colors.bullish }}>IV</span>
              <span>STRIKE</span>
              <span style={{ color: THEME_TOKENS.colors.bearish }}>PUT BID</span>
              <span style={{ color: THEME_TOKENS.colors.bearish }}>IV</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {chain.calls.map((call, idx) => {
                const put = chain.puts[idx]
                return (
                  <div
                    key={call.strike}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1.2fr 1fr 1fr',
                      padding: '4px 6px',
                      fontSize: 10,
                      textAlign: 'center',
                      fontFamily: THEME_TOKENS.typography?.fontMono,
                      borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                    }}
                  >
                    <span style={{ color: THEME_TOKENS.colors.textPrimary }}>
                      {call.bid === undefined ? 'Unavailable' : `$${call.bid.toFixed(2)}`}
                    </span>
                    <span style={{ color: THEME_TOKENS.colors.textSecondary }}>
                      {call.impliedVolatility === undefined
                        ? 'Unavailable'
                        : `${(call.impliedVolatility * 100).toFixed(1)}%`}
                    </span>
                    <span style={{ fontWeight: 700, color: THEME_TOKENS.colors.accent }}>
                      ${call.strike}
                    </span>
                    <span style={{ color: THEME_TOKENS.colors.textPrimary }}>
                      {put?.bid === undefined ? 'Unavailable' : `$${put.bid.toFixed(2)}`}
                    </span>
                    <span style={{ color: THEME_TOKENS.colors.textSecondary }}>
                      {put?.impliedVolatility === undefined
                        ? 'Unavailable'
                        : `${(put.impliedVolatility * 100).toFixed(1)}%`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TAB 3: MARKET SUMMARY & PCR */}
        {activeTab === 'summary' && summary && (
          <div>
            <div
              style={{
                backgroundColor: THEME_TOKENS.colors.bgApp,
                padding: 10,
                borderRadius: 4,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                marginBottom: 12
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
                <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
                  MARKET PUT / CALL RATIO
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: THEME_TOKENS.typography?.fontMono,
                    color:
                      summary.putCallRatio !== undefined && summary.putCallRatio > 1
                        ? THEME_TOKENS.colors.bearish
                        : THEME_TOKENS.colors.bullish
                  }}
                >
                  {formatNumber(summary.putCallRatio)}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  fontSize: 11,
                  marginTop: 8
                }}
              >
                <div>
                  <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 10 }}>
                    Total Volume
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: THEME_TOKENS.colors.textBright,
                      marginTop: 2
                    }}
                  >
                    {summary.totalVolume === undefined
                      ? 'Unavailable'
                      : `${summary.totalVolume.toLocaleString()} contracts`}
                  </div>
                </div>
                <div>
                  <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 10 }}>
                    Total Open Interest
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: THEME_TOKENS.colors.textBright,
                      marginTop: 2
                    }}
                  >
                    {summary.totalOpenInterest === undefined
                      ? 'Unavailable'
                      : `${summary.totalOpenInterest.toLocaleString()} contracts`}
                  </div>
                </div>
              </div>
            </div>

            {/* Most active symbols */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: THEME_TOKENS.colors.textSecondary,
                marginBottom: 6,
                textTransform: 'uppercase'
              }}
            >
              Most Active Derivative Contracts
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {summary.mostActiveSymbols.map((item) => (
                <div
                  key={item.symbol}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    borderRadius: 3,
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    fontSize: 11
                  }}
                >
                  <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.textBright }}>
                    {item.symbol}
                  </span>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ color: THEME_TOKENS.colors.textSecondary }}>
                      Vol:{' '}
                      {item.volume === undefined ? 'Unavailable' : item.volume.toLocaleString()}
                    </span>
                    <span
                      style={{
                        fontFamily: THEME_TOKENS.typography?.fontMono,
                        color:
                          item.pcr !== undefined && item.pcr > 1
                            ? THEME_TOKENS.colors.bearish
                            : THEME_TOKENS.colors.bullish
                      }}
                    >
                      PCR: {formatNumber(item.pcr)}
                    </span>
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
