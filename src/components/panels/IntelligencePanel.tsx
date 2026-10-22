import React, { useState, useEffect, useRef } from 'react'
import {
  Settings,
  Bot,
  Check,
  LineChart,
  Newspaper,
  SlidersHorizontal,
  Trash2,
  X,
  ShieldCheck,
  Loader2,
  Square,
  Copy,
  Activity,
  Layers,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Zap,
  AlertCircle
} from 'lucide-react'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'
import { getSymbolPrecision } from '@shared/market-utils'
import type { IntelligenceAnalyzeResult, MarketInsightResult } from '@shared/types'
import {
  useAiAgentStore,
  type TradePlanData,
  type ToolCallExecution
} from '../../stores/useAiAgentStore'

// ==========================================
// Institutional Markdown & Content Formatter
// ==========================================

const StructuredContentRenderer: React.FC<{
  content: string
  isStreaming?: boolean
}> = ({ content, isStreaming }) => {
  const lines = content.split('\n')

  const renderInlineFormatted = (text: string): React.ReactNode[] => {
    // Splits by bold **text** or backtick `code`
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g)
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const inner = part.slice(2, -2)
        const isLong = inner === 'LONG' || inner.includes('BULLISH')
        const isShort = inner === 'SHORT' || inner.includes('BEARISH')
        return (
          <strong
            key={idx}
            style={{
              color: isLong ? '#10B981' : isShort ? '#F43F5E' : '#FFFFFF',
              fontWeight: 700
            }}
          >
            {inner}
          </strong>
        )
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={idx}
            style={{
              fontFamily: THEME_TOKENS.typography.fontMono,
              fontSize: 10,
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              padding: '1px 4px',
              borderRadius: 3,
              color: '#FDE68A'
            }}
          >
            {part.slice(1, -1)}
          </code>
        )
      }
      return part
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, lineHeight: 1.55 }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return <div key={idx} style={{ height: 4 }} />
        }

        // Heading 3: Major Section Title
        if (trimmed.startsWith('### ')) {
          return (
            <div
              key={idx}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#D4AF37',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                borderBottom: '1px solid rgba(212, 175, 55, 0.2)',
                paddingBottom: 3,
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <Activity size={12} color="#D4AF37" />
              <span>{trimmed.replace(/^###\s+/, '')}</span>
            </div>
          )
        }

        // Heading 4: Subsection
        if (trimmed.startsWith('#### ')) {
          return (
            <div
              key={idx}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#CBD5E1',
                marginTop: 4
              }}
            >
              {trimmed.replace(/^####\s+/, '')}
            </div>
          )
        }

        // Bullet list item
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const itemText = trimmed.replace(/^[-*]\s+/, '')
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                paddingLeft: 4
              }}
            >
              <span style={{ color: '#D4AF37', fontSize: 10, marginTop: 1, userSelect: 'none' }}>•</span>
              <div style={{ color: '#E2E8F0', flex: 1 }}>{renderInlineFormatted(itemText)}</div>
            </div>
          )
        }

        // Normal paragraph
        return (
          <p key={idx} style={{ margin: 0, color: '#E2E8F0' }}>
            {renderInlineFormatted(line)}
          </p>
        )
      })}

      {/* Live token stream cursor */}
      {isStreaming && (
        <span
          style={{
            display: 'inline-block',
            width: 7,
            height: 12,
            backgroundColor: '#D4AF37',
            marginLeft: 2,
            verticalAlign: 'middle',
            animation: 'pulse 0.8s infinite'
          }}
        />
      )}
    </div>
  )
}

// ==========================================
// Tactical Trade Ticket Component
// ==========================================

const TacticalTradeTicket: React.FC<{
  plan: TradePlanData
}> = ({ plan }) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const { executePaperOrderFromPlan, replotTradePlan } = useAiAgentStore()

  const showToast = (msg: string): void => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2500)
  }

  const handleCopy = async (): Promise<void> => {
    const text = `PIA TRADE SETUP: ${plan.symbol}\nBIAS: ${plan.bias}\nENTRY: ${plan.entry}\nSTOP LOSS: ${plan.stopLoss}\nTARGET 1: ${plan.takeProfit1}\nTARGET 2: ${plan.takeProfit2}\nRISK/REWARD: ${plan.riskRewardRatio}`
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copied to clipboard')
    } catch {
      showToast('Copy failed')
    }
  }

  const handlePlot = async (): Promise<void> => {
    const ok = await replotTradePlan(plan.symbol)
    if (ok) showToast('Levels projected onto chart')
    else showToast('Failed to plot')
  }

  const handleExecutePaper = async (): Promise<void> => {
    setIsExecuting(true)
    try {
      const res = await executePaperOrderFromPlan(plan, 0.1)
      if (res.success) {
        showToast('Paper order executed!')
      } else {
        showToast(`Failed: ${res.error || 'Margin error'}`)
      }
    } finally {
      setIsExecuting(false)
    }
  }

  const isLong = plan.bias === 'LONG'
  const isShort = plan.bias === 'SHORT'
  const biasColor = isLong ? '#10B981' : isShort ? '#F43F5E' : '#F59E0B'

  return (
    <div
      style={{
        marginTop: 10,
        backgroundColor: '#07090E',
        border: `1px solid ${biasColor}40`,
        borderRadius: 8,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)'
      }}
    >
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              padding: '2px 7px',
              borderRadius: 4,
              backgroundColor: `${biasColor}20`,
              color: biasColor,
              fontWeight: 800,
              fontSize: 10,
              letterSpacing: '0.05em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {isLong ? <TrendingUp size={11} /> : isShort ? <TrendingDown size={11} /> : <Zap size={11} />}
            {plan.bias}
          </span>
          <span style={{ fontWeight: 700, fontSize: 11, color: '#F4F6FC' }}>
            {plan.symbol}
          </span>
        </div>

        <span
          style={{
            fontSize: 10,
            fontFamily: THEME_TOKENS.typography.fontMono,
            color: '#D4AF37',
            backgroundColor: 'rgba(212, 175, 55, 0.1)',
            padding: '2px 6px',
            borderRadius: 4,
            fontWeight: 700
          }}
        >
          R:R {plan.riskRewardRatio}
        </span>
      </div>

      {/* 4-Metric Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6,
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          padding: 6,
          borderRadius: 6,
          border: '1px solid rgba(255, 255, 255, 0.05)'
        }}
      >
        <div>
          <span style={{ fontSize: 9, color: '#838896', display: 'block' }}>ENTRY</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#F4F6FC', fontFamily: THEME_TOKENS.typography.fontMono }}>
            {plan.entry}
          </span>
        </div>
        <div>
          <span style={{ fontSize: 9, color: '#F43F5E', display: 'block' }}>STOP LOSS</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#F43F5E', fontFamily: THEME_TOKENS.typography.fontMono }}>
            {plan.stopLoss}
          </span>
        </div>
        <div>
          <span style={{ fontSize: 9, color: '#10B981', display: 'block' }}>TARGET 1</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981', fontFamily: THEME_TOKENS.typography.fontMono }}>
            {plan.takeProfit1}
          </span>
        </div>
        <div>
          <span style={{ fontSize: 9, color: '#10B981', display: 'block' }}>TARGET 2</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981', fontFamily: THEME_TOKENS.typography.fontMono }}>
            {plan.takeProfit2}
          </span>
        </div>
      </div>

      {/* Actions Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={handlePlot}
            title="Plot trendlines and key levels onto the active chart"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 7px',
              borderRadius: 4,
              backgroundColor: 'rgba(212, 175, 55, 0.12)',
              border: '1px solid rgba(212, 175, 55, 0.3)',
              color: '#FDE68A',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <LineChart size={10} color="#D4AF37" />
            <span>Plot Chart</span>
          </button>

          <button
            type="button"
            disabled={isExecuting}
            onClick={handleExecutePaper}
            title="Execute market simulation position in Paper Trading account"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 7px',
              borderRadius: 4,
              backgroundColor: isLong ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              border: `1px solid ${biasColor}40`,
              color: biasColor,
              fontSize: 10,
              fontWeight: 600,
              cursor: isExecuting ? 'not-allowed' : 'pointer'
            }}
          >
            <Zap size={10} />
            <span>{isExecuting ? 'Submitting...' : 'Paper Trade'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          title="Copy Trade Setup"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 6px',
            borderRadius: 4,
            backgroundColor: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#838896',
            fontSize: 10,
            cursor: 'pointer'
          }}
        >
          <Copy size={10} />
          <span>Copy</span>
        </button>
      </div>

      {toastMessage && (
        <div style={{ fontSize: 9, color: '#D4AF37', fontFamily: THEME_TOKENS.typography.fontMono }}>
          {toastMessage}
        </div>
      )}
    </div>
  )
}

// ==========================================
// Tool Execution Telemetry Drawer
// ==========================================

const ToolCallDrawer: React.FC<{ toolCall: ToolCallExecution }> = ({ toolCall }) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 9,
          fontFamily: THEME_TOKENS.typography.fontMono,
          backgroundColor: toolCall.isError ? 'rgba(244, 63, 94, 0.12)' : 'rgba(16, 185, 129, 0.12)',
          border: toolCall.isError
            ? '1px solid rgba(244, 63, 94, 0.25)'
            : '1px solid rgba(16, 185, 129, 0.25)',
          color: toolCall.isError ? '#F43F5E' : '#10B981',
          padding: '2px 6px',
          borderRadius: 4,
          cursor: 'pointer'
        }}
      >
        {toolCall.isError ? (
          <AlertCircle size={10} color="#F43F5E" />
        ) : (
          <Check size={10} strokeWidth={2.5} />
        )}
        <span>{toolCall.name}</span>
        {toolCall.durationMs !== undefined && (
          <span style={{ color: '#64748B' }}>({toolCall.durationMs}ms)</span>
        )}
        {isOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
      </button>

      {isOpen && (
        <div
          style={{
            backgroundColor: '#07090E',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 4,
            padding: 6,
            fontSize: 9,
            fontFamily: THEME_TOKENS.typography.fontMono,
            color: '#838896',
            maxHeight: 140,
            overflowY: 'auto'
          }}
        >
          <div style={{ color: '#D4AF37', marginBottom: 2 }}>Arguments:</div>
          <pre style={{ margin: '0 0 6px 0', color: '#CBD5E1' }}>
            {JSON.stringify(toolCall.args, null, 2)}
          </pre>
          <div style={{ color: '#D4AF37', marginBottom: 2 }}>Telemetry Output:</div>
          <pre style={{ margin: 0, color: '#CBD5E1' }}>
            {JSON.stringify(toolCall.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ==========================================
// Main Intelligence Panel Component
// ==========================================

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
    abortGeneration,
    clearChat,
    testConnection
  } = useAiAgentStore()

  // Local draft for settings modal
  const [draftBaseUrl, setDraftBaseUrl] = useState(config.baseUrl)
  const [draftApiKey, setDraftApiKey] = useState(config.apiKey)
  const [draftModel, setDraftModel] = useState(config.model)
  const [draftTemperature, setDraftTemperature] = useState(config.temperature ?? 0.1)
  const [showApiKey, setShowApiKey] = useState(false)
  const [testStatus, setTestStatus] = useState<{ testing: boolean; result?: string; isError?: boolean } | null>(null)

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
      setDraftTemperature(config.temperature ?? 0.1)
      setTestStatus(null)
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
      model: draftModel.trim(),
      temperature: draftTemperature
    })
    setConfigOpen(false)
  }

  const handleTestConnection = async (): Promise<void> => {
    setTestStatus({ testing: true })
    const res = await testConnection({
      baseUrl: draftBaseUrl.trim(),
      apiKey: draftApiKey.trim(),
      model: draftModel.trim()
    })
    if (res.success) {
      setTestStatus({
        testing: false,
        result: `Connected successfully (${res.latencyMs}ms)`,
        isError: false
      })
    } else {
      setTestStatus({
        testing: false,
        result: res.error || 'Connection failed',
        isError: true
      })
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
              AI Copilot
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
            <Settings size={11} color="#D4AF37" />
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
                      maxWidth: '94%',
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
                      wordBreak: 'break-word'
                    }}
                  >
                    {!isUser && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#D4AF37'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Bot size={12} color="#D4AF37" />
                          <span>PIA COPILOT</span>
                          <span style={{ color: '#64748B', fontWeight: 400 }}>
                            ({config.provider === 'openai' ? config.model : 'Quant Engine'})
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Render tool calls drawer if any */}
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <div
                        style={{
                          marginBottom: 8,
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 5
                        }}
                      >
                        {m.toolCalls.map((tc, idx) => (
                          <ToolCallDrawer key={idx} toolCall={tc} />
                        ))}
                      </div>
                    )}

                    {/* Formatted Content */}
                    <StructuredContentRenderer content={m.content} isStreaming={m.isStreaming} />

                    {/* Tactical Trade Ticket Card */}
                    {m.tradePlan && <TacticalTradeTicket plan={m.tradePlan} />}
                  </div>
                </div>
              )
            })}

            {/* Active Execution State with Abort Button */}
            {isBusy && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  backgroundColor: 'rgba(212, 175, 55, 0.08)',
                  border: '1px solid rgba(212, 175, 55, 0.2)',
                  borderRadius: 6,
                  color: '#D4AF37',
                  fontSize: 11,
                  maxWidth: '94%'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>{statusMessage || 'Processing telemetry...'}</span>
                </div>

                <button
                  type="button"
                  onClick={abortGeneration}
                  title="Stop generation"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 6px',
                    borderRadius: 4,
                    backgroundColor: 'rgba(244, 63, 94, 0.15)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    color: '#F43F5E',
                    fontSize: 9,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Square size={9} />
                  <span>Stop</span>
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Action Institutional Playbook Chips */}
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
                  `Analyze ${symbol} market structure, compute key pivots, and plot trendlines and levels directly on the chart.`
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
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <LineChart size={11} color="#D4AF37" />
              <span>Auto-Draw Chart</span>
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                handleQuickAction(
                  `Scan live L2 orderbook depth, bid/ask volume imbalance, and spread metrics for ${symbol}.`
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
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <Layers size={11} color="#94A3B8" />
              <span>L2 Orderbook</span>
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                handleQuickAction(
                  `Analyze technical momentum indicators (RSI 14, ATR, EMA 20/50 alignment) for ${symbol}.`
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
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <SlidersHorizontal size={11} color="#94A3B8" />
              <span>Technicals &amp; Momentum</span>
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                handleQuickAction(
                  `Evaluate latest news headline polarity and FinTwit social sentiment for ${symbol}.`
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
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <Newspaper size={11} color="#94A3B8" />
              <span>Sentiment Velocity</span>
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleQuickAction(`Clear all AI chart overlays for ${symbol}.`)}
              style={{
                whiteSpace: 'nowrap',
                fontSize: 10,
                fontWeight: 600,
                backgroundColor: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
                color: '#F43F5E',
                borderRadius: 4,
                padding: '3px 8px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <Trash2 size={11} color="#F43F5E" />
              <span>Clear Overlays</span>
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
              placeholder={`Ask quantitative query or request chart plots (${symbol})...`}
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
            {isBusy ? (
              <button
                type="button"
                onClick={abortGeneration}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#F43F5E',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <Square size={11} />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputPrompt.trim()}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#D4AF37',
                  color: '#07090E',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: !inputPrompt.trim() ? 'not-allowed' : 'pointer',
                  opacity: !inputPrompt.trim() ? 0.6 : 1
                }}
              >
                Send
              </button>
            )}
            <button
              type="button"
              onClick={clearChat}
              title="Reset Chat Session"
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
              Loading quantitative market data and sentiment...
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
            backgroundColor: 'rgba(7, 9, 14, 0.88)',
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
              maxWidth: 380,
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Settings size={14} color="#D4AF37" />
                <span style={{ fontWeight: 700, fontSize: 13, color: '#F4F6FC' }}>
                  AI Copilot Configuration
                </span>
              </div>
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: '#838896',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 2
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Provider Selector Switch */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#838896' }}>Engine Mode:</span>
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
                            setDraftTemperature(next.temperature ?? 0.1)
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
                    placeholder="sk-... (leave empty for local models)"
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

                {/* Temperature Slider */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ fontSize: 10, color: '#838896' }}>
                      Temperature (Quant Determinism):
                    </label>
                    <span style={{ fontSize: 10, fontFamily: THEME_TOKENS.typography.fontMono, color: '#D4AF37' }}>
                      {draftTemperature}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={draftTemperature}
                    onChange={(e) => setDraftTemperature(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: '#D4AF37' }}
                  />
                </div>

                {/* Test Connection Button */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    disabled={testStatus?.testing}
                    onClick={handleTestConnection}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: 4,
                      color: '#CBD5E1',
                      fontSize: 10,
                      cursor: testStatus?.testing ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {testStatus?.testing ? 'Testing...' : 'Test Connection'}
                  </button>

                  {testStatus?.result && (
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: THEME_TOKENS.typography.fontMono,
                        color: testStatus.isError ? '#F43F5E' : '#10B981',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {testStatus.result}
                    </span>
                  )}
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
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8
                }}
              >
                <ShieldCheck size={16} color="#10B981" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  <strong>Zero Configuration:</strong> Powered by PIA built-in quantitative engine. No external API key required. Ingests news sentiment, orderbook depth, and projects support/resistance and trendlines directly to the chart.
                </span>
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
