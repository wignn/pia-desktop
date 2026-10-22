import React, { useState, useEffect, useRef } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'
import { getSymbolPrecision } from '@shared/market-utils'
import type { IntelligenceAnalyzeResult, MarketInsightResult } from '@shared/types'
import { useAiAgentStore } from '../../stores/useAiAgentStore'
import { AiMcpEngine } from '../../services/ai-mcp-engine'

export const IntelligencePanel: React.FC = () => {
  const symbol = useMarketStore((state) => state.symbol)
  const currentPrice = useMarketStore((state) =>
    state.symbol ? state.prices[state.symbol]?.price : undefined
  )
  const symInfo = useMarketStore((state) =>
    state.symbol ? state.symbols.find((item) => item.symbol === state.symbol) : undefined
  )

  const [activeTab, setActiveTab] = useState<'agent' | 'desk'>('agent')
  const [analysis, setAnalysis] = useState<IntelligenceAnalyzeResult | null>(null)
  const [insight, setInsight] = useState<MarketInsightResult | null>(null)
  const [deskLoading, setDeskLoading] = useState<boolean>(false)
  const [inputPrompt, setInputPrompt] = useState<string>('')

  // AI Agent Store
  const {
    config,
    messages,
    isBusy,
    statusMessage,
    isConfigOpen,
    setConfigOpen,
    updateConfig,
    applyPreset,
    sendMessage,
    clearChat
  } = useAiAgentStore()

  // Local draft for settings modal
  const [draftBaseUrl, setDraftBaseUrl] = useState(config.baseUrl)
  const [draftApiKey, setDraftApiKey] = useState(config.apiKey)
  const [draftModel, setDraftModel] = useState(config.model)
  const [showApiKey, setShowApiKey] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const precision = getSymbolPrecision(symbol ?? '', symInfo?.category, currentPrice)

  const formatPrice = (val?: number): string => {
    if (val === undefined || isNaN(val)) return '--'
    return val.toLocaleString(undefined, {
      minimumFractionDigits: precision.pricePrecision,
      maximumFractionDigits: precision.pricePrecision
    })
  }

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, statusMessage])

  // Sync draft config when modal opens
  useEffect(() => {
    if (isConfigOpen) {
      setDraftBaseUrl(config.baseUrl)
      setDraftApiKey(config.apiKey)
      setDraftModel(config.model)
    }
  }, [isConfigOpen, config])

  // Load Desk Quant insights
  useEffect(() => {
    let cancelled = false
    if (!symbol) return

    setDeskLoading(true)
    Promise.all([
      window.api.intelligence.analyze({ symbol }),
      window.api.intelligence.getInsights(symbol)
    ])
      .then(([anRes, inRes]) => {
        if (!cancelled) {
          setAnalysis(anRes)
          setInsight(inRes)
          setDeskLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setDeskLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [symbol])

  const handleSend = async (e?: React.FormEvent): Promise<void> => {
    e?.preventDefault()
    if (!inputPrompt.trim() || isBusy || !symbol) return
    const q = inputPrompt.trim()
    setInputPrompt('')
    await sendMessage(q, symbol)
  }

  const handleQuickAction = async (promptText: string): Promise<void> => {
    if (isBusy || !symbol) return
    await sendMessage(promptText, symbol)
  }

  const handleSaveConfig = (): void => {
    updateConfig({
      baseUrl: draftBaseUrl.trim(),
      apiKey: draftApiKey.trim(),
      model: draftModel.trim()
    })
    setConfigOpen(false)
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
        fontSize: 12,
        position: 'relative'
      }}
    >
      {/* Header with Navigation Tabs & Provider Selector */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: THEME_TOKENS.colors.bgApp
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              display: 'flex',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              borderRadius: 6,
              padding: 2,
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('agent')}
              style={{
                border: 'none',
                background: activeTab === 'agent' ? '#D4AF37' : 'transparent',
                color: activeTab === 'agent' ? '#07090E' : '#838896',
                fontWeight: 700,
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              AI Agent Copilot
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('desk')}
              style={{
                border: 'none',
                background: activeTab === 'desk' ? '#D4AF37' : 'transparent',
                color: activeTab === 'desk' ? '#07090E' : '#838896',
                fontWeight: 700,
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Desk Quant
            </button>
          </div>

          <span
            style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              backgroundColor: 'rgba(212, 175, 55, 0.12)',
              color: '#D4AF37',
              fontWeight: 700
            }}
          >
            {symbol}
          </span>
        </div>

        {/* AI Provider Config Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => setConfigOpen(true)}
            title="Configure AI Model & Provider (OpenAI, DeepSeek, etc.)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 4,
              color: '#F4F6FC',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <span style={{ color: '#D4AF37' }}>⚙</span>
            <span>{config.provider === 'openai' ? config.model : 'Built-in'}</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: INTERACTIVE AI AGENT COPILOT */}
      {activeTab === 'agent' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Messages Stream */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            {messages.map((m) => {
              const isUser = m.role === 'user'
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    width: '100%'
                  }}
                >
                  <div
                    style={{
                      maxWidth: '92%',
                      backgroundColor: isUser ? '#1E293B' : '#0D111A',
                      color: isUser ? '#F8FAFC' : '#E2E8F0',
                      border: isUser
                        ? '1px solid rgba(59, 130, 246, 0.3)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: isUser ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                      padding: '10px 12px',
                      fontSize: 11,
                      lineHeight: 1.5,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    {!isUser && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          marginBottom: 6,
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#D4AF37'
                        }}
                      >
                        <span>◈</span>
                        <span>PIA AGENT</span>
                        <span style={{ color: '#64748B', fontWeight: 400 }}>
                          ({config.provider === 'openai' ? config.model : 'Quant Engine'})
                        </span>
                      </div>
                    )}

                    {/* Render tool calls pill if any */}
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <div
                        style={{
                          marginBottom: 8,
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 4
                        }}
                      >
                        {m.toolCalls.map((tc, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 9,
                              fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
                              backgroundColor: 'rgba(16, 185, 129, 0.12)',
                              border: '1px solid rgba(16, 185, 129, 0.25)',
                              color: '#10B981',
                              padding: '2px 6px',
                              borderRadius: 4
                            }}
                          >
                            <span>✓</span>
                            <span>{tc.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div>{m.content}</div>
                  </div>
                </div>
              )
            })}

            {/* Active Execution State */}
            {isBusy && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  backgroundColor: 'rgba(212, 175, 55, 0.08)',
                  border: '1px solid rgba(212, 175, 55, 0.2)',
                  borderRadius: 6,
                  color: '#D4AF37',
                  fontSize: 11,
                  maxWidth: '92%'
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  style={{ animation: 'spin 1s linear infinite' }}
                >
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
                <span>{statusMessage || 'Sedang memproses...'}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Action Chips */}
          <div
            style={{
              padding: '6px 12px',
              borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              backgroundColor: 'rgba(0, 0, 0, 0.2)'
            }}
          >
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                handleQuickAction(
                  `Analisis ${symbol} secara komprehensif, cek sentimen berita terbaru, dan langsung gambarkan trendline serta support resistance di chart.`
                )
              }
              style={{
                whiteSpace: 'nowrap',
                fontSize: 10,
                fontWeight: 600,
                backgroundColor: 'rgba(212, 175, 55, 0.1)',
                border: '1px solid rgba(212, 175, 55, 0.25)',
                color: '#FDE68A',
                borderRadius: 4,
                padding: '3px 8px',
                cursor: 'pointer'
              }}
            >
              ◈ Auto-Draw Chart
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                handleQuickAction(
                  `Bagaimana sentimen berita dan FinTwit untuk ${symbol} saat ini?`
                )
              }
              style={{
                whiteSpace: 'nowrap',
                fontSize: 10,
                fontWeight: 600,
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#CBD5E1',
                borderRadius: 4,
                padding: '3px 8px',
                cursor: 'pointer'
              }}
            >
              📰 Sentimen Berita
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                handleQuickAction(
                  `Gambarkan garis level support dan resistance kunci untuk ${symbol} di chart.`
                )
              }
              style={{
                whiteSpace: 'nowrap',
                fontSize: 10,
                fontWeight: 600,
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#CBD5E1',
                borderRadius: 4,
                padding: '3px 8px',
                cursor: 'pointer'
              }}
            >
              🎯 Support &amp; Resistance
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleQuickAction(`Bersihkan semua gambar di chart untuk ${symbol}.`)}
              style={{
                whiteSpace: 'nowrap',
                fontSize: 10,
                fontWeight: 600,
                backgroundColor: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
                color: '#F43F5E',
                borderRadius: 4,
                padding: '3px 8px',
                cursor: 'pointer'
              }}
            >
              🧹 Clear Drawings
            </button>
          </div>

          {/* Interactive Agent Input Bar */}
          <form
            onSubmit={handleSend}
            style={{
              padding: '8px 12px',
              borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              display: 'flex',
              gap: 8,
              backgroundColor: THEME_TOKENS.colors.bgSurface
            }}
          >
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder={`Tanyakan analisis atau minta gambar di chart (${symbol})...`}
              disabled={isBusy}
              style={{
                flex: 1,
                fontSize: 11,
                padding: '8px 10px',
                backgroundColor: '#07090E',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 6,
                color: '#F4F6FC',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              disabled={isBusy || !inputPrompt.trim()}
              style={{
                padding: '8px 14px',
                backgroundColor: '#D4AF37',
                color: '#07090E',
                border: 'none',
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 11,
                cursor: isBusy || !inputPrompt.trim() ? 'not-allowed' : 'pointer',
                opacity: isBusy || !inputPrompt.trim() ? 0.6 : 1
              }}
            >
              Send
            </button>
            <button
              type="button"
              onClick={clearChat}
              title="Reset Chat"
              style={{
                padding: '8px 10px',
                backgroundColor: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#838896',
                borderRadius: 6,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              Reset
            </button>
          </form>
        </div>
      )}

      {/* VIEW 2: DESK QUANT SUMMARY */}
      {activeTab === 'desk' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {deskLoading && (
            <div style={{ padding: 20, textAlign: 'center', color: '#838896' }}>
              Memuat data pasar dan sentimen kuantitatif...
            </div>
          )}

          {/* Quant Sentiment Card */}
          {analysis && (
            <div
              style={{
                backgroundColor: THEME_TOKENS.colors.bgApp,
                borderRadius: 6,
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

          {/* Desk Summary */}
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
      )}

      {/* MODAL: AI MODEL & PROVIDER CONFIGURATION */}
      {isConfigOpen && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(7, 9, 14, 0.85)',
            backdropFilter: 'blur(6px)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: '#0D111A',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 8,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#D4AF37', fontSize: 14 }}>⚙</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#F4F6FC' }}>
                  AI Agent Provider
                </span>
              </div>
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: '#838896',
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {/* Provider Selector Switch */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#838896' }}>Select Mode:</span>
              <div
                style={{
                  display: 'flex',
                  backgroundColor: '#07090E',
                  padding: 3,
                  borderRadius: 6,
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}
              >
                <button
                  type="button"
                  onClick={() => updateConfig({ provider: 'builtin' })}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: 4,
                    border: 'none',
                    backgroundColor: config.provider === 'builtin' ? '#D4AF37' : 'transparent',
                    color: config.provider === 'builtin' ? '#07090E' : '#838896',
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  Built-in Quant
                </button>
                <button
                  type="button"
                  onClick={() => updateConfig({ provider: 'openai' })}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: 4,
                    border: 'none',
                    backgroundColor: config.provider === 'openai' ? '#D4AF37' : 'transparent',
                    color: config.provider === 'openai' ? '#07090E' : '#838896',
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  OpenAI Compatible
                </button>
              </div>
            </div>

            {/* OpenAI-compatible Details */}
            {config.provider === 'openai' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 1-Click Presets */}
                <div>
                  <span style={{ fontSize: 10, color: '#838896' }}>Quick Presets:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {(['openai', 'deepseek', 'openrouter', 'groq', 'ollama'] as const).map(
                      (preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            applyPreset(preset)
                            const next = useAiAgentStore.getState().config
                            setDraftBaseUrl(next.baseUrl)
                            setDraftModel(next.model)
                          }}
                          style={{
                            padding: '3px 7px',
                            backgroundColor: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: 4,
                            color: '#CBD5E1',
                            fontSize: 10,
                            cursor: 'pointer'
                          }}
                        >
                          {preset.toUpperCase()}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Base URL */}
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: '#838896', marginBottom: 4 }}>
                    Base URL:
                  </label>
                  <input
                    type="text"
                    value={draftBaseUrl}
                    onChange={(e) => setDraftBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      backgroundColor: '#07090E',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: 6,
                      color: '#F4F6FC',
                      fontSize: 11,
                      fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* API Key */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ fontSize: 10, color: '#838896' }}>API Key:</label>
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#D4AF37',
                        fontSize: 10,
                        cursor: 'pointer'
                      }}
                    >
                      {showApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={draftApiKey}
                    onChange={(e) => setDraftApiKey(e.target.value)}
                    placeholder="sk-..."
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      backgroundColor: '#07090E',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: 6,
                      color: '#F4F6FC',
                      fontSize: 11,
                      fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Model Name */}
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: '#838896', marginBottom: 4 }}>
                    Model:
                  </label>
                  <input
                    type="text"
                    value={draftModel}
                    onChange={(e) => setDraftModel(e.target.value)}
                    placeholder="gpt-4o-mini / deepseek-chat / llama3.1"
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      backgroundColor: '#07090E',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: 6,
                      color: '#F4F6FC',
                      fontSize: 11,
                      fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 11,
                  color: '#94A3B8',
                  lineHeight: 1.5,
                  padding: 10,
                  backgroundColor: '#07090E',
                  borderRadius: 6,
                  border: '1px solid rgba(255, 255, 255, 0.06)'
                }}
              >
                ✓ <strong>Zero Configuration:</strong> Menggunakan engine kuantitatif bawaan PIA. Tidak memerlukan API key eksternal. Langsung membaca sentimen berita, orderbook depth, dan memproyeksikan garis support/resistance serta trendline ke chart.
              </div>
            )}

            {/* Save / Close Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={handleSaveConfig}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  backgroundColor: '#D4AF37',
                  color: '#07090E',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: 'pointer'
                }}
              >
                Save &amp; Apply
              </button>
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#838896',
                  borderRadius: 6,
                  fontSize: 11,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
