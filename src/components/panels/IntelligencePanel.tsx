import React, { useState, useEffect, useCallback } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'
import { getSymbolPrecision } from '@shared/market-utils'
import type { IntelligenceAnalyzeResult, MarketInsightResult } from '@shared/types'
import { AiMcpEngine, type TechnicalAnalysisResult } from '../../services/ai-mcp-engine'

export const IntelligencePanel: React.FC = () => {
  const symbol = useMarketStore((state) => state.symbol)
  const currentPrice = useMarketStore((state) =>
    state.symbol ? state.prices[state.symbol]?.price : undefined
  )
  const symInfo = useMarketStore((state) =>
    state.symbol ? state.symbols.find((item) => item.symbol === state.symbol) : undefined
  )

  const [analysis, setAnalysis] = useState<IntelligenceAnalyzeResult | null>(null)
  const [insight, setInsight] = useState<MarketInsightResult | null>(null)
  const [mcpResult, setMcpResult] = useState<TechnicalAnalysisResult | null>(null)
  const [queryInput, setQueryInput] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isMcpRunning, setIsMcpRunning] = useState<boolean>(false)
  const [mcpStatusMessage, setMcpStatusMessage] = useState<string | null>(null)
  const [activeOverlaysCount, setActiveOverlaysCount] = useState<number>(0)

  const precision = getSymbolPrecision(symbol ?? '', symInfo?.category, currentPrice)

  const formatPrice = (val?: number): string => {
    if (val === undefined || isNaN(val)) return '--'
    return val.toLocaleString(undefined, {
      minimumFractionDigits: precision.pricePrecision,
      maximumFractionDigits: precision.pricePrecision
    })
  }

  const executeAnalysis = useCallback(
    async (customQuery?: string, showLoading = false) => {
      try {
        if (!symbol) return
        if (showLoading) setIsLoading(true)
        const [anRes, inRes] = await Promise.all([
          window.api.intelligence.analyze({
            symbol,
            query: customQuery || undefined
          }),
          window.api.intelligence.getInsights(symbol)
        ])
        setAnalysis(anRes)
        setInsight(inRes)
      } catch (err) {
        console.error('[IntelligencePanel] Failed to run intelligence:', err)
      } finally {
        setIsLoading(false)
      }
    },
    [symbol]
  )

  // Run AI MCP Chart Technical Analysis & Auto-Draw
  const handleAutoDrawOnChart = async (): Promise<void> => {
    if (!symbol || isMcpRunning) return
    setIsMcpRunning(true)
    setMcpStatusMessage('Ingesting news sentiment and live orderbook...')

    try {
      await new Promise((r) => setTimeout(r, 200))
      setMcpStatusMessage('Evaluating multi-timeframe swing pivots & trendlines...')
      await new Promise((r) => setTimeout(r, 250))
      setMcpStatusMessage('Plotting trendlines, support/resistance, & order blocks on chart...')

      const result = await AiMcpEngine.executeFullChartAnalysis(symbol, true)
      setMcpResult(result)
      setActiveOverlaysCount(result.plottedDrawingsCount)
      setMcpStatusMessage(`Successfully projected ${result.plottedDrawingsCount} technical overlays on chart.`)

      setTimeout(() => {
        setMcpStatusMessage(null)
      }, 4000)
    } catch (err) {
      console.error('[IntelligencePanel] AI MCP Auto-Draw failed:', err)
      setMcpStatusMessage('Failed to plot overlays: Insufficient candle data or provider error.')
    } finally {
      setIsMcpRunning(false)
    }
  }

  // Clear drawings from chart
  const handleClearDrawings = async (): Promise<void> => {
    if (!symbol) return
    try {
      await AiMcpEngine.clearDrawings(symbol)
      setActiveOverlaysCount(0)
      setMcpResult(null)
      setMcpStatusMessage('Cleared technical overlays from chart.')
      setTimeout(() => setMcpStatusMessage(null), 2500)
    } catch (err) {
      console.error('[IntelligencePanel] Failed to clear drawings:', err)
    }
  }

  useEffect(() => {
    let cancelled = false
    if (!symbol) {
      setAnalysis(null)
      setInsight(null)
      setMcpResult(null)
      setIsLoading(false)
      return () => {
        cancelled = true
      }
    }

    Promise.all([
      window.api.intelligence.analyze({ symbol }),
      window.api.intelligence.getInsights(symbol)
    ])
      .then(([anRes, inRes]) => {
        if (!cancelled) {
          setAnalysis(anRes)
          setInsight(inRes)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[IntelligencePanel] Failed to run intelligence:', err)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [symbol])

  const handleQuerySubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const q = queryInput.trim()
    if (!q || !symbol) return

    const lower = q.toLowerCase()
    const wantsDraw =
      lower.includes('gambar') ||
      lower.includes('draw') ||
      lower.includes('plot') ||
      lower.includes('trendline') ||
      lower.includes('level') ||
      lower.includes('garis')

    if (wantsDraw) {
      await handleAutoDrawOnChart()
    } else {
      executeAnalysis(q, true)
    }
  }

  const getSentimentColor = (sentiment?: string): string => {
    if (sentiment === 'bullish') return THEME_TOKENS.colors.bullish
    if (sentiment === 'bearish') return THEME_TOKENS.colors.bearish
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: THEME_TOKENS.colors.textBright }}>
            AI Market Intelligence
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
          onClick={() => executeAnalysis(undefined, true)}
          className="tv-btn"
          title="Refresh Analysis"
          disabled={isLoading || isMcpRunning}
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

      {/* AI MCP Action Banner */}
      <div
        style={{
          padding: '10px 12px',
          backgroundColor: 'rgba(212, 175, 55, 0.05)',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#D4AF37', fontSize: 13 }}>◈</span>
            <span style={{ fontWeight: 700, fontSize: 11, color: '#F4F6FC', letterSpacing: '0.04em' }}>
              CHART MCP AGENT
            </span>
          </div>

          {activeOverlaysCount > 0 && (
            <span
              style={{
                fontSize: 10,
                color: '#10B981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                padding: '2px 6px',
                borderRadius: 4,
                fontWeight: 600
              }}
            >
              ● {activeOverlaysCount} Overlays Active
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={handleAutoDrawOnChart}
            disabled={isMcpRunning}
            style={{
              flex: 1,
              padding: '6px 10px',
              backgroundColor: '#D4AF37',
              color: '#07090E',
              border: 'none',
              borderRadius: 4,
              fontWeight: 700,
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: isMcpRunning ? 'not-allowed' : 'pointer',
              opacity: isMcpRunning ? 0.7 : 1,
              transition: 'all 0.15s ease'
            }}
          >
            {isMcpRunning ? (
              <>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  style={{ animation: 'spin 1s linear infinite' }}
                >
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
                <span>Analyzing &amp; Drawing...</span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                <span>Auto-Draw on Chart</span>
              </>
            )}
          </button>

          {activeOverlaysCount > 0 && (
            <button
              type="button"
              onClick={handleClearDrawings}
              title="Clear Overlays"
              style={{
                padding: '6px 10px',
                backgroundColor: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 4,
                color: '#838896',
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          )}
        </div>

        {mcpStatusMessage && (
          <div
            style={{
              fontSize: 10,
              color: '#D4AF37',
              fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
              lineHeight: 1.3
            }}
          >
            {mcpStatusMessage}
          </div>
        )}
      </div>

      {/* Query Bar */}
      <form
        onSubmit={handleQuerySubmit}
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          gap: 6
        }}
      >
        <input
          type="text"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder={`Ask AI / "gambar trendline" / news sentiment...`}
          className="tv-input"
          style={{ flex: 1, fontSize: 11, padding: '4px 8px' }}
        />
        <button
          type="submit"
          className="tv-btn"
          disabled={isLoading || isMcpRunning}
          style={{
            fontSize: 11,
            backgroundColor: THEME_TOKENS.colors.bgActive,
            color: THEME_TOKENS.colors.accent,
            fontWeight: 600
          }}
        >
          Ask
        </button>
      </form>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {/* Institutional Trade Plan (from MCP Technical Engine) */}
        {mcpResult && (
          <div
            style={{
              backgroundColor: THEME_TOKENS.colors.bgApp,
              borderRadius: 6,
              padding: 12,
              marginBottom: 14,
              border: `1px solid ${THEME_TOKENS.colors.borderMedium}`
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: '#D4AF37', letterSpacing: '0.08em' }}>
                INSTITUTIONAL TRADE PLAN
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 3,
                  backgroundColor:
                    mcpResult.tradePlan.bias === 'LONG'
                      ? 'rgba(16, 185, 129, 0.2)'
                      : mcpResult.tradePlan.bias === 'SHORT'
                      ? 'rgba(244, 63, 94, 0.2)'
                      : 'rgba(212, 175, 55, 0.2)',
                  color:
                    mcpResult.tradePlan.bias === 'LONG'
                      ? '#10B981'
                      : mcpResult.tradePlan.bias === 'SHORT'
                      ? '#F43F5E'
                      : '#D4AF37'
                }}
              >
                {mcpResult.tradePlan.bias} BIAS
              </span>
            </div>

            <p style={{ fontSize: 11, color: THEME_TOKENS.colors.textPrimary, margin: '0 0 10px 0', lineHeight: 1.4 }}>
              {mcpResult.tradePlan.rationale}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
              <div style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, padding: 6, borderRadius: 4 }}>
                <span style={{ color: '#838896', fontSize: 10 }}>Entry: </span>
                <span style={{ fontWeight: 600, color: '#F4F6FC' }}>{formatPrice(mcpResult.tradePlan.suggestedEntry)}</span>
              </div>
              <div style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, padding: 6, borderRadius: 4 }}>
                <span style={{ color: '#838896', fontSize: 10 }}>Stop Loss: </span>
                <span style={{ fontWeight: 600, color: '#F43F5E' }}>{formatPrice(mcpResult.tradePlan.stopLoss)}</span>
              </div>
              <div style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, padding: 6, borderRadius: 4 }}>
                <span style={{ color: '#838896', fontSize: 10 }}>Target 1: </span>
                <span style={{ fontWeight: 600, color: '#10B981' }}>{formatPrice(mcpResult.tradePlan.takeProfit1)}</span>
              </div>
              <div style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, padding: 6, borderRadius: 4 }}>
                <span style={{ color: '#838896', fontSize: 10 }}>Target 2: </span>
                <span style={{ fontWeight: 600, color: '#10B981' }}>{formatPrice(mcpResult.tradePlan.takeProfit2)}</span>
              </div>
            </div>

            <div style={{ marginTop: 8, fontSize: 10, color: '#838896', display: 'flex', justifyContent: 'space-between' }}>
              <span>R:R Ratio: <strong style={{ color: '#D4AF37' }}>{mcpResult.tradePlan.riskRewardRatio}</strong></span>
              <span>RSI: <strong>{mcpResult.indicators.rsi14}</strong> | ATR: <strong>{formatPrice(mcpResult.indicators.atr14)}</strong></span>
            </div>
          </div>
        )}

        {/* Quant Sentiment Card */}
        {analysis && (
          <div
            style={{
              backgroundColor: THEME_TOKENS.colors.bgApp,
              borderRadius: 4,
              padding: 10,
              marginBottom: 12,
              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8
              }}
            >
              <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
                QUANT SENTIMENT
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: 3,
                  backgroundColor: `${getSentimentColor(analysis.sentiment)}20`,
                  color: getSentimentColor(analysis.sentiment)
                }}
              >
                {analysis.sentiment} ({Math.round((analysis.confidence ?? 0.8) * 100)}%)
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: 4,
                backgroundColor: THEME_TOKENS.colors.borderSubtle,
                borderRadius: 2,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.round((analysis.confidence ?? 0.8) * 100)}%`,
                  backgroundColor: getSentimentColor(analysis.sentiment),
                  borderRadius: 2
                }}
              />
            </div>
          </div>
        )}

        {/* Narrative Analysis */}
        {analysis && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: THEME_TOKENS.colors.textSecondary,
                marginBottom: 6,
                textTransform: 'uppercase'
              }}
            >
              Market Narrative
            </div>
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: THEME_TOKENS.colors.textPrimary,
                backgroundColor: THEME_TOKENS.colors.bgApp,
                padding: 10,
                borderRadius: 4,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
              }}
            >
              {analysis.analysis}
            </div>
          </div>
        )}

        {/* Key Catalysts */}
        {analysis && analysis.catalysts && analysis.catalysts.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: THEME_TOKENS.colors.textSecondary,
                marginBottom: 6,
                textTransform: 'uppercase'
              }}
            >
              Key Drivers &amp; Catalysts
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {analysis.catalysts.map((cat, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    fontSize: 11,
                    color: THEME_TOKENS.colors.textPrimary,
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    padding: '6px 10px',
                    borderRadius: 3,
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                  }}
                >
                  <span style={{ color: THEME_TOKENS.colors.accent, fontWeight: 700 }}>•</span>
                  <span>{cat}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key Levels: Support & Resistance */}
        {analysis && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: THEME_TOKENS.colors.textSecondary,
                marginBottom: 6,
                textTransform: 'uppercase'
              }}
            >
              Key Structural Levels
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {/* Resistance */}
              <div
                style={{
                  backgroundColor: THEME_TOKENS.colors.bgApp,
                  padding: 8,
                  borderRadius: 4,
                  border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: THEME_TOKENS.colors.bearish,
                    textTransform: 'uppercase'
                  }}
                >
                  Resistance
                </span>
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {analysis.keyLevels.resistance.map((lvl, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: 11,
                        fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
                        color: THEME_TOKENS.colors.textBright,
                        fontWeight: 600
                      }}
                    >
                      R{idx + 1}: {formatPrice(lvl)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Support */}
              <div
                style={{
                  backgroundColor: THEME_TOKENS.colors.bgApp,
                  padding: 8,
                  borderRadius: 4,
                  border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: THEME_TOKENS.colors.bullish,
                    textTransform: 'uppercase'
                  }}
                >
                  Support
                </span>
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {analysis.keyLevels.support.map((lvl, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: 11,
                        fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
                        color: THEME_TOKENS.colors.textBright,
                        fontWeight: 600
                      }}
                    >
                      S{idx + 1}: {formatPrice(lvl)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Insight Summary */}
        {insight && (
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: THEME_TOKENS.colors.textSecondary,
                marginBottom: 6,
                textTransform: 'uppercase'
              }}
            >
              Desk Summary
            </div>
            <div
              style={{
                fontSize: 11,
                lineHeight: 1.4,
                color: THEME_TOKENS.colors.textSecondary,
                backgroundColor: THEME_TOKENS.colors.bgApp,
                padding: '8px 10px',
                borderRadius: 4,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
              }}
            >
              {insight.summary}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
