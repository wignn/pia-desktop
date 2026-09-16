import React, { useState, useEffect, useCallback } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'
import { getSymbolPrecision } from '@shared/market-utils'
import type { IntelligenceAnalyzeResult, MarketInsightResult } from '@shared/types'

export const IntelligencePanel: React.FC = () => {
  const { symbol, prices, symbols } = useMarketStore()
  const [analysis, setAnalysis] = useState<IntelligenceAnalyzeResult | null>(null)
  const [insight, setInsight] = useState<MarketInsightResult | null>(null)
  const [queryInput, setQueryInput] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const currentPrice = symbol ? prices[symbol]?.price : undefined
  const symInfo = symbols.find((s) => s.symbol === symbol)
  const precision = getSymbolPrecision(symbol ?? '', symInfo?.category, currentPrice)

  const formatPrice = (val: number): string => {
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

  useEffect(() => {
    let cancelled = false
    if (!symbol) {
      setAnalysis(null)
      setInsight(null)
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

  const handleQuerySubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!queryInput.trim()) return
    executeAnalysis(queryInput.trim(), true)
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
          placeholder={`Ask AI about ${symbol} structure...`}
          className="tv-input"
          style={{ flex: 1, fontSize: 11, padding: '4px 8px' }}
        />
        <button
          type="submit"
          className="tv-btn"
          disabled={isLoading}
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
        {!isLoading && !analysis && !insight && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            AI Market Intelligence unavailable. Verify the PIA API key and data access.
          </div>
        )}

        {/* Sentiment & Confidence Card */}
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
                  backgroundColor: `${getSentimentColor(analysis.sentiment)}22`,
                  color: getSentimentColor(analysis.sentiment)
                }}
              >
                {analysis.sentiment}
              </span>
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  color: THEME_TOKENS.colors.textSecondary,
                  marginBottom: 4
                }}
              >
                <span>Confidence</span>
                <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.textBright }}>
                  {analysis.confidence === undefined
                    ? 'Unavailable'
                    : `${Math.round(analysis.confidence * 100)}%`}
                </span>
              </div>
              <div
                style={{
                  height: 4,
                  backgroundColor: THEME_TOKENS.colors.bgSurface,
                  borderRadius: 2,
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width:
                      analysis.confidence === undefined
                        ? '0%'
                        : `${Math.round(analysis.confidence * 100)}%`,
                    backgroundColor: getSentimentColor(analysis.sentiment),
                    borderRadius: 2
                  }}
                />
              </div>
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
              Key Drivers & Catalysts
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
