import React, { useState, useEffect, useCallback } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'
import type {
  FearGreedResult,
  FearGreedHistoryItem,
  CotReportResult,
  CentralBankStanceResult
} from '@shared/types'

export const MacroPanel: React.FC = () => {
  const symbol = useMarketStore((state) => state.symbol)
  const [fearGreed, setFearGreed] = useState<FearGreedResult | null>(null)
  const [fgHistory, setFgHistory] = useState<FearGreedHistoryItem[]>([])
  const [cot, setCot] = useState<CotReportResult | null>(null)
  const [centralBanks, setCentralBanks] = useState<CentralBankStanceResult[]>([])
  const [activeTab, setActiveTab] = useState<'sentiment' | 'cot' | 'banks'>('sentiment')
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const loadMacroData = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) setIsLoading(true)
        const [fg, hist, cotData, banks] = await Promise.all([
          window.api.macro.getFearGreed(),
          window.api.macro.getFearGreedHistory(),
          symbol ? window.api.macro.getCot(symbol) : Promise.resolve(null),
          window.api.macro.getCentralBanks()
        ])
        setFearGreed(fg)
        setFgHistory(hist)
        setCot(cotData)
        setCentralBanks(banks)
      } catch (err) {
        console.error('[MacroPanel] Failed to fetch macro data:', err)
      } finally {
        setIsLoading(false)
      }
    },
    [symbol]
  )

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.api.macro.getFearGreed(),
      window.api.macro.getFearGreedHistory(),
      symbol ? window.api.macro.getCot(symbol) : Promise.resolve(null),
      window.api.macro.getCentralBanks()
    ])
      .then(([fg, hist, cotData, banks]) => {
        if (!cancelled) {
          setFearGreed(fg)
          setFgHistory(hist)
          setCot(cotData)
          setCentralBanks(banks)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[MacroPanel] Failed to fetch macro data:', err)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [symbol])

  const getFgColor = (score: number): string => {
    if (score < 25) return THEME_TOKENS.colors.bearish // Extreme Fear
    if (score < 45) return '#f59e0b' // Fear
    if (score <= 55) return THEME_TOKENS.colors.accent // Neutral
    if (score <= 75) return '#10b981' // Greed
    return THEME_TOKENS.colors.bullish // Extreme Greed
  }

  const getStanceColor = (stance: string): string => {
    if (stance === 'Hawkish') return THEME_TOKENS.colors.bearish
    if (stance === 'Dovish') return THEME_TOKENS.colors.bullish
    return THEME_TOKENS.colors.accent
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
          Macro & Global Policy
        </span>

        <button
          type="button"
          onClick={() => loadMacroData(true)}
          className="tv-btn"
          title="Refresh Macro Data"
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
          onClick={() => setActiveTab('sentiment')}
          style={{
            flex: 1,
            padding: '7px 4px',
            fontSize: 11,
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color:
              activeTab === 'sentiment'
                ? THEME_TOKENS.colors.accent
                : THEME_TOKENS.colors.textSecondary,
            borderBottom:
              activeTab === 'sentiment'
                ? `2px solid ${THEME_TOKENS.colors.accent}`
                : '2px solid transparent'
          }}
        >
          Fear & Greed
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cot')}
          style={{
            flex: 1,
            padding: '7px 4px',
            fontSize: 11,
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color:
              activeTab === 'cot' ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textSecondary,
            borderBottom:
              activeTab === 'cot'
                ? `2px solid ${THEME_TOKENS.colors.accent}`
                : '2px solid transparent'
          }}
        >
          CFTC COT
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('banks')}
          style={{
            flex: 1,
            padding: '7px 4px',
            fontSize: 11,
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color:
              activeTab === 'banks'
                ? THEME_TOKENS.colors.accent
                : THEME_TOKENS.colors.textSecondary,
            borderBottom:
              activeTab === 'banks'
                ? `2px solid ${THEME_TOKENS.colors.accent}`
                : '2px solid transparent'
          }}
        >
          Central Banks
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {!isLoading && !fearGreed && !cot && centralBanks.length === 0 && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            Live macro data unavailable.
          </div>
        )}

        {/* TAB 1: FEAR & GREED */}
        {activeTab === 'sentiment' && !isLoading && !fearGreed && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            Fear & Greed data unavailable.
          </div>
        )}
        {activeTab === 'sentiment' && fearGreed && (
          <div>
            {/* Fear & Greed Dial Card */}
            <div
              style={{
                backgroundColor: THEME_TOKENS.colors.bgApp,
                padding: 14,
                borderRadius: 4,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                textAlign: 'center',
                marginBottom: 12
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: THEME_TOKENS.colors.textSecondary,
                  marginBottom: 6,
                  textTransform: 'uppercase'
                }}
              >
                Market Sentiment Index
              </div>

              <div
                style={{
                  fontSize: 44,
                  fontWeight: 900,
                  fontFamily: THEME_TOKENS.typography?.fontMono,
                  color: getFgColor(fearGreed.score),
                  lineHeight: 1
                }}
              >
                {fearGreed.score}
              </div>

              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  marginTop: 6,
                  color: getFgColor(fearGreed.score)
                }}
              >
                {fearGreed.rating}
              </div>

              {/* Progress Slider */}
              <div
                style={{
                  height: 6,
                  backgroundColor: THEME_TOKENS.colors.bgSurface,
                  borderRadius: 3,
                  marginTop: 12,
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${fearGreed.score}%`,
                    backgroundColor: getFgColor(fearGreed.score),
                    borderRadius: 3
                  }}
                />
              </div>

              {/* Historical Benchmarks */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  marginTop: 14,
                  textAlign: 'left',
                  fontSize: 11,
                  borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  paddingTop: 10
                }}
              >
                <div>
                  <div style={{ color: THEME_TOKENS.colors.textSecondary }}>Previous Close</div>
                  <div style={{ fontWeight: 600, color: THEME_TOKENS.colors.textBright }}>
                    {fearGreed.previousClose}
                  </div>
                </div>
                <div>
                  <div style={{ color: THEME_TOKENS.colors.textSecondary }}>1 Week Ago</div>
                  <div style={{ fontWeight: 600, color: THEME_TOKENS.colors.textBright }}>
                    {fearGreed.previous1Week}
                  </div>
                </div>
                <div>
                  <div style={{ color: THEME_TOKENS.colors.textSecondary }}>1 Month Ago</div>
                  <div style={{ fontWeight: 600, color: THEME_TOKENS.colors.textBright }}>
                    {fearGreed.previous1Month}
                  </div>
                </div>
                <div>
                  <div style={{ color: THEME_TOKENS.colors.textSecondary }}>1 Year Ago</div>
                  <div style={{ fontWeight: 600, color: THEME_TOKENS.colors.textBright }}>
                    {fearGreed.previous1Year}
                  </div>
                </div>
              </div>
            </div>

            {/* 30-Day Historical Trend */}
            {fgHistory.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: THEME_TOKENS.colors.textSecondary,
                    marginBottom: 8,
                    textTransform: 'uppercase'
                  }}
                >
                  30-Day Trend History
                </div>
                <div
                  style={{
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    padding: 8,
                    borderRadius: 4,
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 3,
                    height: 80
                  }}
                >
                  {fgHistory.slice(-24).map((item, idx) => {
                    const barHeight = Math.max(8, (item.score / 100) * 64)
                    return (
                      <div
                        key={idx}
                        title={`${new Date(item.timestamp).toLocaleDateString()}: ${item.score} (${item.rating})`}
                        style={{
                          flex: 1,
                          height: `${barHeight}px`,
                          backgroundColor: getFgColor(item.score),
                          borderRadius: '1px 1px 0 0',
                          opacity: 0.85
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CFTC COMMITMENT OF TRADERS (COT) */}
        {activeTab === 'cot' && !isLoading && !cot && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            COT data unavailable for {symbol || 'the selected symbol'}.
          </div>
        )}
        {activeTab === 'cot' && cot && (
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.textBright }}>
                  Market: {cot.symbol}
                </span>
                <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                  As of: {cot.asOfDate}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  marginTop: 8,
                  fontSize: 11
                }}
              >
                <div>
                  <div style={{ color: THEME_TOKENS.colors.textSecondary }}>Commercial Net</div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontFamily: THEME_TOKENS.typography?.fontMono,
                      color:
                        cot.commercialNet !== undefined && cot.commercialNet >= 0
                          ? THEME_TOKENS.colors.bullish
                          : THEME_TOKENS.colors.bearish
                    }}
                  >
                    {cot.commercialNet === undefined
                      ? 'Unavailable'
                      : `${cot.commercialNet > 0 ? '+' : ''}${cot.commercialNet.toLocaleString()}`}
                  </div>
                </div>

                <div>
                  <div style={{ color: THEME_TOKENS.colors.textSecondary }}>Non-Commercial Net</div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontFamily: THEME_TOKENS.typography?.fontMono,
                      color:
                        cot.nonCommercialNet !== undefined && cot.nonCommercialNet >= 0
                          ? THEME_TOKENS.colors.bullish
                          : THEME_TOKENS.colors.bearish
                    }}
                  >
                    {cot.nonCommercialNet === undefined
                      ? 'Unavailable'
                      : `${cot.nonCommercialNet > 0 ? '+' : ''}${cot.nonCommercialNet.toLocaleString()}`}
                  </div>
                </div>
              </div>
            </div>

            {/* Position Breakdowns */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: THEME_TOKENS.colors.textSecondary,
                marginBottom: 8,
                textTransform: 'uppercase'
              }}
            >
              Institutional Breakdown
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cot.positions.map((pos) => {
                const total =
                  pos.longPositions !== undefined && pos.shortPositions !== undefined
                    ? Math.max(1, pos.longPositions + pos.shortPositions)
                    : 1
                const longPct =
                  pos.longPositions !== undefined
                    ? Math.round((pos.longPositions / total) * 100)
                    : 0

                return (
                  <div
                    key={pos.category}
                    style={{
                      backgroundColor: THEME_TOKENS.colors.bgApp,
                      padding: 8,
                      borderRadius: 4,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontWeight: 600,
                        color: THEME_TOKENS.colors.textBright,
                        marginBottom: 4
                      }}
                    >
                      <span>{pos.category}</span>
                      <span
                        style={{
                          fontFamily: THEME_TOKENS.typography?.fontMono,
                          color:
                            pos.netPositions !== undefined && pos.netPositions >= 0
                              ? THEME_TOKENS.colors.bullish
                              : THEME_TOKENS.colors.bearish
                        }}
                      >
                        Net:{' '}
                        {pos.netPositions === undefined
                          ? 'Unavailable'
                          : `${pos.netPositions > 0 ? '+' : ''}${pos.netPositions.toLocaleString()}`}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        height: 6,
                        borderRadius: 3,
                        overflow: 'hidden',
                        backgroundColor: THEME_TOKENS.colors.bgSurface,
                        marginBottom: 4
                      }}
                    >
                      <div
                        style={{
                          width: `${longPct}%`,
                          backgroundColor: THEME_TOKENS.colors.bullish
                        }}
                      />
                      <div
                        style={{
                          width: `${100 - longPct}%`,
                          backgroundColor: THEME_TOKENS.colors.bearish
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 10,
                        color: THEME_TOKENS.colors.textSecondary
                      }}
                    >
                      <span>
                        Longs:{' '}
                        {pos.longPositions === undefined
                          ? 'Unavailable'
                          : pos.longPositions.toLocaleString()}
                      </span>
                      <span>
                        Shorts:{' '}
                        {pos.shortPositions === undefined
                          ? 'Unavailable'
                          : pos.shortPositions.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TAB 3: CENTRAL BANK STANCES */}
        {activeTab === 'banks' && !isLoading && centralBanks.length === 0 && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            Central-bank data unavailable.
          </div>
        )}
        {activeTab === 'banks' && centralBanks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {centralBanks.map((b) => (
              <div
                key={b.code}
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
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
                      {b.code}
                    </span>
                    <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
                      {b.bank}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 3,
                      backgroundColor: `${getStanceColor(b.stance)}22`,
                      color: getStanceColor(b.stance),
                      textTransform: 'uppercase'
                    }}
                  >
                    {b.stance}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    marginBottom: 6
                  }}
                >
                  <span style={{ color: THEME_TOKENS.colors.textSecondary }}>Policy Rate:</span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontFamily: THEME_TOKENS.typography?.fontMono,
                      color: THEME_TOKENS.colors.textBright
                    }}
                  >
                    {b.rate}
                  </span>
                </div>

                {b.nextMeetingDate && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 10,
                      color: THEME_TOKENS.colors.textSecondary,
                      marginBottom: 6
                    }}
                  >
                    <span>Next Meeting:</span>
                    <span style={{ color: THEME_TOKENS.colors.textPrimary }}>
                      {b.nextMeetingDate}
                    </span>
                  </div>
                )}

                <div
                  style={{
                    fontSize: 11,
                    lineHeight: 1.4,
                    color: THEME_TOKENS.colors.textPrimary,
                    borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    paddingTop: 6
                  }}
                >
                  {b.summary}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
