import React, { useId, useState, useEffect, useRef } from 'react'
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
  AlertCircle,
  Sparkles,
  Terminal
} from 'lucide-react'
import { useMarketStore } from '../../stores/useMarketStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { AnalysisSnapshotCard } from './AnalysisSnapshotCard'
import { THEME_TOKENS } from '../../theme/tokens'
import { getSymbolPrecision } from '@shared/market-utils'
import type { IntelligenceAnalyzeResult, MarketInsightResult } from '@shared/types'
import {
  useAiAgentStore,
  formatCleanPrice,
  type TradePlanData,
  type ToolCallExecution,
  type AgentStepTrace
} from '../../stores/useAiAgentStore'

// ==========================================
// Institutional Markdown & Content Formatter
// ==========================================

const StructuredContentRenderer: React.FC<{
  content: string
  isStreaming?: boolean
}> = ({ content, isStreaming }) => {
  if (!content) return null
  const lines = content.split('\n')

  const renderInlineFormatted = (text: string): React.ReactNode[] => {
    // Splits by bold **text** or backtick `code`
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g)
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const inner = part.slice(2, -2)
        const isLong = /LONG|BUY|BULLISH/i.test(inner)
        const isShort = /SHORT|SELL|BEARISH/i.test(inner)
        const isOrderType = /LIMIT|STOP|MARKET/i.test(inner)
        return (
          <strong
            key={idx}
            style={{
              color: isLong ? '#34D399' : isShort ? '#FB7185' : isOrderType ? '#38BDF8' : '#F8FAFC',
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
              padding: '1px 5px',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, lineHeight: 1.6 }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return <div key={idx} style={{ height: 4 }} />
        }

        // Horizontal Rule
        if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
          return (
            <div
              key={idx}
              style={{
                height: 1,
                backgroundColor: 'rgba(255, 255, 255, 0.07)',
                margin: '8px 0'
              }}
            />
          )
        }

        // Section Headers (e.g. "### Heading" or "~ 2. TAKTIK EKSEKUSI" or "2. TAKTIK EKSEKUSI")
        const isH3 = trimmed.startsWith('### ')
        const isNumberedSection = /^(?:~|\*|-)?\s*\d+\.\s+[A-Z\s()_?]+/i.test(trimmed) && trimmed.length < 60

        if (isH3 || isNumberedSection) {
          const title = trimmed.replace(/^###\s+/, '').replace(/^(?:~|\*|-)?\s*/, '')
          return (
            <div
              key={idx}
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: '#38BDF8',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginTop: 8,
                marginBottom: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  backgroundColor: '#38BDF8'
                }}
              />
              <span>{title}</span>
            </div>
          )
        }

        // Subsection Heading (####)
        if (trimmed.startsWith('#### ')) {
          return (
            <div
              key={idx}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#E2E8F0',
                marginTop: 4
              }}
            >
              {trimmed.replace(/^####\s+/, '')}
            </div>
          )
        }

        // Bullet list item
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
          const itemText = trimmed.replace(/^[-*•]\s+/, '')
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
              <span style={{ color: '#64748B', fontSize: 10, marginTop: 1, userSelect: 'none' }}>•</span>
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
            width: 6,
            height: 12,
            backgroundColor: '#38BDF8',
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
// Agentic Chain-of-Thought Collapsible Card
// ==========================================

const ThoughtProcessCard: React.FC<{
  thought?: string
  isStreaming?: boolean
}> = ({ thought, isStreaming }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const contentId = useId()

  if (!thought) return null

  const wordCount = thought.trim().split(/\s+/).filter(Boolean).length

  return (
    <div
      style={{
        margin: '4px 0 6px 0',
        borderRadius: 6,
        border: '1px solid rgba(139, 92, 246, 0.2)',
        backgroundColor: 'rgba(139, 92, 246, 0.04)',
        overflow: 'hidden'
      }}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#C084FC',
          fontSize: 10,
          fontWeight: 600,
          fontFamily: THEME_TOKENS.typography.fontMono
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={11} color="#C084FC" />
          <span>Thought Process</span>
          <span style={{ fontSize: 9, color: '#A78BFA', fontWeight: 400 }}>
            ({wordCount} words{isStreaming ? ' • thinking...' : ''})
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94A3B8', fontSize: 9 }}>
          <span>{isExpanded ? 'Hide' : 'Expand'}</span>
          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </div>
      </button>

      {isExpanded && (
        <div
          id={contentId}
          style={{
            padding: '8px 10px',
            borderTop: '1px solid rgba(139, 92, 246, 0.15)',
            borderLeft: '2px solid #8B5CF6',
            backgroundColor: '#07090E',
            fontSize: 10,
            lineHeight: 1.6,
            color: '#CBD5E1',
            fontFamily: THEME_TOKENS.typography.fontMono,
            whiteSpace: 'pre-wrap',
            maxHeight: 260,
            overflowY: 'auto'
          }}
        >
          {thought}
        </div>
      )}
    </div>
  )
}

// ==========================================
// Tactical Trade Ticket Component (Quant HUD)
// ==========================================

const TacticalTradeTicket: React.FC<{
  plan: TradePlanData
}> = ({ plan }) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [selectedLot, setSelectedLot] = useState<number>(plan.suggestedLotSize || 0.1)
  const { executePaperOrderFromPlan, replotTradePlan } = useAiAgentStore()

  const { pricePrecision } = getSymbolPrecision(plan.symbol, undefined, plan.entry)
  const formatP = (v?: number) => formatCleanPrice(v, pricePrecision)

  const showToast = (msg: string): void => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2500)
  }

  const orderType = plan.orderType || (plan.bias === 'LONG' ? 'BUY_LIMIT' : 'SELL_LIMIT')
  const orderTypeLabel = orderType.replace('_', ' ')

  const handleCopy = async (): Promise<void> => {
    const text = `PIA TRADE SETUP: ${plan.symbol}
ORDER TYPE: ${orderType}
BIAS: ${plan.bias}
ENTRY: ${formatP(plan.entry)}
STOP LOSS: ${formatP(plan.stopLoss)}
TARGET 1: ${formatP(plan.takeProfit1)}
TARGET 2: ${formatP(plan.takeProfit2)}
RISK/REWARD: ${plan.riskRewardRatio}
SIZE: ${selectedLot} Lot`
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copied to clipboard')
    } catch {
      showToast('Copy failed')
    }
  }

  const handlePlot = async (): Promise<void> => {
    const ok = await replotTradePlan(plan)
    if (ok) showToast('Levels projected onto chart')
    else showToast('Failed to plot')
  }

  const handleExecutePaper = async (): Promise<void> => {
    setIsExecuting(true)
    try {
      const res = await executePaperOrderFromPlan(plan, selectedLot)
      if (res.success) {
        showToast(`${orderTypeLabel} placed (${selectedLot} Lot)`)
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
  const isLimit = orderType.includes('LIMIT')

  return (
    <div
      style={{
        marginTop: 10,
        backgroundColor: '#070B14',
        border: `1px solid ${biasColor}35`,
        borderRadius: 8,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
      }}
    >
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              backgroundColor: `${biasColor}18`,
              border: `1px solid ${biasColor}35`,
              color: biasColor,
              fontWeight: 800,
              fontSize: 10,
              letterSpacing: '0.04em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {isLong ? <TrendingUp size={11} /> : isShort ? <TrendingDown size={11} /> : <Zap size={11} />}
            {plan.bias}
          </span>

          <span
            style={{
              padding: '2px 7px',
              borderRadius: 4,
              backgroundColor: isLimit ? 'rgba(56, 189, 248, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              border: `1px solid ${isLimit ? 'rgba(56, 189, 248, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
              color: isLimit ? '#38BDF8' : '#FDE68A',
              fontWeight: 700,
              fontSize: 9.5,
              letterSpacing: '0.03em'
            }}
          >
            {orderTypeLabel}
          </span>

          <span style={{ fontWeight: 700, fontSize: 11, color: '#F8FAFC', fontFamily: THEME_TOKENS.typography.fontMono }}>
            {plan.symbol}
          </span>
        </div>

        <span
          style={{
            fontSize: 9.5,
            fontFamily: THEME_TOKENS.typography.fontMono,
            color: '#FDE68A',
            backgroundColor: 'rgba(253, 230, 138, 0.1)',
            border: '1px solid rgba(253, 230, 138, 0.2)',
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
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid rgba(255, 255, 255, 0.05)'
        }}
      >
        <div>
          <span style={{ fontSize: 8.5, color: '#64748B', display: 'block', fontWeight: 600 }}>ENTRY</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#F8FAFC', fontFamily: THEME_TOKENS.typography.fontMono }}>
            {formatP(plan.entry)}
          </span>
        </div>
        <div>
          <span style={{ fontSize: 8.5, color: '#FB7185', display: 'block', fontWeight: 600 }}>STOP LOSS</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#FB7185', fontFamily: THEME_TOKENS.typography.fontMono }}>
            {formatP(plan.stopLoss)}
          </span>
        </div>
        <div>
          <span style={{ fontSize: 8.5, color: '#34D399', display: 'block', fontWeight: 600 }}>TARGET 1</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#34D399', fontFamily: THEME_TOKENS.typography.fontMono }}>
            {formatP(plan.takeProfit1)}
          </span>
        </div>
        <div>
          <span style={{ fontSize: 8.5, color: '#34D399', display: 'block', fontWeight: 600 }}>TARGET 2</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#34D399', fontFamily: THEME_TOKENS.typography.fontMono }}>
            {formatP(plan.takeProfit2)}
          </span>
        </div>
      </div>

      {/* Position Sizing Selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 6px',
          borderRadius: 4,
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.04)',
          fontSize: 9.5
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#838896' }}>
          <span>Order Size:</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0.05, 0.1, 0.25, 0.5].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setSelectedLot(val)}
                style={{
                  border: selectedLot === val ? '1px solid rgba(212, 175, 55, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                  backgroundColor: selectedLot === val ? 'rgba(212, 175, 55, 0.15)' : 'transparent',
                  color: selectedLot === val ? '#FDE68A' : '#94A3B8',
                  padding: '1px 6px',
                  borderRadius: 3,
                  fontSize: 9,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {val} Lot
              </button>
            ))}
          </div>
        </div>

        <span style={{ fontFamily: THEME_TOKENS.typography.fontMono, color: '#F8FAFC', fontWeight: 700 }}>
          {selectedLot} Lot
        </span>
      </div>

      {/* Actions Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={handlePlot}
            title="Plot trendlines and key levels onto the active chart"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              borderRadius: 4,
              backgroundColor: 'rgba(212, 175, 55, 0.1)',
              border: '1px solid rgba(212, 175, 55, 0.25)',
              color: '#FDE68A',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <LineChart size={10} color="#D4AF37" />
            <span>Plot Levels</span>
          </button>

          <button
            type="button"
            disabled={isExecuting}
            onClick={handleExecutePaper}
            title={`Submit ${orderTypeLabel} to Paper Trading account`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 4,
              backgroundColor: isLong ? 'rgba(16, 185, 129, 0.18)' : 'rgba(244, 63, 94, 0.18)',
              border: `1px solid ${biasColor}45`,
              color: biasColor,
              fontSize: 10,
              fontWeight: 700,
              cursor: isExecuting ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Zap size={10} />
            <span>{isExecuting ? 'Submitting...' : `Place ${orderTypeLabel}`}</span>
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
            padding: '4px 7px',
            borderRadius: 4,
            backgroundColor: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.08)',
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
        <div style={{ fontSize: 9, color: '#38BDF8', fontFamily: THEME_TOKENS.typography.fontMono }}>
          {toastMessage}
        </div>
      )}
    </div>
  )
}

// ==========================================
// Tool Execution Telemetry Drawer (CLI Style)
// ==========================================

const ToolCallDrawer: React.FC<{ toolCall: ToolCallExecution; onOpenDesk?: () => void }> = ({ toolCall, onOpenDesk }) => {
  const [isOpen, setIsOpen] = useState(false)
  const contentId = useId()
  const targetTab = toolCall.name === 'get_market_snapshot' ? 'orderbook'
    : toolCall.name === 'get_news_sentiment' ? 'news'
      : toolCall.name === 'get_macro_context' ? 'macro'
        : toolCall.name === 'compute_technical_analysis' || toolCall.name === 'execute_full_chart_analysis' ? 'desk'
          : undefined

  const argsPreview = Object.entries(toolCall.args || {})
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`)
    .join(', ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={contentId}
        aria-label={`${isOpen ? 'Hide' : 'Show'} ${toolCall.name} details`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 9.5,
          fontFamily: THEME_TOKENS.typography.fontMono,
          backgroundColor: '#080C14',
          border: toolCall.isError
            ? '1px solid rgba(244, 63, 94, 0.3)'
            : '1px solid rgba(255, 255, 255, 0.08)',
          color: '#E2E8F0',
          padding: '3px 8px',
          borderRadius: 4,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          transition: 'border-color 0.15s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          <span style={{ color: toolCall.isError ? '#F43F5E' : '#38BDF8' }}>$</span>
          <span style={{ fontWeight: 700, color: toolCall.isError ? '#F43F5E' : '#38BDF8' }}>
            {toolCall.name}
          </span>
          <span
            style={{
              color: '#64748B',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 240
            }}
          >
            ({argsPreview})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {toolCall.isRunning ? (
            <span style={{ color: 'var(--gold)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Loader2 size={10} className="tv-spin" />running</span>
          ) : toolCall.isError ? (
            <span style={{ color: 'var(--bearish)', fontSize: 9 }}>error</span>
          ) : (
            <span style={{ color: 'var(--bullish)', fontSize: 9 }}>
              {toolCall.durationMs !== undefined ? `${toolCall.durationMs}ms` : 'done'}
            </span>
          )}
          {isOpen ? <ChevronUp size={10} color="#64748B" /> : <ChevronDown size={10} color="#64748B" />}
        </div>
      </button>

      {isOpen && (
        <div
          id={contentId}
          style={{
            backgroundColor: 'var(--bg-app)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 4,
            padding: 8,
            fontSize: 9,
            fontFamily: THEME_TOKENS.typography.fontMono,
            color: '#838896',
            maxHeight: 180,
            overflowY: 'auto'
          }}
        >
          <div style={{ color: '#38BDF8', marginBottom: 2, fontWeight: 700 }}>Arguments:</div>
          <pre style={{ margin: '0 0 6px 0', color: '#CBD5E1', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(toolCall.args, null, 2)}
          </pre>
          <div style={{ color: '#10B981', marginBottom: 2, fontWeight: 700 }}>Output Telemetry:</div>
          <pre style={{ margin: 0, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(toolCall.result, null, 2)}
          </pre>
          {targetTab && (
            <button type="button" onClick={() => targetTab === 'desk' ? onOpenDesk?.() : useWorkspaceStore.getState().setActiveTab(targetTab)} style={{ marginTop: 7, color: 'var(--accent)', background: 'transparent', border: 0, cursor: 'pointer', fontSize: 10 }}>
              View related panel →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ==========================================
// Claude Code Step-by-Step Execution Timeline
// ==========================================

const ClaudeCodeStepTimeline: React.FC<{
  steps?: AgentStepTrace[]
  toolCalls?: ToolCallExecution[]
  thought?: string
  isStreaming?: boolean
  onOpenDesk?: () => void
}> = ({ steps, toolCalls, thought, isStreaming, onOpenDesk }) => {
  if (steps && steps.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, width: '100%' }}>
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1
          return (
            <div
              key={idx}
              style={{
                position: 'relative',
                paddingLeft: 16,
                borderLeft:
                  isLast && !isStreaming
                    ? '1px dashed rgba(255, 255, 255, 0.12)'
                    : '1px solid rgba(56, 189, 248, 0.25)',
                transition: 'all 0.2s ease'
              }}
            >
              {/* Step Timeline Node Dot */}
              <div
                style={{
                  position: 'absolute',
                  left: -5,
                  top: 2,
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  backgroundColor: isStreaming && isLast ? '#F59E0B' : '#38BDF8',
                  border: '2px solid #070B14',
                  boxShadow:
                    isStreaming && isLast
                      ? '0 0 10px rgba(245, 158, 11, 0.7)'
                      : '0 0 6px rgba(56, 189, 248, 0.4)'
                }}
              />

              {/* Step Header Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                  fontSize: 10,
                  fontFamily: THEME_TOKENS.typography.fontMono
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: '#F1F5F9' }}>
                    {step.title || `Step ${step.step}`}
                  </span>
                  {isStreaming && isLast && (
                    <span
                      style={{
                        color: '#F59E0B',
                        fontSize: 9,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        padding: '1px 5px',
                        borderRadius: 3
                      }}
                    >
                      <Loader2 size={9} className="tv-spin" />
                      running
                    </span>
                  )}
                </div>
                {step.durationMs !== undefined && (
                  <span style={{ color: '#64748B', fontSize: 9 }}>{step.durationMs}ms</span>
                )}
              </div>

              {/* Step Reasoning (Thought) */}
              {step.thought && (
                <ThoughtProcessCard thought={step.thought} isStreaming={isStreaming && isLast} />
              )}

              {/* Step Tool Calls */}
              {step.toolCalls && step.toolCalls.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  {step.toolCalls.map((tc, tcIdx) => (
                    <ToolCallDrawer key={tcIdx} toolCall={tc} onOpenDesk={onOpenDesk} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Fallback for single-turn messages
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
      {thought && <ThoughtProcessCard thought={thought} isStreaming={isStreaming} />}
      {toolCalls && toolCalls.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {toolCalls.map((tc, idx) => (
            <ToolCallDrawer key={idx} toolCall={tc} />
          ))}
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
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('')

  // AI Agent Store
  const {
    config,
    messages,
    analysisSnapshots,
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
  const selectedSnapshot = analysisSnapshots.find((snapshot) => snapshot.id === selectedSnapshotId)
  const latestSnapshot = analysisSnapshots[0] ?? null
  const comparisonSnapshot = selectedSnapshot && latestSnapshot?.id !== selectedSnapshot.id && latestSnapshot?.symbol === selectedSnapshot.symbol
    ? latestSnapshot
    : null

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
                border: activeTab === 'agent' ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid transparent',
                background: activeTab === 'agent' ? '#1E293B' : 'transparent',
                color: activeTab === 'agent' ? '#F8FAFC' : '#64748B',
                fontWeight: 700,
                fontSize: 10.5,
                padding: '3px 9px',
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              PIA Agent
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('desk')}
              style={{
                border: activeTab === 'desk' ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid transparent',
                background: activeTab === 'desk' ? '#1E293B' : 'transparent',
                color: activeTab === 'desk' ? '#F8FAFC' : '#64748B',
                fontWeight: 700,
                fontSize: 10.5,
                padding: '3px 9px',
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
              fontSize: 9.5,
              padding: '2px 7px',
              borderRadius: 4,
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.22)',
              color: '#38BDF8',
              fontFamily: THEME_TOKENS.typography.fontMono,
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
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 4,
              color: '#CBD5E1',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Settings size={11} color="#64748B" />
            <span style={{ fontFamily: THEME_TOKENS.typography.fontMono, fontSize: 9.5 }}>
              {config.provider === 'openai' ? config.model : 'Built-in'}
            </span>
          </button>
        </div>
      </div>

      {/* VIEW 1: INTERACTIVE AI AGENT */}
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
            {analysisSnapshots.length > 0 && (
              <section aria-label="Recent analysis history" style={{ padding: 8, border: '1px solid var(--border-subtle)', borderRadius: 6, background: 'var(--bg-surface)' }}>
                <label htmlFor="ai-analysis-history" style={{ display: 'block', marginBottom: 5, color: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }}>
                  Recent saved analyses · {analysisSnapshots.length}
                </label>
                <select
                  id="ai-analysis-history"
                  value={selectedSnapshotId || latestSnapshot?.id || ''}
                  onChange={(event) => setSelectedSnapshotId(event.target.value)}
                  style={{ width: '100%', padding: '5px 7px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--bg-app)', color: 'var(--text-primary)', fontSize: 10 }}
                >
                  {analysisSnapshots.map((snapshot) => (
                    <option key={snapshot.id} value={snapshot.id}>
                      {snapshot.symbol} · {snapshot.timeframe} · {new Date(snapshot.capturedAt).toLocaleString()}
                    </option>
                  ))}
                </select>
                {selectedSnapshot && <AnalysisSnapshotCard snapshot={selectedSnapshot} />}
                {comparisonSnapshot && (
                  <details style={{ marginTop: 5, color: 'var(--text-secondary)', fontSize: 10 }}>
                    <summary style={{ cursor: 'pointer' }}>Compare with latest ({new Date(comparisonSnapshot.capturedAt).toLocaleString()})</summary>
                    <AnalysisSnapshotCard snapshot={comparisonSnapshot} />
                  </details>
                )}
              </section>
            )}

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
                          paddingBottom: 6,
                          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#38BDF8'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Terminal size={12} color="#38BDF8" />
                          <span style={{ letterSpacing: '0.04em' }}>PIA AGENT</span>
                          <span style={{ color: '#64748B', fontWeight: 400, fontFamily: THEME_TOKENS.typography.fontMono, fontSize: 9 }}>
                            [{config.provider === 'openai' ? config.model : 'Quant Engine'}]
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Claude Code Style Iterative Step Execution Timeline */}
                    {m.analysis && <AnalysisSnapshotCard snapshot={m.analysis} />}
                    <ClaudeCodeStepTimeline
                      steps={m.steps}
                      toolCalls={m.toolCalls}
                      thought={m.thought}
                      isStreaming={m.isStreaming}
                      onOpenDesk={() => setActiveTab('desk')}
                    />

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
                role="status"
                aria-live="polite"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 12px',
                  backgroundColor: 'rgba(56, 189, 248, 0.06)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: 6,
                  color: '#38BDF8',
                  fontSize: 10.5,
                  fontFamily: THEME_TOKENS.typography.fontMono,
                  maxWidth: '94%'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={12} className="tv-spin" />
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
                    padding: '2px 8px',
                    borderRadius: 4,
                    backgroundColor: 'rgba(244, 63, 94, 0.15)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    color: '#FB7185',
                    fontSize: 9.5,
                    fontWeight: 700,
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
                backgroundColor: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.22)',
                color: '#38BDF8',
                borderRadius: 4,
                padding: '3px 8px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <LineChart size={11} color="#38BDF8" />
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
                  backgroundColor: !inputPrompt.trim() ? 'rgba(56, 189, 248, 0.2)' : '#38BDF8',
                  color: !inputPrompt.trim() ? '#64748B' : '#070B14',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '0.02em',
                  cursor: !inputPrompt.trim() ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
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
                  PIA Agent Configuration
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
