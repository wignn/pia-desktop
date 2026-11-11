/**
 * PIA Terminal - AI Agent Store (Zustand)
 * Institutional Quantitative Agent & MCP Tool Execution Store.
 * Runs a local LangGraph agent with OpenAI-compatible providers and PIA tools.
 */

import { create } from 'zustand'
import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'
import { invoke } from '@tauri-apps/api/core'
import { AiMcpEngine } from '../services/ai-mcp-engine'
import { sharedDbService, encodeMarketRegimeVector } from '../services/database'
import { usePaperTradingStore } from './usePaperTradingStore'
import { useMarketStore } from './useMarketStore'
import { getSymbolPrecision } from '@shared/market-utils'

export type AiProviderType = 'builtin' | 'openai'
export type CommitteeVerdict = 'APPROVED' | 'CAUTION' | 'VETOED'

export interface RiskAssessmentSummary {
  verdict: CommitteeVerdict
  accountEquity: number
  availableBalance: number
  accountDrawdownPercent: number
  openPositionsCount: number
  symbolExposureLots: number
  riskPercent: number
  riskAmountUsd: number
  recommendedLotSize: number
  rewardRiskRatio: number
  reasons: string[]
}

export interface AiAgentConfig {
  provider: AiProviderType
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
}

export interface TradePlanData {
  symbol: string
  bias: 'LONG' | 'SHORT' | 'NEUTRAL'
  orderType?: 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP' | 'MARKET'
  entry: number
  stopLoss: number
  takeProfit1: number
  takeProfit2: number
  riskRewardRatio: string
  suggestedLotSize?: number
  rationale?: string
  committeeVerdict?: CommitteeVerdict
  riskAmountUsd?: number
  riskPercent?: number
  committeeReasons?: string[]
}

export interface CompactAnalysisSnapshot {
  id: string
  symbol: string
  timeframe: string
  capturedAt: number
  summary: string
  bias?: 'LONG' | 'SHORT' | 'NEUTRAL'
  levels?: { entry?: number; stopLoss?: number; takeProfit1?: number; takeProfit2?: number }
  evidence: Record<string, number | string | null>
  unavailable: string[]
  tools: Array<{ name: string; durationMs?: number; status: 'ok' | 'error' }>
}

export interface ToolCallExecution {
  id: string
  name: string
  args: Record<string, any>
  result?: any
  durationMs?: number
  isError?: boolean
  isRunning?: boolean
}

export interface AgentStepTrace {
  step: number
  title?: string
  thought?: string
  toolCalls?: ToolCallExecution[]
  content?: string
  durationMs?: number
  timestamp: number
}

export interface AiAgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thought?: string
  steps?: AgentStepTrace[]
  toolCalls?: ToolCallExecution[]
  tradePlan?: TradePlanData
  timestamp: number
  isStreaming?: boolean
  analysis?: CompactAnalysisSnapshot
}

/**
 * Format raw numbers cleanly to avoid floating-point drift (e.g. 82221.95999999999).
 */
export function formatCleanPrice(val?: number, precision = 2): string {
  if (val === undefined || isNaN(val)) return '--'
  const rounded = Number(Math.round(Number(val + 'e' + precision)) + 'e-' + precision)
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: Math.min(precision, 2),
    maximumFractionDigits: precision
  })
}

/**
 * Parses <thought>...</thought>, <thinking>...</thinking>, or <think>...</think> blocks out of raw text (Claude Code / OpenCode / DeepSeek style).
 */
export function parseThinkingAndContent(raw: string): { thought?: string; content: string } {
  if (!raw) return { content: '' }

  const thoughtTagsRegex = /<(?:thought|thinking|think)>([\s\S]*?)<\/(?:thought|thinking|think)>/gi
  const matches = [...raw.matchAll(thoughtTagsRegex)]
  if (matches.length > 0) {
    const thought = matches.map((m) => m[1].trim()).join('\n\n')
    const content = raw.replace(thoughtTagsRegex, '').trim()
    return { thought, content }
  }

  const openMatch = raw.match(/<(?:thought|thinking|think)>([\s\S]*)$/i)
  if (openMatch) {
    return { thought: openMatch[1].trim(), content: '' }
  }

  return { content: raw }
}

interface AiAgentState {
  config: AiAgentConfig
  committeeMode: boolean
  messages: AiAgentMessage[]
  analysisSnapshots: CompactAnalysisSnapshot[]
  isBusy: boolean
  statusMessage: string | null
  isConfigOpen: boolean
  activeAbortController: AbortController | null

  setConfigOpen: (open: boolean) => void
  setCommitteeMode: (enabled: boolean) => void
  updateConfig: (updates: Partial<AiAgentConfig>) => void
  hydrateProviderCredentials: () => Promise<void>
  applyPreset: (presetKey: 'openai' | 'deepseek' | 'openrouter' | 'groq' | 'ollama') => void
  sendMessage: (prompt: string, currentSymbol: string) => Promise<void>
  abortGeneration: () => void
  clearChat: () => void
  testConnection: (overrideConfig?: Partial<AiAgentConfig>) => Promise<{ success: boolean; latencyMs?: number; error?: string }>
  executePaperOrderFromPlan: (plan: TradePlanData, lotSize?: number) => Promise<{ success: boolean; error?: string }>
  replotTradePlan: (planOrSymbol: TradePlanData | string) => Promise<boolean>
}

const ANALYSIS_SNAPSHOT_KEY = 'pia_ai_snapshots_v1'
const ANALYSIS_SNAPSHOT_LIMIT = 20

export function loadAnalysisSnapshots(): CompactAnalysisSnapshot[] {
  try {
    const raw = localStorage.getItem(ANALYSIS_SNAPSHOT_KEY)
    if (!raw || raw.length > 50_000) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is CompactAnalysisSnapshot =>
      Boolean(item && typeof item === 'object' &&
        typeof item.id === 'string' && item.id.length <= 80 &&
        typeof item.symbol === 'string' && item.symbol.length <= 32 &&
        typeof item.timeframe === 'string' && item.timeframe.length <= 16 &&
        Number.isFinite(item.capturedAt) && typeof item.summary === 'string' && item.summary.length <= 500 &&
        (item.bias === undefined || ['LONG', 'SHORT', 'NEUTRAL'].includes(item.bias)) &&
        item.evidence && typeof item.evidence === 'object' && !Array.isArray(item.evidence) &&
        Object.keys(item.evidence).length <= 40 &&
        Object.values(item.evidence as Record<string, unknown>).every((value: unknown) => value === null || (typeof value === 'string' && value.length <= 120) || (typeof value === 'number' && Number.isFinite(value))) &&
        Array.isArray(item.unavailable) && item.unavailable.length <= 40 &&
        item.unavailable.every((value: unknown) => typeof value === 'string' && value.length <= 80) &&
        Array.isArray(item.tools) && item.tools.length <= 24 &&
        item.tools.every((tool: unknown) => {
          if (!tool || typeof tool !== 'object') return false
          const record = tool as Record<string, unknown>
          return typeof record.name === 'string' && record.name.length <= 100 &&
            (record.durationMs === undefined || (typeof record.durationMs === 'number' && Number.isFinite(record.durationMs) && record.durationMs >= 0)) &&
            (record.status === 'ok' || record.status === 'error')
        })
      )
    ).slice(0, ANALYSIS_SNAPSHOT_LIMIT)
  } catch {
    return []
  }
}

export function createCompactAnalysisSnapshot(
  symbol: string,
  timeframe: string,
  summary: string,
  steps: AgentStepTrace[],
  tradePlan?: TradePlanData
): CompactAnalysisSnapshot {
  const tools = steps.flatMap((step) => step.toolCalls || [])
  const evidence: CompactAnalysisSnapshot['evidence'] = {}
  const unavailable: string[] = []
  for (const tool of tools) {
    const result = tool.result && typeof tool.result === 'object' ? tool.result : {}
    if (tool.name === 'compute_technical_analysis' || tool.name === 'execute_full_chart_analysis') {
      for (const key of ['currentPrice', 'trend', 'indicators', 'levels', 'timeframe']) {
        const value = result[key]
        if (typeof value === 'number' || typeof value === 'string') evidence[key] = value
        else if (value && typeof value === 'object') {
          for (const [nestedKey, nestedValue] of Object.entries(value)) {
            if (typeof nestedValue === 'number' || typeof nestedValue === 'string') evidence[nestedKey] = nestedValue
          }
        }
      }
    } else if (tool.name === 'get_market_snapshot') {
      for (const key of ['price', 'change24h', 'volume24h']) {
        if (typeof result[key] === 'number' && Number.isFinite(result[key])) evidence[key] = result[key]
        else unavailable.push(key)
      }
      if (result.orderbook) {
        for (const key of ['spread', 'imbalanceRatio']) {
          const value = result.orderbook[key]
          if (typeof value === 'number' && Number.isFinite(value)) evidence[key] = value
          else unavailable.push(key)
        }
      } else unavailable.push('orderbook')
    } else if (tool.name === 'get_news_sentiment') {
      if (result.available === true && typeof result.score === 'number') evidence.newsScore = result.score
      else unavailable.push('news sentiment')
    } else if (tool.name === 'run_piascript_backtest') {
      const metrics = result.metrics && typeof result.metrics === 'object' ? result.metrics : {}
      if (typeof metrics.sharpeRatio === 'number' && Number.isFinite(metrics.sharpeRatio)) {
        evidence.sharpeRatio = metrics.sharpeRatio
      }
      if (typeof metrics.winRate === 'number' && Number.isFinite(metrics.winRate)) {
        evidence.winRate = metrics.winRate
      }
      if (typeof metrics.profitFactor === 'number' && Number.isFinite(metrics.profitFactor)) {
        evidence.profitFactor = metrics.profitFactor
      }
    } else if (tool.name === 'get_kronos_forecast') {
      if (typeof result.bias === 'string') {
        evidence.kronosBias = result.bias
      }
      if (typeof result.expectedReturnPercent === 'number' && Number.isFinite(result.expectedReturnPercent)) {
        evidence.kronosExpectedReturn = result.expectedReturnPercent
      }
    } else if (tool.name === 'search_similar_market_regimes') {
      const stats = result.analogueStats && typeof result.analogueStats === 'object' ? result.analogueStats : {}
      if (
        typeof stats.historicalWinRate === 'number' &&
        Number.isFinite(stats.historicalWinRate) &&
        typeof stats.closedTradeCount === 'number' &&
        stats.closedTradeCount > 0
      ) {
        evidence.historicalWinRate = stats.historicalWinRate
      }
    }
  }
  if (tradePlan?.committeeVerdict) {
    evidence.committeeVerdict = tradePlan.committeeVerdict
  }
  if (typeof tradePlan?.suggestedLotSize === 'number' && Number.isFinite(tradePlan.suggestedLotSize)) {
    evidence.recommendedLotSize = tradePlan.suggestedLotSize
  }
  if (!('rsi14' in evidence)) unavailable.push('RSI')
  if (!('atr14' in evidence)) unavailable.push('ATR')
  return {
    id: `analysis-${Date.now()}`,
    symbol,
    timeframe,
    capturedAt: Date.now(),
    summary: summary.slice(0, 500),
    bias: tradePlan?.bias,
    levels: tradePlan ? { entry: tradePlan.entry, stopLoss: tradePlan.stopLoss, takeProfit1: tradePlan.takeProfit1, takeProfit2: tradePlan.takeProfit2 } : undefined,
    evidence,
    unavailable: [...new Set(unavailable)],
    tools: tools.map(({ name, durationMs, isError }) => ({ name, durationMs, status: isError ? 'error' : 'ok' }))
  }
}

export function persistAnalysisSnapshot(
  snapshot: CompactAnalysisSnapshot,
  existing: CompactAnalysisSnapshot[]
): CompactAnalysisSnapshot[] {
  const snapshots = [snapshot, ...existing.filter((item) => item.id !== snapshot.id)]
    .slice(0, ANALYSIS_SNAPSHOT_LIMIT)
  try {
    localStorage.setItem(ANALYSIS_SNAPSHOT_KEY, JSON.stringify(snapshots))
  } catch {
    // Optional history must not block analysis.
  }
  return snapshots
}

const DEFAULT_CONFIG: AiAgentConfig = {
  provider: 'builtin',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.1
}

interface StoredAiProviderCredentials {
  baseUrl: string
  apiKey: string
}

function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)
}

async function loadAiProviderCredentials(): Promise<StoredAiProviderCredentials | null> {
  if (!isTauriDesktop()) return null
  try {
    const raw = await invoke<string | null>('load_ai_provider_credentials')
    if (!raw) return null
    const stored = JSON.parse(raw) as Record<string, unknown>
    if (typeof stored.apiKey !== 'string' || typeof stored.baseUrl !== 'string') return null
    return { apiKey: stored.apiKey, baseUrl: stored.baseUrl }
  } catch {
    return null
  }
}

async function saveAiProviderCredentials(credentials: StoredAiProviderCredentials): Promise<boolean> {
  if (!isTauriDesktop()) return false
  try {
    await invoke('save_ai_provider_credentials', {
      content: JSON.stringify({ apiKey: credentials.apiKey, baseUrl: credentials.baseUrl })
    })
    return true
  } catch {
    return false
  }
}

function loadInitialConfig(): AiAgentConfig {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('pia_ai_agent_config')
      if (raw) {
        const saved = JSON.parse(raw) as Partial<AiAgentConfig>
        if (saved.apiKey) {
          const { apiKey: _apiKey, ...safeConfig } = saved
          localStorage.setItem('pia_ai_agent_config', JSON.stringify(safeConfig))
        }
        return { ...DEFAULT_CONFIG, ...saved, apiKey: '' }
      }
    } catch {}
  }
  return DEFAULT_CONFIG
}

function createPiaAgentTools(currentSymbol: string) {
  const symbolField = z.string().trim().min(1).max(32).default(currentSymbol)
  return [
    tool((args) => AiMcpEngine.executeTool('get_market_snapshot', args), {
      name: 'get_market_snapshot',
      description: 'Read the live ticker, orderbook depth, spread, and 24-hour metrics for a symbol.',
      schema: z.object({ symbol: symbolField })
    }),
    tool((args) => AiMcpEngine.executeTool('get_news_sentiment', args), {
      name: 'get_news_sentiment',
      description: 'Read recent news and social sentiment for a symbol.',
      schema: z.object({ symbol: symbolField, limit: z.number().int().min(1).max(100).optional() })
    }),
    tool(() => AiMcpEngine.executeTool('get_macro_context', {}), {
      name: 'get_macro_context',
      description: 'Read macro indicators and broad market context.',
      schema: z.object({})
    }),
    tool((args) => AiMcpEngine.executeTool('compute_technical_analysis', args), {
      name: 'compute_technical_analysis',
      description: 'Compute trend, indicators, swing points, and key price zones for a symbol.',
      schema: z.object({ symbol: symbolField, timeframe: z.string().optional() })
    }),
    tool((args) => AiMcpEngine.executeTool('draw_trendline_on_chart', args), {
      name: 'draw_trendline_on_chart',
      description: 'Draw a trendline on the chart between two time and price coordinates.',
      schema: z.object({
        symbol: symbolField,
        timestamp1: z.number().positive(), price1: z.number().positive(),
        timestamp2: z.number().positive(), price2: z.number().positive(),
        label: z.string().max(100).optional(), color: z.string().max(32).optional()
      })
    }),
    tool((args) => AiMcpEngine.executeTool('draw_level_on_chart', args), {
      name: 'draw_level_on_chart',
      description: 'Draw a support, resistance, or pivot level on the chart.',
      schema: z.object({
        symbol: symbolField, price: z.number().positive(),
        type: z.enum(['support', 'resistance', 'pivot']), label: z.string().max(100).optional()
      })
    }),
    tool((args) => AiMcpEngine.executeTool('draw_zone_on_chart', args), {
      name: 'draw_zone_on_chart',
      description: 'Draw a supply or demand zone on the chart.',
      schema: z.object({
        symbol: symbolField, type: z.enum(['demand', 'supply']),
        timestamp1: z.number().positive(), price1: z.number().positive(),
        timestamp2: z.number().positive(), price2: z.number().positive(), label: z.string().max(100).optional()
      })
    }),
    tool((args) => AiMcpEngine.executeTool('clear_chart_drawings', args), {
      name: 'clear_chart_drawings',
      description: 'Clear AI and custom drawings from the selected chart.',
      schema: z.object({ symbol: symbolField })
    }),
    tool((args) => AiMcpEngine.executeTool('execute_full_chart_analysis', args), {
      name: 'execute_full_chart_analysis',
      description: 'Run full market and chart analysis; may draw computed levels onto the chart.',
      schema: z.object({ symbol: symbolField, applyToChart: z.boolean().optional() })
    }),
    tool((args) => AiMcpEngine.executeTool('run_piascript_backtest', args), {
      name: 'run_piascript_backtest',
      description: 'Compile and backtest a custom PiaScript quantitative strategy on the active symbol, auto-applying indicator plots and BUY/SELL/CLOSE signals onto the chart and Strategy Tester while returning institutional metrics (Sharpe, Sortino, Expectancy, Profit Factor, Max Drawdown).',
      schema: z.object({
        symbol: symbolField,
        script: z.string().min(1).max(8000),
        initialCapital: z.number().min(100).max(100_000_000).optional()
      })
    }),
    tool((args) => AiMcpEngine.executeTool('get_kronos_forecast', args), {
      name: 'get_kronos_forecast',
      description: 'Retrieve Kronos AI multi-step probabilistic candlestick forecast (1 to 12 future bars) with q10/q50/q90 quantile bands and directional bias.',
      schema: z.object({
        symbol: symbolField,
        timeframe: z.string().max(16).optional(),
        horizon: z.number().int().min(1).max(12).optional()
      })
    }),
    tool((args) => AiMcpEngine.executeTool('search_similar_market_regimes', args), {
      name: 'search_similar_market_regimes',
      description: 'Search local SQLite Market Memory via 7D Cosine Similarity (K-NN) to find historical setups with similar RSI, ATR%, EMA spread, orderbook imbalance, sentiment, and Kronos return, returning empirical win rate and realized R-multiples.',
      schema: z.object({
        symbol: symbolField,
        k: z.number().int().min(1).max(50).optional(),
        sameSymbolOnly: z.boolean().optional()
      })
    }),
    tool((args) => AiMcpEngine.executeTool('audit_trading_journal', args), {
      name: 'audit_trading_journal',
      description: 'Audit closed paper-trade episodes in local SQLite Market Memory to compute win rate, profit factor, average realized R, long vs short accuracy, streak, and behavioral risk insights.',
      schema: z.object({
        symbol: z.string().max(32).optional(),
        limit: z.number().int().min(1).max(500).optional()
      })
    })
  ]
}

export function parseLlmResponseBody(raw: string): any {
  const trimmed = raw.trim()
  if (!trimmed) return {}

  // If standard JSON, parse directly
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      const choice = parsed?.choices?.[0]
      if (
        choice?.message?.reasoning_content &&
        !choice.message.content?.includes('<thought>') &&
        !choice.message.content?.includes('<think>')
      ) {
        choice.message.content = `<thought>\n${choice.message.reasoning_content.trim()}\n</thought>\n\n${
          choice.message.content || ''
        }`
      }
      return parsed
    } catch {}
  }

  // If SSE stream format (data: ...)
  if (trimmed.includes('data:')) {
    const lines = trimmed.split('\n')
    let accumulatedContent = ''
    let accumulatedReasoning = ''
    let toolCalls: any[] = []

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || !line.startsWith('data:')) continue
      const dataStr = line.replace(/^data:\s*/, '').trim()
      if (dataStr === '[DONE]') continue
      try {
        const parsed = JSON.parse(dataStr)
        const choice = parsed.choices?.[0]
        if (choice?.delta) {
          if (choice.delta.content) accumulatedContent += choice.delta.content
          if (choice.delta.reasoning_content) accumulatedReasoning += choice.delta.reasoning_content
          if (choice.delta.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: tc.id || `tc-${idx}`, type: 'function', function: { name: '', arguments: '' } }
              }
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments
            }
          }
        } else if (choice?.message) {
          if (choice.message.content) accumulatedContent += choice.message.content
          if (choice.message.reasoning_content) accumulatedReasoning += choice.message.reasoning_content
        }
      } catch {}
    }

    let finalContent = accumulatedContent
    if (accumulatedReasoning && !finalContent.includes('<thought>') && !finalContent.includes('<thinking>')) {
      finalContent = `<thought>\n${accumulatedReasoning.trim()}\n</thought>\n\n${finalContent}`
    }

    return {
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: finalContent,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined
          },
          finish_reason: 'stop'
        }
      ]
    }
  }

  return { choices: [{ message: { role: 'assistant', content: trimmed } }] }
}

interface UniversalResponse {
  ok: boolean
  status: number
  headers: Headers
  text: () => Promise<string>
  json: () => Promise<any>
}

/**
 * Universal HTTP fetch: uses native Tauri reqwest backend on desktop to bypass CORS & OPTIONS preflights,
 * and falls back to standard window.fetch in web environments.
 */
// ponytail: Native Tauri Rust proxy over browser fetch. Upgrade to WebSocket/IPC stream when token-by-token visual streaming is demanded in desktop mode.
async function universalFetch(url: string, options: RequestInit = {}): Promise<UniversalResponse> {
  const isTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)
  if (isTauri) {
    try {
      const headersMap: Record<string, string> = {}
      if (options.headers) {
        if (options.headers instanceof Headers) {
          options.headers.forEach((v, k) => {
            headersMap[k] = v
          })
        } else if (Array.isArray(options.headers)) {
          options.headers.forEach(([k, v]) => {
            headersMap[k] = v
          })
        } else {
          Object.assign(headersMap, options.headers)
        }
      }

      const bodyStr =
        typeof options.body === 'string'
          ? options.body
          : options.body
          ? JSON.stringify(options.body)
          : undefined

      const res = await invoke<{
        status: number
        headers: Record<string, string>
        body: string
      }>('native_http_request', {
        req: {
          url,
          method: options.method || 'GET',
          headers: headersMap,
          body: bodyStr
        }
      })

      const headers = new Headers(res.headers)
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        headers,
        text: async () => res.body,
        json: async () => parseLlmResponseBody(res.body)
      }
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (!msg.includes('command not found')) {
        throw new Error(msg)
      }
    }
  }

  const res = await fetch(url, options)
  return {
    ok: res.ok,
    status: res.status,
    headers: res.headers,
    text: () => res.text(),
    json: async () => {
      const raw = await res.text()
      return parseLlmResponseBody(raw)
    }
  }
}

/**
 * Fallback parser to extract actionable trade setup levels from unstructured LLM responses.
 */
// ponytail: regex heuristic parser for text trade plans. Upgrade to structured JSON mode or schema validation when provider strictly guarantees JSON schema.
function extractTradePlanFromText(text: string, defaultSymbol: string): TradePlanData | undefined {
  if (!text) return undefined
  // Strip thought tags before parsing setup
  const clean = text.replace(/<(?:thought|thinking)>[\s\S]*?<\/(?:thought|thinking)>/gi, '')

  const biasMatch = clean.match(/\b(LONG|SHORT|BUY|SELL)\b/i)
  const orderTypeMatch = clean.match(/\b(BUY[_\s]LIMIT|SELL[_\s]LIMIT|BUY[_\s]STOP|SELL[_\s]STOP|MARKET[_\s]BUY|MARKET[_\s]SELL|MARKET)\b/i)
  const entryMatch = clean.match(/(?:entry|open|buy at|sell at|entry zone)[:\s*]+([0-9]+(?:\.[0-9]+)?)/i)
  const slMatch = clean.match(/(?:stop loss|sl|invalidation)[:\s*]+([0-9]+(?:\.[0-9]+)?)/i)
  const tp1Match = clean.match(/(?:take profit 1|tp1|target 1|tp 1|take profit)[:\s*]+([0-9]+(?:\.[0-9]+)?)/i)
  const tp2Match = clean.match(/(?:take profit 2|tp2|target 2|tp 2)[:\s*]+([0-9]+(?:\.[0-9]+)?)/i)
  const rrMatch = clean.match(/(?:risk[\s/:]*reward|r:r|rrr)[:\s*]+([0-9]+(?::[0-9.]+|(?:\.[0-9]+)?))/i)
  const lotMatch = clean.match(/(?:suggested lot|lot size|size|lot)[:\s*]+([0-9]+(?:\.[0-9]+)?)/i)

  if (entryMatch && slMatch && tp1Match) {
    const rawBias = biasMatch ? biasMatch[1].toUpperCase() : ''
    const bias: 'LONG' | 'SHORT' | 'NEUTRAL' =
      rawBias === 'BUY' || rawBias === 'LONG' ? 'LONG' : rawBias === 'SELL' || rawBias === 'SHORT' ? 'SHORT' : 'NEUTRAL'

    let orderType: 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP' | 'MARKET' =
      bias === 'LONG' ? 'BUY_LIMIT' : 'SELL_LIMIT'

    if (orderTypeMatch) {
      const normalizedType = orderTypeMatch[1].toUpperCase().replace(/\s+/, '_')
      if (normalizedType.includes('BUY_LIMIT')) orderType = 'BUY_LIMIT'
      else if (normalizedType.includes('SELL_LIMIT')) orderType = 'SELL_LIMIT'
      else if (normalizedType.includes('BUY_STOP')) orderType = 'BUY_STOP'
      else if (normalizedType.includes('SELL_STOP')) orderType = 'SELL_STOP'
      else if (normalizedType.includes('MARKET')) orderType = 'MARKET'
    }

    const { pricePrecision } = getSymbolPrecision(defaultSymbol, undefined, parseFloat(entryMatch[1]))
    const roundP = (n: number) => Number(Math.round(Number(n + 'e' + pricePrecision)) + 'e-' + pricePrecision)

    const entry = roundP(parseFloat(entryMatch[1]))
    const stopLoss = roundP(parseFloat(slMatch[1]))
    const takeProfit1 = roundP(parseFloat(tp1Match[1]))
    const takeProfit2 = tp2Match ? roundP(parseFloat(tp2Match[1])) : takeProfit1
    const suggestedLotSize = lotMatch ? parseFloat(lotMatch[1]) : 0.1

    const calculatedRr =
      Math.abs(takeProfit1 - entry) > 0 && Math.abs(entry - stopLoss) > 0
        ? `1:${(Math.abs(takeProfit1 - entry) / Math.abs(entry - stopLoss)).toFixed(2)}`
        : '1:2'

    return {
      symbol: defaultSymbol,
      bias,
      orderType,
      entry,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskRewardRatio: rrMatch ? rrMatch[1] : calculatedRr,
      suggestedLotSize,
      rationale: 'Extracted from AI quantitative briefing'
    }
  }
  return undefined
}

/**
 * Detects whether the user explicitly requested a trade setup, entry parameters, or order placement.
 * General informational or analytical questions (e.g. "kenapa emas turun") will evaluate to false.
 */
export function hasExplicitTradeIntent(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return (
    /\b(setup|trading plan|trade plan|entry|sinyal|signal|order limit|limit order|stop order|posisi|open position|pasang posisi|pasang order)\b/i.test(lower) ||
    /\b(rekomendasi (entry|trade|posisi|buy|sell|order))\b/i.test(lower) ||
    /\b(boleh (buy|sell|entry|long|short)|kapan (buy|sell|entry)|saatnya (buy|sell))\b/i.test(lower) ||
    /\b(buy|sell|long|short)\s+(limit|stop|now|sekarang)\b/i.test(lower)
  )
}

/**
 * Smart Conditional Router (Option A):
 * Routes fast utility commands (clear drawings, orderbook-only, sentiment-only, short chat)
 * to single-pass execution while routing trade setup requests, backtest/forecast requests,
 * committee queries, or forced committeeMode prompts to the 3-node StateGraph.
 */
export function shouldRunTradingCommittee(prompt: string, committeeMode = false): boolean {
  const trimmed = prompt.trim()
  if (!trimmed) return false
  const lower = trimmed.toLowerCase()

  // Destructive/utility chart clear commands always take the fast path
  const isClearCommand =
    /\b(clear|reset|remove|hapus|bersihkan)\b/i.test(lower) &&
    /\b(draw|drawing|drawings|chart|garis|level|zone|trendline|semua)\b/i.test(lower)
  if (isClearCommand) return false

  if (committeeMode) return true

  if (hasExplicitTradeIntent(trimmed)) return true

  return /\b(committee|komite|multi-agent|backtest|piascript|kronos|forecast|prediksi|analisis\s+lengkap|full\s+analysis)\b/i.test(
    lower
  )
}

/**
 * Node 3 Risk & Execution Officer calculator:
 * Evaluates live paper-trading equity, unrealized PnL, drawdown, 1% equity risk position sizing,
 * cent-account multiplier (100x), and institutional verdict guardrails (APPROVED / CAUTION / VETOED).
 */
export function computeCommitteeRiskAssessment(params: {
  symbol: string
  bias: 'LONG' | 'SHORT' | 'NEUTRAL'
  entry: number
  stopLoss: number
  takeProfit1: number
  sharpeRatio?: number
  winRate?: number
  kronosBias?: string
  historicalWinRate?: number
  historicalSampleCount?: number
}): RiskAssessmentSummary {
  const paperState = usePaperTradingStore.getState()
  const marketPrices = useMarketStore.getState().prices || {}
  const account = paperState.account
  const isCent = (account.accountType || paperState.accountType) === 'cent'
  const multiplier = isCent ? 100 : 1

  let positionsValue = 0
  let symbolExposureLots = 0
  const targetSym = params.symbol.toUpperCase()

  for (const pos of account.positions || []) {
    const markPrice = marketPrices[pos.symbol]?.price ?? pos.entryPrice
    const posMult = pos.accountType === 'cent' ? 100 : multiplier
    const originalNotional = pos.size * pos.entryPrice * posMult
    const priceDiff = pos.side === 'buy' ? markPrice - pos.entryPrice : pos.entryPrice - markPrice
    const unrealizedPnl = priceDiff * pos.size * posMult
    positionsValue += originalNotional + unrealizedPnl
    if (pos.symbol.toUpperCase() === targetSym) {
      symbolExposureLots += pos.size
    }
  }

  const availableBalance = Math.max(0, Number.isFinite(account.balance) ? account.balance : 0)
  const accountEquity = Math.max(0, Number((availableBalance + positionsValue).toFixed(2)))
  const initialBalance = Math.max(1, Number.isFinite(account.initialBalance) && account.initialBalance > 0 ? account.initialBalance : 100000)
  const accountDrawdownPercent = Math.max(0, Number((((initialBalance - accountEquity) / initialBalance) * 100).toFixed(2)))

  const riskPercent = 1.0
  const targetRiskUsd = accountEquity * (riskPercent / 100)
  const entry = Number.isFinite(params.entry) && params.entry > 0 ? params.entry : 0
  const stopLoss = Number.isFinite(params.stopLoss) && params.stopLoss > 0 ? params.stopLoss : entry
  const takeProfit1 = Number.isFinite(params.takeProfit1) && params.takeProfit1 > 0 ? params.takeProfit1 : entry

  const stopDistance = Math.abs(entry - stopLoss)
  const rewardDistance = Math.abs(takeProfit1 - entry)
  const rewardRiskRatio = stopDistance > 0 ? Number((rewardDistance / stopDistance).toFixed(2)) : 0

  const rawRiskLots = stopDistance > 0 ? targetRiskUsd / (stopDistance * multiplier) : 0.01
  const maxMarginLots = entry > 0 ? (availableBalance * 0.9) / (entry * multiplier) : 0.01
  const unclampedLots = stopDistance > 0 ? Math.min(rawRiskLots, Math.max(0.01, maxMarginLots), 50) : 0.01
  const recommendedLotSize = Math.max(0.01, Math.floor(unclampedLots * 100 + 1e-9) / 100)
  const riskAmountUsd = Number((recommendedLotSize * stopDistance * multiplier).toFixed(2))

  const reasons: string[] = []
  let verdict: CommitteeVerdict = 'APPROVED'

  const minNotionalRequired = entry > 0 ? 0.01 * entry * multiplier : 0
  if (accountDrawdownPercent >= 15) {
    verdict = 'VETOED'
    reasons.push(`Account drawdown (${accountDrawdownPercent.toFixed(1)}%) exceeds 15% maximum threshold`)
  }
  if (rewardRiskRatio > 0 && rewardRiskRatio < 1.2) {
    verdict = 'VETOED'
    reasons.push(`Reward:Risk ratio (1:${rewardRiskRatio.toFixed(2)}) is below minimum 1:1.2 guardrail`)
  }
  if (entry > 0 && availableBalance < minNotionalRequired) {
    verdict = 'VETOED'
    reasons.push(`Insufficient free balance (${availableBalance.toFixed(2)}) for 0.01 lot margin`)
  }

  if (verdict !== 'VETOED') {
    if (rewardRiskRatio >= 1.2 && rewardRiskRatio < 1.5) {
      verdict = 'CAUTION'
      reasons.push(`Reward:Risk (1:${rewardRiskRatio.toFixed(2)}) is below preferred 1:1.5 institutional target`)
    }
    if (params.sharpeRatio !== undefined && params.sharpeRatio < 0) {
      verdict = 'CAUTION'
      reasons.push(`Backtest Sharpe ratio (${params.sharpeRatio.toFixed(2)}) is negative on active bars`)
    }
    if (
      params.kronosBias &&
      ((params.bias === 'LONG' && params.kronosBias.toUpperCase() === 'BEARISH') ||
        (params.bias === 'SHORT' && params.kronosBias.toUpperCase() === 'BULLISH'))
    ) {
      verdict = 'CAUTION'
      reasons.push(`Kronos probabilistic forecast (${params.kronosBias}) diverges from ${params.bias} technical bias`)
    }
    if (accountDrawdownPercent >= 8) {
      verdict = 'CAUTION'
      reasons.push(`Elevated portfolio drawdown (${accountDrawdownPercent.toFixed(1)}%) requires reduced sizing`)
    }
    if (
      params.historicalSampleCount !== undefined &&
      params.historicalSampleCount >= 3 &&
      params.historicalWinRate !== undefined &&
      Number.isFinite(params.historicalWinRate)
    ) {
      if (params.historicalWinRate < 35) {
        verdict = 'CAUTION'
        reasons.push(
          `Historical Memory RAG: Low win rate (${params.historicalWinRate.toFixed(0)}% across ${params.historicalSampleCount} similar setups)`
        )
      } else if (params.historicalWinRate >= 60) {
        reasons.push(
          `Historical Memory RAG: Strong win rate (${params.historicalWinRate.toFixed(0)}% across ${params.historicalSampleCount} similar setups)`
        )
      }
    }
  }

  if (reasons.length === 0) {
    reasons.push(
      `R:R 1:${rewardRiskRatio.toFixed(2)} and 1% equity sizing (${recommendedLotSize} Lot) satisfy all risk guardrails`
    )
  }

  return {
    verdict,
    accountEquity,
    availableBalance,
    accountDrawdownPercent,
    openPositionsCount: (account.positions || []).length,
    symbolExposureLots: Number(symbolExposureLots.toFixed(2)),
    riskPercent,
    riskAmountUsd,
    recommendedLotSize,
    rewardRiskRatio,
    reasons
  }
}

export async function runTradingCommitteeGraph(params: {
  prompt: string
  symbol: string
  provider: AiProviderType
  config: AiAgentConfig
  priorMessages?: Array<{ role: string; content: string }>
  abortSignal?: AbortSignal
  onStepUpdate?: (steps: AgentStepTrace[], statusMessage: string) => void
}): Promise<{
  content: string
  thought: string
  steps: AgentStepTrace[]
  toolCalls: ToolCallExecution[]
  tradePlan?: TradePlanData
  riskAssessment: RiskAssessmentSummary
}> {
  const { prompt, symbol, provider, config, abortSignal, onStepUpdate } = params
  const timeframe = useMarketStore.getState().timeframe || '15m'

  const CommitteeState = Annotation.Root({
    technicalAnalysis: Annotation<any>({ reducer: (_x, y) => y, default: () => null }),
    marketSnapshot: Annotation<any>({ reducer: (_x, y) => y, default: () => null }),
    draftPlan: Annotation<TradePlanData | undefined>({ reducer: (_x, y) => y, default: () => undefined }),
    backtestResult: Annotation<any>({ reducer: (_x, y) => y, default: () => null }),
    kronosResult: Annotation<any>({ reducer: (_x, y) => y, default: () => null }),
    sentimentResult: Annotation<any>({ reducer: (_x, y) => y, default: () => null }),
    memoryResult: Annotation<any>({ reducer: (_x, y) => y, default: () => null }),
    steps: Annotation<AgentStepTrace[]>({ reducer: (x, y) => [...x, ...y], default: () => [] }),
    riskAssessment: Annotation<RiskAssessmentSummary | null>({ reducer: (_x, y) => y, default: () => null }),
    finalContent: Annotation<string>({ reducer: (_x, y) => y, default: () => '' }),
    finalThought: Annotation<string>({ reducer: (_x, y) => y, default: () => '' })
  })

  const accumulatedSteps: AgentStepTrace[] = []

  const graph = new StateGraph(CommitteeState)
    .addNode('technical_analyst', async () => {
      if (abortSignal?.aborted) throw new DOMException('Generation stopped', 'AbortError')
      const startTs = performance.now()
      onStepUpdate?.([...accumulatedSteps], '[1/3] Technical Analyst: Mapping structure & chart levels...')

      const toolCalls: ToolCallExecution[] = []
      let technicalAnalysis: any = null
      let marketSnapshot: any = null

      const t1 = performance.now()
      try {
        technicalAnalysis = await AiMcpEngine.executeFullChartAnalysis(symbol, true)
        toolCalls.push({
          id: `tc-tech-full-${Date.now()}`,
          name: 'execute_full_chart_analysis',
          args: { symbol, applyToChart: true },
          result: technicalAnalysis,
          durationMs: Math.max(1, Math.round(performance.now() - t1))
        })
      } catch (err: any) {
        toolCalls.push({
          id: `tc-tech-full-${Date.now()}`,
          name: 'execute_full_chart_analysis',
          args: { symbol, applyToChart: true },
          result: { error: err?.message || 'Technical analysis failed' },
          durationMs: Math.max(1, Math.round(performance.now() - t1)),
          isError: true
        })
      }

      const t2 = performance.now()
      try {
        marketSnapshot = await AiMcpEngine.getMarketSnapshot(symbol)
        toolCalls.push({
          id: `tc-tech-snap-${Date.now()}`,
          name: 'get_market_snapshot',
          args: { symbol },
          result: marketSnapshot,
          durationMs: Math.max(1, Math.round(performance.now() - t2))
        })
      } catch (err: any) {
        toolCalls.push({
          id: `tc-tech-snap-${Date.now()}`,
          name: 'get_market_snapshot',
          args: { symbol },
          result: { error: err?.message || 'Snapshot unavailable' },
          durationMs: Math.max(1, Math.round(performance.now() - t2)),
          isError: true
        })
      }

      const livePrice =
        useMarketStore.getState().prices[symbol]?.price ||
        marketSnapshot?.price ||
        technicalAnalysis?.currentPrice ||
        100
      const { pricePrecision } = getSymbolPrecision(symbol, undefined, livePrice)
      const roundP = (n: number) => Number(Math.round(Number(n + 'e' + pricePrecision)) + 'e-' + pricePrecision)

      const rawPlan = technicalAnalysis?.tradePlan
      const bias: 'LONG' | 'SHORT' | 'NEUTRAL' = rawPlan?.bias || 'LONG'
      const atr = technicalAnalysis?.indicators?.atr14 || livePrice * 0.01
      const entry = roundP(rawPlan?.entry ?? rawPlan?.suggestedEntry ?? livePrice)
      const stopLoss = roundP(rawPlan?.stopLoss ?? (bias === 'SHORT' ? entry + atr : entry - atr))
      const takeProfit1 = roundP(rawPlan?.takeProfit1 ?? (bias === 'SHORT' ? entry - atr * 2 : entry + atr * 2))
      const takeProfit2 = roundP(rawPlan?.takeProfit2 ?? (bias === 'SHORT' ? entry - atr * 3 : entry + atr * 3))
      const stopDist = Math.abs(entry - stopLoss)
      const rrRatio = stopDist > 0 ? `1:${(Math.abs(takeProfit1 - entry) / stopDist).toFixed(2)}` : '1:2.00'

      const draftPlan: TradePlanData = {
        symbol,
        bias,
        orderType: rawPlan?.orderType || (bias === 'SHORT' ? 'SELL_LIMIT' : 'BUY_LIMIT'),
        entry,
        stopLoss,
        takeProfit1,
        takeProfit2,
        riskRewardRatio: rawPlan?.riskRewardRatio || rrRatio,
        rationale: rawPlan?.rationale || `${technicalAnalysis?.trend || 'Structural'} setup mapped by Technical Analyst`
      }

      const step1: AgentStepTrace = {
        step: 1,
        title: '[1/3] Technical & Structure Analyst',
        thought: `Structure: ${String(technicalAnalysis?.trend || 'NEUTRAL').toUpperCase()} | Spot: ${formatCleanPrice(livePrice, pricePrecision)} | RSI(14): ${technicalAnalysis?.indicators?.rsi14 ?? '--'} | ATR(14): ${technicalAnalysis?.indicators?.atr14 ?? '--'} | Candidate ${draftPlan.bias} @ ${formatCleanPrice(draftPlan.entry, pricePrecision)} (SL ${formatCleanPrice(draftPlan.stopLoss, pricePrecision)}, TP1 ${formatCleanPrice(draftPlan.takeProfit1, pricePrecision)})`,
        toolCalls,
        durationMs: Math.max(1, Math.round(performance.now() - startTs)),
        timestamp: Date.now()
      }
      accumulatedSteps.push(step1)
      onStepUpdate?.([...accumulatedSteps], '[2/3] Quant & Forecast Specialist: Running PiaScript backtest & Kronos rollout...')

      return {
        technicalAnalysis,
        marketSnapshot,
        draftPlan,
        steps: [step1]
      }
    })
    .addNode('quant_forecast_specialist', async () => {
      if (abortSignal?.aborted) throw new DOMException('Generation stopped', 'AbortError')
      const startTs = performance.now()
      const toolCalls: ToolCallExecution[] = []
      let backtestResult: any = null
      let kronosResult: any = null
      let sentimentResult: any = null

      const script = [
        'fast = ema(close, 8)',
        'slow = ema(close, 21)',
        'mom = rsi(close, 14)',
        'plot(fast, color="#38bdf8", title="EMA 8")',
        'plot(slow, color="#f59e0b", title="EMA 21")',
        'if crossover(fast, slow):',
        '    buy(1)',
        'if crossunder(fast, slow):',
        '    close()'
      ].join('\n')

      const initialCap = Math.max(1000, usePaperTradingStore.getState().account.initialBalance || 100000)

      const tBt = performance.now()
      try {
        backtestResult = await AiMcpEngine.executeTool('run_piascript_backtest', {
          symbol,
          script,
          initialCapital: initialCap
        })
        toolCalls.push({
          id: `tc-quant-bt-${Date.now()}`,
          name: 'run_piascript_backtest',
          args: { symbol, initialCapital: initialCap },
          result: backtestResult,
          durationMs: Math.max(1, Math.round(performance.now() - tBt)),
          isError: Boolean(backtestResult && backtestResult.success === false)
        })
      } catch (err: any) {
        toolCalls.push({
          id: `tc-quant-bt-${Date.now()}`,
          name: 'run_piascript_backtest',
          args: { symbol, initialCapital: initialCap },
          result: { error: err?.message || 'Backtest execution error' },
          durationMs: Math.max(1, Math.round(performance.now() - tBt)),
          isError: true
        })
      }

      const tKr = performance.now()
      try {
        kronosResult = await AiMcpEngine.executeTool('get_kronos_forecast', {
          symbol,
          timeframe,
          horizon: 6
        })
        toolCalls.push({
          id: `tc-quant-kr-${Date.now()}`,
          name: 'get_kronos_forecast',
          args: { symbol, timeframe, horizon: 6 },
          result: kronosResult,
          durationMs: Math.max(1, Math.round(performance.now() - tKr))
        })
      } catch (err: any) {
        toolCalls.push({
          id: `tc-quant-kr-${Date.now()}`,
          name: 'get_kronos_forecast',
          args: { symbol, timeframe, horizon: 6 },
          result: { error: err?.message || 'Kronos forecast unavailable' },
          durationMs: Math.max(1, Math.round(performance.now() - tKr)),
          isError: true
        })
      }

      const tSent = performance.now()
      try {
        sentimentResult = await AiMcpEngine.getNewsSentiment(symbol, 6)
        toolCalls.push({
          id: `tc-quant-sent-${Date.now()}`,
          name: 'get_news_sentiment',
          args: { symbol, limit: 6 },
          result: sentimentResult,
          durationMs: Math.max(1, Math.round(performance.now() - tSent))
        })
      } catch (err: any) {
        toolCalls.push({
          id: `tc-quant-sent-${Date.now()}`,
          name: 'get_news_sentiment',
          args: { symbol, limit: 6 },
          result: { error: err?.message || 'News sentiment unavailable' },
          durationMs: Math.max(1, Math.round(performance.now() - tSent)),
          isError: true
        })
      }

      let memoryResult: any = null
      const tMem = performance.now()
      try {
        memoryResult = await AiMcpEngine.executeTool('search_similar_market_regimes', {
          symbol,
          k: 5,
          sameSymbolOnly: true
        })
        toolCalls.push({
          id: `tc-quant-mem-${Date.now()}`,
          name: 'search_similar_market_regimes',
          args: { symbol, k: 5, sameSymbolOnly: true },
          result: memoryResult,
          durationMs: Math.max(1, Math.round(performance.now() - tMem))
        })
      } catch (err: any) {
        toolCalls.push({
          id: `tc-quant-mem-${Date.now()}`,
          name: 'search_similar_market_regimes',
          args: { symbol, k: 5, sameSymbolOnly: true },
          result: { error: err?.message || 'Market memory search unavailable' },
          durationMs: Math.max(1, Math.round(performance.now() - tMem)),
          isError: true
        })
      }

      const metrics = backtestResult?.metrics || {}
      const histWinRate = memoryResult?.analogueStats?.historicalWinRate
      const histClosedCount = memoryResult?.analogueStats?.closedTradeCount ?? 0
      const step2: AgentStepTrace = {
        step: 2,
        title: '[2/3] Quant & Kronos Forecast Specialist',
        thought: `PiaScript Backtest: Sharpe ${metrics.sharpeRatio ?? '--'} | Sortino ${metrics.sortinoRatio ?? '--'} | Win Rate ${metrics.winRate !== undefined ? `${metrics.winRate}%` : '--'} | Expectancy $${metrics.expectancy ?? '--'} | Kronos 6-Bar Bias: ${kronosResult?.bias ?? 'UNAVAILABLE'} (q50: ${kronosResult?.quantiles?.q50 ?? '--'}) | News Score: ${sentimentResult?.score ?? '--'} | Memory RAG: ${histClosedCount > 0 ? `${histWinRate}% (${histClosedCount} setups)` : 'Cold start'}`,
        toolCalls,
        durationMs: Math.max(1, Math.round(performance.now() - startTs)),
        timestamp: Date.now()
      }
      accumulatedSteps.push(step2)
      onStepUpdate?.([...accumulatedSteps], '[3/3] Risk & Execution Officer: Computing 1% equity sizing & guardrails...')

      return {
        backtestResult,
        kronosResult,
        sentimentResult,
        memoryResult,
        steps: [step2]
      }
    })
    .addNode('risk_execution_officer', async (state) => {
      if (abortSignal?.aborted) throw new DOMException('Generation stopped', 'AbortError')
      const startTs = performance.now()
      const candidate = state.draftPlan || {
        symbol,
        bias: 'LONG' as const,
        orderType: 'BUY_LIMIT' as const,
        entry: 100,
        stopLoss: 98,
        takeProfit1: 104,
        takeProfit2: 106,
        riskRewardRatio: '1:2.00'
      }

      const metrics = state.backtestResult?.metrics || {}
      const analogueStats = state.memoryResult?.analogueStats
      const riskAssessment = computeCommitteeRiskAssessment({
        symbol,
        bias: candidate.bias,
        entry: candidate.entry,
        stopLoss: candidate.stopLoss,
        takeProfit1: candidate.takeProfit1,
        sharpeRatio: typeof metrics.sharpeRatio === 'number' ? metrics.sharpeRatio : undefined,
        winRate: typeof metrics.winRate === 'number' ? metrics.winRate : undefined,
        kronosBias: typeof state.kronosResult?.bias === 'string' ? state.kronosResult.bias : undefined,
        historicalWinRate:
          typeof analogueStats?.historicalWinRate === 'number' ? analogueStats.historicalWinRate : undefined,
        historicalSampleCount:
          typeof analogueStats?.closedTradeCount === 'number' ? analogueStats.closedTradeCount : undefined
      })

      const enrichedPlan: TradePlanData = {
        ...candidate,
        suggestedLotSize: riskAssessment.recommendedLotSize,
        riskRewardRatio: `1:${riskAssessment.rewardRiskRatio.toFixed(2)}`,
        committeeVerdict: riskAssessment.verdict,
        riskAmountUsd: riskAssessment.riskAmountUsd,
        riskPercent: riskAssessment.riskPercent,
        committeeReasons: riskAssessment.reasons
      }

      try {
        const indicators = state.technicalAnalysis?.indicators || {}
        const featureVec = encodeMarketRegimeVector({
          price: state.technicalAnalysis?.currentPrice || enrichedPlan.entry,
          rsi14: indicators.rsi14,
          atr14: indicators.atr14,
          ema20: indicators.ema20,
          ema50: indicators.ema50,
          orderbookImbalance: state.marketSnapshot?.orderbook?.imbalanceRatio,
          newsScore: state.sentimentResult?.score,
          kronosExpectedReturnPercent: state.kronosResult?.expectedReturnPercent,
          trendDirection: enrichedPlan.bias
        })
        sharedDbService.saveMarketMemoryEpisode({
          id: `ep-committee-${symbol}-${Date.now()}`,
          symbol,
          timeframe,
          source: 'committee_snapshot',
          side: enrichedPlan.bias,
          entryPrice: enrichedPlan.entry,
          stopLoss: enrichedPlan.stopLoss,
          takeProfit: enrichedPlan.takeProfit1,
          size: enrichedPlan.suggestedLotSize,
          outcome: 'OPEN',
          featureVector: featureVec,
          metadata: {
            verdict: riskAssessment.verdict,
            sharpeRatio: metrics.sharpeRatio,
            kronosBias: state.kronosResult?.bias,
            rsi14: indicators.rsi14
          },
          createdAt: Date.now()
        })
      } catch {
        // Non-blocking memory snapshot
      }

      await AiMcpEngine.plotTradePlanLevels(enrichedPlan).catch(() => false)

      const step3: AgentStepTrace = {
        step: 3,
        title: '[3/3] Risk & Execution Officer',
        thought: `Verdict: ${riskAssessment.verdict} | Equity: $${riskAssessment.accountEquity.toLocaleString()} (DD: ${riskAssessment.accountDrawdownPercent}%) | 1% Risk Sizing: ${riskAssessment.recommendedLotSize} Lot ($${riskAssessment.riskAmountUsd} risk) | Guardrails: ${riskAssessment.reasons.join('; ')}`,
        toolCalls: [
          {
            id: `tc-risk-${Date.now()}`,
            name: 'evaluate_portfolio_risk_and_sizing',
            args: { symbol, riskPercent: 1.0, entry: enrichedPlan.entry, stopLoss: enrichedPlan.stopLoss },
            result: riskAssessment,
            durationMs: Math.max(1, Math.round(performance.now() - startTs))
          }
        ],
        durationMs: Math.max(1, Math.round(performance.now() - startTs)),
        timestamp: Date.now()
      }
      accumulatedSteps.push(step3)
      onStepUpdate?.([...accumulatedSteps], 'Synthesizing final Trading Committee briefing...')

      const { pricePrecision } = getSymbolPrecision(symbol, undefined, enrichedPlan.entry)
      const formatP = (n?: number) => formatCleanPrice(n, pricePrecision)
      const isIndonesian =
        /(?:menurut|kamu|anda|saya|suport|support|resis|resist|resistance|supply|demand|mana|paling|kuat|lemah|kenapa|mengapa|apakah|bisa|gimana|bagaimana|naik|turun|arah|tren|trend|hari|ini|kira|sarannya|dong|lah|kah|kok|ya|nih|tuh|kan|dan|di|ke|dari|untuk|yang|ini|itu|ada|gak|nggak|enggak|tidak|mau|akan|udah|sudah|belum|lagi|sedang|terus|sekarang|posisi|beli|jual|pasang|taktis|halo|hai|tolong|masuk|ambil|order|open|jenuh|koreksi|pantulan|buatkan|komite|analisis|prediksi)/i.test(
          prompt
        )

      let finalContent = ''
      if (provider === 'openai' && (config.apiKey || config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1'))) {
        try {
          const normalizedBaseUrl = config.baseUrl.trim().replace(/\/+$/, '')
          const endpoint = `${normalizedBaseUrl}/chat/completions`
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`
          const res = await universalFetch(endpoint, {
            method: 'POST',
            headers,
            signal: abortSignal,
            body: JSON.stringify({
              model: config.model,
              temperature: config.temperature ?? 0.1,
              messages: [
                {
                  role: 'system',
                  content: `You are the Chair of the PIA Institutional Trading Committee for ${symbol}. Synthesize the 3-specialist findings (1. Technical & Structure Analyst, 2. Quant & Kronos Forecast Specialist, 3. Risk & Execution Officer) into a concise executive briefing in the user's language.`
                },
                {
                  role: 'user',
                  content: JSON.stringify({
                    userPrompt: prompt,
                    technical: {
                      trend: state.technicalAnalysis?.trend,
                      indicators: state.technicalAnalysis?.indicators,
                      levels: state.technicalAnalysis?.levels
                    },
                    quant: {
                      backtestMetrics: metrics,
                      kronosForecast: {
                        bias: state.kronosResult?.bias,
                        expectedReturnPercent: state.kronosResult?.expectedReturnPercent,
                        quantiles: state.kronosResult?.quantiles
                      }
                    },
                    riskAndExecution: {
                      verdict: riskAssessment.verdict,
                      recommendedLotSize: riskAssessment.recommendedLotSize,
                      riskAmountUsd: riskAssessment.riskAmountUsd,
                      accountEquity: riskAssessment.accountEquity,
                      reasons: riskAssessment.reasons,
                      tradePlan: enrichedPlan
                    }
                  })
                }
              ]
            })
          })
          if (res.ok) {
            const data = await res.json()
            const rawText = data?.choices?.[0]?.message?.content || ''
            finalContent = parseThinkingAndContent(rawText).content.trim()
          }
        } catch {
          // Fall back to deterministic institutional formatter below if LLM synthesis fails
        }
      }

      if (!finalContent) {
        const orderLabel = (enrichedPlan.orderType || 'BUY_LIMIT').replace('_', ' ')
        finalContent = isIndonesian
          ? `### Keputusan Komite Kuantitatif (${symbol}): **${riskAssessment.verdict}**

#### 1. Technical & Structure Analyst
- **Struktur Tren:** **${String(state.technicalAnalysis?.trend || 'NEUTRAL').toUpperCase()}** | RSI(14): **${state.technicalAnalysis?.indicators?.rsi14 ?? '--'}** | ATR(14): **${formatP(state.technicalAnalysis?.indicators?.atr14)}**
- **Level Kunci:** Entry **${formatP(enrichedPlan.entry)}** (${orderLabel}) | Stop Loss **${formatP(enrichedPlan.stopLoss)}** | Target 1 **${formatP(enrichedPlan.takeProfit1)}** | Target 2 **${formatP(enrichedPlan.takeProfit2)}**

#### 2. Quant & Kronos Forecast Specialist
- **PiaScript Backtest (Otomatis Diterapkan ke Chart):** Sharpe Ratio **${metrics.sharpeRatio ?? '--'}** | Sortino **${metrics.sortinoRatio ?? '--'}** | Win Rate **${metrics.winRate !== undefined ? `${metrics.winRate}%` : '--'}** | Expectancy **$${metrics.expectancy ?? '--'}**
- **Proyeksi Probabilistik Kronos (6 Bar):** Bias **${state.kronosResult?.bias ?? 'N/A'}** (${state.kronosResult?.expectedReturnPercent !== undefined ? `${state.kronosResult.expectedReturnPercent > 0 ? '+' : ''}${state.kronosResult.expectedReturnPercent}%` : '--'}) | Kuantil \`q10: ${formatP(state.kronosResult?.quantiles?.q10)} | q50: ${formatP(state.kronosResult?.quantiles?.q50)} | q90: ${formatP(state.kronosResult?.quantiles?.q90)}\`

#### 3. Risk & Execution Officer
- **Status Guardrail:** **${riskAssessment.verdict}** — ${riskAssessment.reasons.join(' • ')}
- **Ekuitas Portofolio:** **$${riskAssessment.accountEquity.toLocaleString()}** (Drawdown: **${riskAssessment.accountDrawdownPercent}%**)
- **Ukuran Posisi Dinamis (1% Risiko Ekuitas):** **${riskAssessment.recommendedLotSize} Lot** (Risiko terukur: **$${riskAssessment.riskAmountUsd.toFixed(2)}** | R:R **${enrichedPlan.riskRewardRatio}**)`
          : `### Institutional Trading Committee Verdict (${symbol}): **${riskAssessment.verdict}**

#### 1. Technical & Structure Analyst
- **Market Structure:** **${String(state.technicalAnalysis?.trend || 'NEUTRAL').toUpperCase()}** | RSI(14): **${state.technicalAnalysis?.indicators?.rsi14 ?? '--'}** | ATR(14): **${formatP(state.technicalAnalysis?.indicators?.atr14)}**
- **Key Levels:** Entry **${formatP(enrichedPlan.entry)}** (${orderLabel}) | Stop Loss **${formatP(enrichedPlan.stopLoss)}** | Target 1 **${formatP(enrichedPlan.takeProfit1)}** | Target 2 **${formatP(enrichedPlan.takeProfit2)}**

#### 2. Quant & Kronos Forecast Specialist
- **PiaScript Backtest (Synced to Chart):** Sharpe **${metrics.sharpeRatio ?? '--'}** | Sortino **${metrics.sortinoRatio ?? '--'}** | Win Rate **${metrics.winRate !== undefined ? `${metrics.winRate}%` : '--'}** | Expectancy **$${metrics.expectancy ?? '--'}**
- **Kronos 6-Bar Rollout:** Bias **${state.kronosResult?.bias ?? 'N/A'}** (${state.kronosResult?.expectedReturnPercent !== undefined ? `${state.kronosResult.expectedReturnPercent > 0 ? '+' : ''}${state.kronosResult.expectedReturnPercent}%` : '--'}) | Quantiles \`q10: ${formatP(state.kronosResult?.quantiles?.q10)} | q50: ${formatP(state.kronosResult?.quantiles?.q50)} | q90: ${formatP(state.kronosResult?.quantiles?.q90)}\`

#### 3. Risk & Execution Officer
- **Guardrail Status:** **${riskAssessment.verdict}** — ${riskAssessment.reasons.join(' • ')}
- **Portfolio Equity:** **$${riskAssessment.accountEquity.toLocaleString()}** (Drawdown: **${riskAssessment.accountDrawdownPercent}%**)
- **Dynamic Position Sizing (1% Equity Risk):** **${riskAssessment.recommendedLotSize} Lot** (Dollar Risk: **$${riskAssessment.riskAmountUsd.toFixed(2)}** | R:R **${enrichedPlan.riskRewardRatio}**)`
      }

      const combinedThought = [step1ThoughtFromSteps(accumulatedSteps)].join('\n\n')
      return {
        draftPlan: enrichedPlan,
        riskAssessment,
        finalContent,
        finalThought: combinedThought,
        steps: [step3]
      }
    })
    .addEdge(START, 'technical_analyst')
    .addEdge('technical_analyst', 'quant_forecast_specialist')
    .addEdge('quant_forecast_specialist', 'risk_execution_officer')
    .addEdge('risk_execution_officer', END)
    .compile()

  const finalState = await graph.invoke({})
  const allSteps = finalState.steps || accumulatedSteps
  const allToolCalls = allSteps.flatMap((s) => s.toolCalls || [])

  return {
    content: finalState.finalContent,
    thought: finalState.finalThought,
    steps: allSteps,
    toolCalls: allToolCalls,
    tradePlan: finalState.draftPlan,
    riskAssessment: finalState.riskAssessment!
  }
}

function step1ThoughtFromSteps(steps: AgentStepTrace[]): string {
  return steps.map((s) => `${s.title}:\n${s.thought || ''}`).join('\n\n')
}

export const useAiAgentStore = create<AiAgentState>((set, get) => ({
  config: loadInitialConfig(),
  committeeMode: false,
  analysisSnapshots: loadAnalysisSnapshots(),
  messages: [
    {
      id: 'init-msg',
      role: 'assistant',
      content:
        'PIA Quantitative Agent active. Connected to real-time market data, L2 orderbook, sentiment feeds, and charting primitives.\n\nReady for quantitative structure analysis, orderbook scans, or automated technical chart overlays.',
      timestamp: Date.now()
    }
  ],
  isBusy: false,
  statusMessage: null,
  isConfigOpen: false,
  activeAbortController: null,

  setConfigOpen: (open) => set({ isConfigOpen: open }),
  setCommitteeMode: (enabled) => set({ committeeMode: enabled }),

  updateConfig: (updates) => {
    const next = { ...get().config, ...updates }
    set({ config: next })
    if (typeof localStorage !== 'undefined') {
      try {
        const { apiKey: _apiKey, ...safeConfig } = next
        localStorage.setItem('pia_ai_agent_config', JSON.stringify(safeConfig))
      } catch {}
    }
    if (updates.apiKey !== undefined || updates.baseUrl !== undefined) {
      void saveAiProviderCredentials({ baseUrl: next.baseUrl, apiKey: next.apiKey })
    }
  },

  hydrateProviderCredentials: async () => {
    const stored = await loadAiProviderCredentials()
    if (!stored) return
    set((state) => ({ config: { ...state.config, ...stored } }))
  },

  applyPreset: (presetKey) => {
    switch (presetKey) {
      case 'openai':
        get().updateConfig({
          provider: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          temperature: 0.1
        })
        break
      case 'deepseek':
        get().updateConfig({
          provider: 'openai',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
          temperature: 0.1
        })
        break
      case 'openrouter':
        get().updateConfig({
          provider: 'openai',
          baseUrl: 'https://openrouter.ai/api/v1',
          model: 'openai/gpt-4o-mini',
          temperature: 0.1
        })
        break
      case 'groq':
        get().updateConfig({
          provider: 'openai',
          baseUrl: 'https://api.groq.com/openai/v1',
          model: 'llama-3.3-70b-versatile',
          temperature: 0.1
        })
        break
      case 'ollama':
        get().updateConfig({
          provider: 'openai',
          baseUrl: 'http://localhost:11434/v1',
          model: 'llama3.1',
          temperature: 0.1
        })
        break
    }
  },

  abortGeneration: () => {
    const { activeAbortController } = get()
    if (activeAbortController) activeAbortController.abort()
    set((state) => ({
      messages: state.messages.map((message) => message.isStreaming
        ? { ...message, isStreaming: false, content: message.content || 'Generation stopped.' }
        : message),
      isBusy: false,
      statusMessage: null,
      activeAbortController: null
    }))
  },

  clearChat: () => {
    const { activeAbortController } = get()
    if (activeAbortController) {
      activeAbortController.abort()
    }
    set({
      messages: [
        {
          id: `init-${Date.now()}`,
          role: 'assistant',
          content: 'Session cleared. Ready for quantitative analysis or chart projection instructions.',
          timestamp: Date.now()
        }
      ],
      isBusy: false,
      statusMessage: null,
      activeAbortController: null
    })
  },

  testConnection: async (overrideConfig) => {
    const cfg = { ...get().config, ...overrideConfig }
    if (!cfg.baseUrl) {
      return { success: false, error: 'Base URL is required' }
    }
    const normalizedBaseUrl = cfg.baseUrl.replace(/\/+$/, '')
    const endpoint = `${normalizedBaseUrl}/chat/completions`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (cfg.apiKey) {
      headers['Authorization'] = `Bearer ${cfg.apiKey}`
    }

    const startTime = performance.now()
    try {
      const res = await universalFetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5,
          temperature: 0.1,
          stream: false
        })
      })

      const latencyMs = Math.round(performance.now() - startTime)
      if (!res.ok) {
        const errText = await res.text()
        return { success: false, latencyMs, error: `HTTP ${res.status}: ${errText.slice(0, 150)}` }
      }
      const data = await res.json()
      if (!data.choices?.[0]) {
        return { success: false, latencyMs, error: 'No choices returned by endpoint' }
      }
      return { success: true, latencyMs }
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime)
      return { success: false, latencyMs, error: err?.message || 'Network error' }
    }
  },

  executePaperOrderFromPlan: async (plan: TradePlanData, lotSize?: number) => {
    const size = lotSize || plan.suggestedLotSize || 0.1
    const { openPosition, placeOrder } = usePaperTradingStore.getState()
    const isLimitOrStop =
      plan.orderType === 'BUY_LIMIT' ||
      plan.orderType === 'SELL_LIMIT' ||
      plan.orderType === 'BUY_STOP' ||
      plan.orderType === 'SELL_STOP'

    const finitePositive = [plan.entry, plan.stopLoss, plan.takeProfit1, size].every((value) => Number.isFinite(value) && value > 0)
    const validDirection = plan.bias === 'LONG'
      ? plan.stopLoss < plan.entry && plan.takeProfit1 > plan.entry
      : plan.bias === 'SHORT'
        ? plan.stopLoss > plan.entry && plan.takeProfit1 < plan.entry
        : false
    if (!finitePositive || !validDirection) return { success: false, error: 'Invalid trade plan levels or direction' }

    if (isLimitOrStop && plan.orderType) {
      const paperType = plan.orderType.toLowerCase() as 'buy_limit' | 'sell_limit' | 'buy_stop' | 'sell_stop'
      return await placeOrder({
        symbol: plan.symbol,
        type: paperType,
        price: plan.entry,
        size,
        stopLoss: plan.stopLoss,
        takeProfit: plan.takeProfit1,
        comment: `ORCA Alpha ${plan.orderType.replace('_', ' ')} (${plan.riskRewardRatio})`
      })
    }

    const side = plan.bias === 'LONG' ? 'buy' : 'sell'
    const livePrice = useMarketStore.getState().prices[plan.symbol]?.price
    if (plan.orderType === 'MARKET' && (!Number.isFinite(livePrice) || livePrice! <= 0)) {
      return { success: false, error: 'Live market price is unavailable; refresh the analysis before placing a market order' }
    }
    return await openPosition({
      symbol: plan.symbol,
      side,
      size,
      price: plan.orderType === 'MARKET' ? livePrice! : plan.entry,
      stopLoss: plan.stopLoss,
      takeProfit: plan.takeProfit1,
      comment: `ORCA Alpha Market (${plan.riskRewardRatio})`,
      source: 'manual'
    })
  },

  replotTradePlan: async (planOrSymbol: TradePlanData | string) => {
    try {
      if (typeof planOrSymbol === 'string') {
        await AiMcpEngine.executeFullChartAnalysis(planOrSymbol, true)
      } else {
        await AiMcpEngine.plotTradePlanLevels(planOrSymbol)
      }
      return true
    } catch {
      return false
    }
  },

  sendMessage: async (userPrompt: string, currentSymbol: string) => {
    const prompt = userPrompt.trim()
    if (!prompt) return

    // Cancel existing in-flight run
    const existingAbort = get().activeAbortController
    if (existingAbort) {
      existingAbort.abort()
    }

    const abortController = new AbortController()
    const userMsg: AiAgentMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now()
    }

    set((state) => ({
      messages: [...state.messages, userMsg],
      isBusy: true,
      statusMessage: 'Initiating telemetry...',
      activeAbortController: abortController
    }))

    const { config, messages, committeeMode } = get()
    const runCommittee = shouldRunTradingCommittee(prompt, committeeMode)

    // ==========================================
    // COMMITTEE PATH: 3-Specialist StateGraph
    // ==========================================
    if (runCommittee) {
      if (config.provider === 'openai' && !config.apiKey && !config.baseUrl.includes('localhost') && !config.baseUrl.includes('127.0.0.1')) {
        set((state) => ({
          isBusy: false,
          statusMessage: null,
          activeAbortController: null,
          messages: [
            ...state.messages,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content:
                '[Configuration Error] API Key is missing. Open Provider Settings to configure your key or switch to the Built-in Quant Engine.',
              timestamp: Date.now()
            }
          ]
        }))
        return
      }

      const asstMsgId = `asst-${Date.now()}`
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: asstMsgId,
            role: 'assistant',
            content: '',
            steps: [],
            toolCalls: [],
            isStreaming: true,
            timestamp: Date.now()
          }
        ]
      }))

      try {
        const committeeRes = await runTradingCommitteeGraph({
          prompt,
          symbol: currentSymbol,
          provider: config.provider,
          config,
          priorMessages: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          abortSignal: abortController.signal,
          onStepUpdate: (steps, statusMessage) => {
            set((state) => ({
              statusMessage,
              messages: state.messages.map((m) => (m.id === asstMsgId ? { ...m, steps } : m))
            }))
          }
        })

        const analysis = createCompactAnalysisSnapshot(
          currentSymbol,
          useMarketStore.getState().timeframe,
          committeeRes.content,
          committeeRes.steps,
          committeeRes.tradePlan
        )
        const analysisSnapshots = persistAnalysisSnapshot(analysis, get().analysisSnapshots)

        set((state) => ({
          analysisSnapshots,
          messages: state.messages.map((m) =>
            m.id === asstMsgId
              ? {
                  ...m,
                  thought: committeeRes.thought,
                  content: committeeRes.content,
                  steps: committeeRes.steps,
                  toolCalls: committeeRes.toolCalls,
                  tradePlan: committeeRes.tradePlan,
                  analysis,
                  isStreaming: false
                }
              : m
          ),
          isBusy: false,
          statusMessage: null,
          activeAbortController: null
        }))
        return
      } catch (err: any) {
        if (err?.name === 'AbortError' || abortController.signal.aborted) {
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === asstMsgId ? { ...m, isStreaming: false, content: m.content || 'Generation stopped.' } : m
            ),
            isBusy: false,
            statusMessage: null,
            activeAbortController: null
          }))
          return
        }
        set((state) => ({
          isBusy: false,
          statusMessage: null,
          activeAbortController: null,
          messages: state.messages.map((m) =>
            m.id === asstMsgId
              ? {
                  ...m,
                  isStreaming: false,
                  content: `[Committee Execution Error] ${err?.message || 'Unexpected error during multi-agent execution'}`
                }
              : m
          )
        }))
        return
      }
    }

    // ==========================================
    // PATH 1: Institutional OpenAI-Compatible LLM
    // ==========================================
    if (config.provider === 'openai') {
      if (!config.apiKey && !config.baseUrl.includes('localhost') && !config.baseUrl.includes('127.0.0.1')) {
        set((state) => ({
          isBusy: false,
          statusMessage: null,
          activeAbortController: null,
          messages: [
            ...state.messages,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content:
                '[Configuration Error] API Key is missing. Open Provider Settings to configure your key or switch to the Built-in Quant Engine.',
              timestamp: Date.now()
            }
          ]
        }))
        return
      }

      try {
        const systemPrompt = `You are ORCA Alpha Agent, an elite autonomous quantitative trading & market research agent (Claude Code / OpenCode / Hermes style) embedded inside ORCA Alpha.
Active Chart Symbol: ${currentSymbol}.

CORE MISSION & INTENT RECOGNITION:
Accurately distinguish between informational queries and tactical trade setup requests:
1. Informational, Macro, & Explanatory Queries (e.g. "kenapa emas tertekan", "what happened to CPI", "jelaskan situasi market", "bagaimana tren XAUUSD?"):
   - Provide a direct, thorough, articulate analysis explaining fundamental drivers, macro catalysts, orderbook liquidity, and technical context.
   - DO NOT force an unsolicited trade ticket, trade setup, or order recommendation when the user is simply asking an analytical or educational question.
2. Tactical Trade Setup Requests (e.g. "analisis dan berikan setup", "apakah boleh buy?", "trading plan XAUUSD", "rekomendasi entry"):
   - Recommend explicit order types (preferring BUY_LIMIT or SELL_LIMIT at key retest/supply/demand zones over market execution to avoid slippage).
   - Conclude tactical setups with structured trade parameters:
     - Bias: LONG or SHORT
     - Order Type: BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP, or MARKET
     - Entry: [clean price]
     - Stop Loss: [clean price]
     - Target 1: [clean price]
     - Target 2: [clean price]
     - Risk:Reward: [e.g. 1:2.4]
     - Suggested Lot: [e.g. 0.10 Lot]

AGENTIC PROTOCOL & MULTI-TURN REASONING LOOP:
1. Multi-Step Execution Loop:
   - You operate in an iterative tool-use loop (think -> call tool -> observe telemetry -> think -> call tool ... -> final briefing).
   - In each turn, first formulate your reasoning and intent inside <thought>...</thought> (or <think>...</think>) tags:
     * User intent & context (informational query vs tactical trade request)
     * Microstructure hypothesis (orderbook bid/ask imbalance, liquidity walls, spread)
     * Technical indicators & macro context (EMA alignment, RSI momentum/divergence, ATR volatility, news sentiment)
   - To inspect real market telemetry, run quantitative backtests, query Kronos probabilistic forecasts, or project drawings onto the active chart, call available tools ('get_market_snapshot', 'compute_technical_analysis', 'get_news_sentiment', 'get_macro_context', 'draw_trendline_on_chart', 'draw_level_on_chart', 'execute_full_chart_analysis', 'run_piascript_backtest', 'get_kronos_forecast').
   - When writing PiaScript for 'run_piascript_backtest', use only supported DSL functions: ema(src, period), sma(src, period), rsi(src, period), atr(period), macd(src, fast, slow), macd_signal(src, fast, slow, sig), bb_upper(src, period, mult), bb_lower(src, period, mult), highest(src, period), lowest(src, period), crossover(a, b), crossunder(a, b), plot(series, color="#00bcd4", title="..."), buy(1, sl=..., tp=...), sell(1, sl=..., tp=...), close(). If 'run_piascript_backtest' returns { success: false, error, supportedFunctions }, self-correct the script syntax and re-run.
   - NEVER invent or guess orderbook depth, spreads, or indicator values.
2. Step-by-Step Refinement:
   - After tool outputs are returned, evaluate the data in your next step before proceeding.
   - Synthesize a crisp, high-conviction quantitative briefing directly answering the user's specific inquiry.
3. Clean Precision & Multilingual:
   - Always format prices cleanly (e.g. 2,748.50, never raw floats like 2748.5000000001).
   - Match the user's language (Indonesian if asked in Indonesian, English if asked in English). Be natural, professional, and directly answer what was asked without unnecessary boilerplate.`

        const priorMessages = messages.slice(-8).map((message) => ({ role: message.role, content: message.content }))
        const agentMessages = [
          ...priorMessages,
          { role: 'user' as const, content: prompt }
        ]
        const piaTools = createPiaAgentTools(currentSymbol)
        const normalizedBaseUrl = config.baseUrl.trim().replace(/\/+$/, '')
        const endpoint = `${normalizedBaseUrl}/chat/completions`
        const invokeOpenAiCompatible = async (url: string, options: RequestInit): Promise<Response> => {
          const response = await universalFetch(url, { ...options, signal: abortController.signal })
          return new Response(await response.text(), { status: response.status, headers: response.headers })
        }
        const model = new ChatOpenAI({
          model: config.model,
          apiKey: config.apiKey || 'local-no-key',
          temperature: config.temperature ?? 0.1,
          maxRetries: 0,
          configuration: {
            baseURL: normalizedBaseUrl,
            fetch: invokeOpenAiCompatible as typeof globalThis.fetch
          }
        })
        const agent = createReactAgent({ llm: model, tools: piaTools, prompt: systemPrompt, version: 'v2' })

        set({ statusMessage: `Connecting to ${config.model}...` })

        const asstMsgId = `asst-${Date.now()}`
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: asstMsgId,
              role: 'assistant',
              content: '',
              steps: [],
              toolCalls: [],
              isStreaming: true,
              timestamp: Date.now()
            }
          ]
        }))

        set({ statusMessage: `Reasoning with ${config.model}...` })
        const result = await agent.invoke(
          { messages: agentMessages },
          { recursionLimit: 20, signal: abortController.signal }
        )
        if (abortController.signal.aborted) throw new DOMException('Generation stopped', 'AbortError')

        const finalAssistantMessage = [...result.messages].reverse().find((message) => message.getType() === 'ai')
        const finalRawContent = typeof finalAssistantMessage?.content === 'string'
          ? finalAssistantMessage.content
          : ''
        let finalContent = parseThinkingAndContent(finalRawContent).content.trim()
        if (!finalContent) finalContent = finalRawContent.trim()
        const userWantsTrade = hasExplicitTradeIntent(prompt)
        const resolvedPlan = extractTradePlanFromText(finalContent, currentSymbol)
        const toolCalls = result.messages.flatMap((message, messageIndex) => {
          if (!(message instanceof AIMessage)) return []
          return (message.tool_calls || []).map((call, callIndex) => ({
            id: String(call.id || `tool-${messageIndex}-${callIndex}`),
            name: call.name,
            args: call.args as Record<string, unknown>
          }))
        })
        const toolResults = new Map<string, { content: unknown; isError: boolean }>()
        for (const message of result.messages) {
          if (message instanceof ToolMessage) {
            toolResults.set(message.tool_call_id, {
              content: message.content,
              isError: Boolean(message.status === 'error')
            })
          }
        }
        const toolCallsWithResults = toolCalls.map((call) => {
          const toolResult = toolResults.get(call.id)
          let result: unknown = toolResult?.content
          if (typeof result === 'string') {
            try { result = JSON.parse(result) } catch {}
          }
          return { ...call, content: result, isError: toolResult?.isError }
        })
        const steps: AgentStepTrace[] = toolCallsWithResults.map((call, index) => ({
          step: index + 1,
          title: `Step ${index + 1}: ${call.name}`,
          toolCalls: [{
            id: call.id,
            name: call.name,
            args: call.args,
            result: call.content,
            isError: call.isError
          }],
          timestamp: Date.now()
        }))
        const analysis = createCompactAnalysisSnapshot(
          currentSymbol,
          useMarketStore.getState().timeframe,
          finalContent,
          steps,
          resolvedPlan
        )
        const analysisSnapshots = persistAnalysisSnapshot(analysis, get().analysisSnapshots)
        set((state) => ({
          analysisSnapshots,
          messages: state.messages.map((message) => message.id === asstMsgId
            ? {
                ...message,
                steps,
                toolCalls: toolCallsWithResults.map((call) => ({
                  id: call.id,
                  name: call.name,
                  args: call.args,
                  result: call.content,
                  isRunning: false,
                  isError: call.isError
                })),
                content: finalContent || 'Analysis completed.',
                tradePlan: userWantsTrade ? resolvedPlan : undefined,
                analysis,
                isStreaming: false
              }
            : message),
          isBusy: false,
          statusMessage: null,
          activeAbortController: null
        }))
        return
      } catch (err: any) {
        if (err?.name === 'AbortError' || abortController.signal.aborted) {
          set((state) => ({
            messages: state.messages.map((message) => message.isStreaming
              ? { ...message, isStreaming: false, content: message.content || 'Generation stopped.' }
              : message),
            isBusy: false,
            statusMessage: null,
            activeAbortController: null
          }))
          return
        }

        set((state) => ({
          isBusy: false,
          statusMessage: null,
          activeAbortController: null,
          messages: [
            ...state.messages,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: `[Connection Error] ${err?.message || 'Network request failed'}\nCheck your Base URL, API Key, and Model configuration.`,
              timestamp: Date.now()
            }
          ]
        }))
      }
      return
    }

    // ==========================================
    // PATH 2: Built-in Institutional Quant Engine
    // ==========================================
    try {
      const lower = prompt.toLowerCase()
      const isClear = lower.includes('clear') || lower.includes('reset') || lower.includes('remove') || lower.includes('hapus')
      const isSentimentOnly = lower.includes('sentiment') && !lower.includes('draw') && !lower.includes('chart') && !lower.includes('trendline')
      const isOrderbookOnly = (lower.includes('orderbook') || lower.includes('depth') || lower.includes('liquidity')) && !lower.includes('draw')

      if (isClear) {
        set({ statusMessage: 'Clearing technical drawings...' })
        await AiMcpEngine.clearDrawings(currentSymbol)
        set((state) => ({
          isBusy: false,
          statusMessage: null,
          activeAbortController: null,
          messages: [
            ...state.messages,
            {
              id: `asst-${Date.now()}`,
              role: 'assistant',
              content: `All technical drawings for **${currentSymbol}** have been cleared from the active chart canvas.`,
              toolCalls: [
                { id: 'tc-clear', name: 'clear_chart_drawings', args: { symbol: currentSymbol }, result: true, durationMs: 15 }
              ],
              timestamp: Date.now()
            }
          ]
        }))
        return
      }

      if (isOrderbookOnly) {
        set({ statusMessage: 'Scanning L2 orderbook & liquidity...' })
        const snap = await AiMcpEngine.getMarketSnapshot(currentSymbol)
        const ob = snap.orderbook
        const content = `### Orderbook Depth & Liquidity: ${currentSymbol}

- **Spread:** ${ob ? ob.spread : '--'}
- **Bid Volume (Aggressive Buys):** ${ob ? ob.bidVol.toLocaleString() : '--'}
- **Ask Volume (Aggressive Sells):** ${ob ? ob.askVol.toLocaleString() : '--'}
- **Imbalance Ratio:** ${ob ? ob.imbalanceRatio.toFixed(2) : '--'} (${(ob?.imbalanceRatio ?? 1) > 1.1 ? 'Net Bid Accumulation' : (ob?.imbalanceRatio ?? 1) < 0.9 ? 'Net Ask Distribution' : 'Balanced'})
- **High 24h:** ${snap.high24h ?? '--'} | **Low 24h:** ${snap.low24h ?? '--'}`

        set((state) => ({
          isBusy: false,
          statusMessage: null,
          activeAbortController: null,
          messages: [
            ...state.messages,
            {
              id: `asst-${Date.now()}`,
              role: 'assistant',
              content,
              toolCalls: [{ id: 'tc-ob', name: 'get_market_snapshot', args: { symbol: currentSymbol }, result: snap, durationMs: 25 }],
              timestamp: Date.now()
            }
          ]
        }))
        return
      }

      if (isSentimentOnly) {
        set({ statusMessage: 'Aggregating sentiment velocity...' })
        const sent = await AiMcpEngine.getNewsSentiment(currentSymbol, 8)
        const content = `### News Sentiment Velocity: ${currentSymbol}

- **Polarity Conviction:** ${sent.sentiment.toUpperCase()} (Score: ${sent.score > 0 ? '+' : ''}${sent.score}%)
- **Signals:** ${sent.bullishSignals} Bullish | ${sent.bearishSignals} Bearish
${sent.topHeadlines.length > 0 ? `\n**Top Headlines:**\n${sent.topHeadlines.map((h: string) => `- ${h}`).join('\n')}` : ''}`

        set((state) => ({
          isBusy: false,
          statusMessage: null,
          activeAbortController: null,
          messages: [
            ...state.messages,
            {
              id: `asst-${Date.now()}`,
              role: 'assistant',
              content,
              toolCalls: [{ id: 'tc-sent', name: 'get_news_sentiment', args: { symbol: currentSymbol }, result: sent, durationMs: 32 }],
              timestamp: Date.now()
            }
          ]
        }))
        return
      }

      // Default: Comprehensive Technical & Sentiment Analysis
      set({ statusMessage: 'Synthesizing market structure & agentic reasoning...' })
      const analysis = await AiMcpEngine.executeFullChartAnalysis(currentSymbol, true)
      const livePrice = useMarketStore.getState().prices[currentSymbol]?.price || analysis.currentPrice
      const { pricePrecision } = getSymbolPrecision(currentSymbol, undefined, livePrice)
      const roundP = (n: number) => Number(Math.round(Number(n + 'e' + pricePrecision)) + 'e-' + pricePrecision)
      const formatP = (n?: number) => formatCleanPrice(n, pricePrecision)

      // ponytail: Rule-based intent router ceiling for Built-in mode. Upgrade path: LLM API provider for full conversational reasoning.
      const sortedSupports = [...analysis.levels.support].sort((a, b) => b - a)
      const s1 = sortedSupports[0] ? roundP(sortedSupports[0]) : roundP(livePrice * 0.985)
      const s2 = sortedSupports[1] ? roundP(sortedSupports[1]) : roundP(s1 - analysis.indicators.atr14 * 1.5)

      const sortedResistances = [...analysis.levels.resistance].sort((a, b) => a - b)
      const r1 = sortedResistances[0] ? roundP(sortedResistances[0]) : roundP(livePrice * 1.015)
      const r2 = sortedResistances[1] ? roundP(sortedResistances[1]) : roundP(r1 + analysis.indicators.atr14 * 1.5)

      const isIndonesian =
        /(?:menurut|kamu|anda|saya|suport|support|resis|resist|resistance|supply|demand|mana|paling|kuat|lemah|kenapa|mengapa|apakah|bisa|gimana|bagaimana|naik|turun|arah|tren|trend|hari|ini|kira|sarannya|dong|lah|kah|kok|ya|nih|tuh|kan|dan|di|ke|dari|untuk|yang|ini|itu|ada|gak|nggak|enggak|tidak|mau|akan|udah|sudah|belum|lagi|sedang|terus|sekarang|posisi|beli|jual|pasang|taktis|halo|hai|tolong|masuk|ambil|order|open|jenuh|koreksi|pantulan)/i.test(
          prompt
        )

      const isSupportQuery = /(?:suport|support|demand|lantai|bawah|bottom)/i.test(prompt)
      const isResistanceQuery = /(?:resis|resist|resistance|supply|atap|pucuk|ceiling|plafon)/i.test(prompt)
      const isTrendQuery = /(?:tren|trend|arah|ke mana|kemana|naik atau turun|bullish atau bearish|outlook|prediksi)/i.test(prompt)
      const isTimingQuery = /(?:bisa buy|boleh buy|bisa sell|boleh sell|aman buy|aman sell|beli sekarang|jual sekarang|masuk sekarang|open sekarang|bagus beli|bagus jual|saatnya)/i.test(prompt)
      const isWhyQuery = /(?:kenapa|mengapa|alasannya|why|alasan)/i.test(prompt)
      const isGreeting = /^(?:halo|hai|hi|hey|hello|pagi|siang|malam|tes|test|siapa kamu|kamu siapa)\b/i.test(prompt.trim())

      const isBuyLimitIntent = /buy\s*limit|limit\s*buy|beli\s*limit|demand\s*entry/i.test(prompt)
      const isSellLimitIntent = /sell\s*limit|limit\s*sell|jual\s*limit|short\s*limit/i.test(prompt)
      const isExplicitSetupRequest =
        /rekomendasi|sinyal|signal|trade plan|setup|taktis|order limit|order apa|pasang apa|posisi apa/i.test(prompt) ||
        isBuyLimitIntent ||
        isSellLimitIntent

      let thought = ''
      let content = ''
      let tradePlanToAttach: TradePlanData | undefined = undefined

      if (isSupportQuery && !isExplicitSetupRequest) {
        thought = `1. Intent Analysis:
   • Query: "${prompt}"
   • Target: Evaluation of strongest key support levels for ${currentSymbol}
   • Spot Price: ${formatP(livePrice)}

2. Quantitative Support Clustering:
   • Support S1 (Nearest Demand): ${formatP(s1)} [Distance: ${Math.abs(livePrice - s1).toFixed(2)} pts]
   • Support S2 (Major Structural Pivot): ${formatP(s2)} [Distance: ${Math.abs(livePrice - s2).toFixed(2)} pts]
   • Dynamic Confluence: EMA20 at ${formatP(analysis.indicators.ema20)} | EMA50 at ${formatP(analysis.indicators.ema50)}
   • ATR(14) Volatility Buffer: ${formatP(analysis.indicators.atr14)}

3. Assessment:
   S2 (${formatP(s2)}) represents the strongest support level due to previous swing low clustering and historical institutional demand absorption. S1 (${formatP(s1)}) acts as the first line of defense.`

        content = isIndonesian
          ? `Menjawab pertanyaan Anda mengenai support pada **${currentSymbol}** (Harga aktif: **${formatP(livePrice)}**):

### 1. Support Terkuat / Mayor: **${formatP(s2)}**
- Merupakan **support paling kuat saat ini**, terbentuk dari klaster swing low mayor dan tumpukan likuiditas institusional.
- Jika terjadi koreksi turun, level **${formatP(s2)}** memiliki probabilitas tertinggi sebagai bantalan harga (*strong bounce zone*) dengan risiko penembusan paling rendah.

### 2. Support Terdekat (S1): **${formatP(s1)}**
- Merupakan batas demand terdekat dengan toleransi volatilitas ATR(14) (**${formatP(analysis.indicators.atr14)}**).
- Level ini bertindak sebagai garis pertahanan pertama buyer.

💡 **Kesimpulan:** Level support paling kokoh yang menjadi bantalan utama adalah **${formatP(s2)}**. Selama harga bertahan di atas **${formatP(s1)}**, momentum penurunan masih tertahan.`
          : `Answering your inquiry regarding support levels on **${currentSymbol}** (Active Price: **${formatP(livePrice)}**):

### 1. Strongest / Major Support: **${formatP(s2)}**
- This is the **strongest structural support** on the chart, backed by multi-bar swing low clusters and high institutional demand absorption.
- Offers the highest probability for a solid price bounce.

### 2. Immediate Support (S1): **${formatP(s1)}**
- The nearest demand zone aligned with ATR(14) volatility (**${formatP(analysis.indicators.atr14)}**).
- Acts as the first line of defense for active buyers.

💡 **Summary:** Support at **${formatP(s2)}** is the sturdiest cushion on this timeframe.`
      } else if (isResistanceQuery && !isExplicitSetupRequest) {
        thought = `1. Intent Analysis:
   • Query: "${prompt}"
   • Target: Evaluation of overhead resistance levels for ${currentSymbol}
   • Spot Price: ${formatP(livePrice)}

2. Quantitative Resistance Clusters:
   • Resistance R1 (Nearest Supply): ${formatP(r1)} [Distance: ${Math.abs(r1 - livePrice).toFixed(2)} pts]
   • Resistance R2 (Major Ceiling): ${formatP(r2)} [Distance: ${Math.abs(r2 - livePrice).toFixed(2)} pts]
   • Trend Momentum: RSI at ${analysis.indicators.rsi14} | EMA20 at ${formatP(analysis.indicators.ema20)}

3. Assessment:
   R2 (${formatP(r2)}) is the ultimate structural resistance ceiling.`

        content = isIndonesian
          ? `Berdasarkan kalkulasi struktur teknikal **${currentSymbol}** (Harga aktif: **${formatP(livePrice)}**):

### 1. Resistance Terkuat / Mayor: **${formatP(r2)}**
- Merupakan **plafon penolakan utama (*major supply wall*)**. Di level ini terdapat akumulasi order jual institusional dan target likuidasi take profit.

### 2. Resistance Terdekat (R1): **${formatP(r1)}**
- Area retest pertama di atas harga berjalan (berjarak ~${Math.abs(r1 - livePrice).toFixed(2)} poin).
- Level penentu apakah harga sanggup melanjutkan reli atau kembali tertolak ke bawah.

💡 **Kesimpulan:** Resistance paling tangguh berada di **${formatP(r2)}**, sementara **${formatP(r1)}** adalah target rintangan terdekat.`
          : `Technical resistance analysis for **${currentSymbol}** (Current: **${formatP(livePrice)}**):

### 1. Strongest Resistance (R2): **${formatP(r2)}**
- Primary structural supply ceiling with concentrated overhead liquidity.

### 2. Immediate Resistance (R1): **${formatP(r1)}**
- First technical retest barrier situated ~${Math.abs(r1 - livePrice).toFixed(2)} pts above current spot.

💡 **Summary:** Key supply wall sits at **${formatP(r2)}**.`
      } else if (isTrendQuery && !isExplicitSetupRequest) {
        thought = `1. Intent Analysis:
   • Query: "${prompt}"
   • Target: Market trend structure and directional bias
   • Trend: ${analysis.trend.toUpperCase()} | Price: ${formatP(livePrice)}

2. Moving Average Alignment:
   • EMA20: ${formatP(analysis.indicators.ema20)} | EMA50: ${formatP(analysis.indicators.ema50)}
   • RSI(14): ${analysis.indicators.rsi14} | News Sentiment: ${analysis.sentimentSummary.sentiment}`

        content = isIndonesian
          ? `Analisa arah dan struktur tren **${currentSymbol}** (Harga: **${formatP(livePrice)}**):

- **Arah Tren Saat Ini:** **${analysis.trend.toUpperCase()}**
- **Struktur Moving Average:** Harga bergerak ${livePrice > analysis.indicators.ema20 ? 'di atas' : 'di bawah'} EMA 20 (${formatP(analysis.indicators.ema20)}), dengan susunan EMA 20 vs EMA 50 (${formatP(analysis.indicators.ema50)}) menunjukkan bias **${analysis.trend.toUpperCase()}**.
- **Indikator Momentum:** RSI(14) berada di **${analysis.indicators.rsi14}** (${analysis.indicators.rsi14 < 32 ? 'Jenuh Jual / Oversold' : analysis.indicators.rsi14 > 68 ? 'Jenuh Beli / Overbought' : 'Zona Seimbang'}).
- **Sentimen Berita:** **${analysis.sentimentSummary.sentiment.toUpperCase()}** (${analysis.sentimentSummary.score > 0 ? '+' : ''}${analysis.sentimentSummary.score}%).

💡 **Kesimpulan:** Struktur harga saat ini mengindikasikan bias dominan **${analysis.tradePlan.bias}**. ${analysis.trend === 'bearish' ? 'Sebaiknya hindari membeli agresif sebelum ada konfirmasi pola pembalikan arah.' : 'Tren didominasi buyer, cari peluang entry pada area support.'}`
          : `Trend structure review for **${currentSymbol}** (Spot: **${formatP(livePrice)}**):

- **Dominant Trend:** **${analysis.trend.toUpperCase()}**
- **Dynamic Alignment:** Price trades ${livePrice > analysis.indicators.ema20 ? 'above' : 'below'} EMA20 (${formatP(analysis.indicators.ema20)}) with EMA50 at ${formatP(analysis.indicators.ema50)}.
- **RSI(14):** ${analysis.indicators.rsi14} (${analysis.indicators.rsi14 < 32 ? 'Oversold' : analysis.indicators.rsi14 > 68 ? 'Overbought' : 'Neutral'}).

💡 **Summary:** Structural bias favors **${analysis.tradePlan.bias}**.`
      } else if (isTimingQuery && !isExplicitSetupRequest) {
        thought = `1. Intent Analysis:
   • Query: "${prompt}"
   • Target: Entry timing safety & risk evaluation
   • RSI: ${analysis.indicators.rsi14} | Trend: ${analysis.trend.toUpperCase()}`

        content = isIndonesian
          ? `Evaluasi keamanan posisi untuk **${currentSymbol}** di harga **${formatP(livePrice)}**:

- **Kondisi Momentum RSI(14):** **${analysis.indicators.rsi14}**
${
  analysis.indicators.rsi14 < 32
    ? `⚠️ **RSI sudah sangat jenuh jual (oversold).** Mengambil posisi Sell langsung di market saat ini memiliki risiko tinggi terkena *short squeeze* atau pembalikan arah teknikal (*dead cat bounce*). Lebih bijak menunggu pullback ke resistance ${formatP(r1)} atau mencari konfirmasi buy di support ${formatP(s1)}.`
    : analysis.indicators.rsi14 > 68
    ? `⚠️ **RSI berada di area jenuh beli (overbought).** Membeli langsung di harga sekarang berisiko terjebak di pucuk (*buying the top*). Disarankan sabar menunggu koreksi harga menuju support ${formatP(s1)}.`
    : `Momentum berada dalam rentang wajar. Jika ingin membuka posisi, gunakan pending limit order dekat level kunci untuk menjaga rasio risiko tetap ideal.`
}

💡 **Saran:** Hindari *market order* terburu-buru. Gunakan **Limit Order** di area ${analysis.trend === 'bullish' ? `Support (${formatP(s1)})` : `Resistance (${formatP(r1)})`} agar stop loss terukur.`
          : `Timing & entry evaluation for **${currentSymbol}** at **${formatP(livePrice)}**:

- **RSI(14) Momentum:** **${analysis.indicators.rsi14}**
${
  analysis.indicators.rsi14 < 32
    ? `⚠️ **RSI is oversold.** Chasing market sells here carries high short-squeeze risk. Await a pullback to resistance ${formatP(r1)}.`
    : analysis.indicators.rsi14 > 68
    ? `⚠️ **RSI is overbought.** Buying directly risks entering at local highs. Wait for a pullback to support ${formatP(s1)}.`
    : `Momentum is balanced. Prioritize limit orders near key structural boundaries.`
}`
      } else if (isWhyQuery && !isExplicitSetupRequest) {
        thought = `1. Intent Analysis:
   • Query: "${prompt}"
   • Target: Strategic reasoning & indicator justification`

        content = isIndonesian
          ? `Alasan kalkulasi kuantitatif pada chart **${currentSymbol}**:

1. **Struktur MA & Price Action:** EMA 20 berada di **${formatP(analysis.indicators.ema20)}** dan EMA 50 di **${formatP(analysis.indicators.ema50)}**. Selama harga berada ${livePrice > analysis.indicators.ema20 ? 'di atas' : 'di bawah'} EMA 20, momentum dominan adalah **${analysis.trend.toUpperCase()}**.
2. **Kondisi Kejenuhan (RSI):** Nilai RSI(14) di **${analysis.indicators.rsi14}** ${analysis.indicators.rsi14 < 32 ? 'menandakan pelemahan sudah di ujung jenuh jual' : analysis.indicators.rsi14 > 68 ? 'menandakan reli sudah mendekati area jenuh beli' : 'menunjukkan pergerakan masih stabil'}.
3. **Volatilitas:** Rentang fluktuasi harian ATR(14) tercatat **${formatP(analysis.indicators.atr14)}** poin, sehingga batas toleransi stop loss harus berada di luar rentang ini agar tidak terpicu oleh *market noise*.`
          : `Quantitative rationale for **${currentSymbol}**:

1. **Moving Average Alignment:** EMA20 (${formatP(analysis.indicators.ema20)}) and EMA50 (${formatP(analysis.indicators.ema50)}) confirm ${analysis.trend.toUpperCase()} trend structure.
2. **Momentum State:** RSI(14) at ${analysis.indicators.rsi14} confirms current market extension.
3. **Volatility:** ATR(14) of ${formatP(analysis.indicators.atr14)} sets rational risk invalidation limits.`
      } else if (isGreeting && !isExplicitSetupRequest) {
        thought = `1. Intent: Friendly greeting / assistance inquiry for ${currentSymbol}`
        content = isIndonesian
          ? `Halo! Saya **ORCA Alpha**, asisten kuantitatif pasar Anda.

Saat ini kita sedang memantau instrumen **${currentSymbol}** di harga **${formatP(livePrice)}** (Tren: **${analysis.trend.toUpperCase()}**, RSI: **${analysis.indicators.rsi14}**).

Anda bisa bertanya seputar kondisi pasar saat ini, misalnya:
- *"Menurut kamu support mana paling kuat?"*
- *"Resistance terdekat di berapa?"*
- *"Apakah aman buy sekarang?"*
- *"Minta rekomendasi order taktis"*`
          : `Hello! I am **ORCA Alpha**, your institutional quantitative agent. Active symbol: **${currentSymbol}** at **${formatP(livePrice)}** (Trend: **${analysis.trend.toUpperCase()}**). How can I assist your trading analysis today?`
      } else {
        let bias: 'LONG' | 'SHORT' | 'NEUTRAL' = analysis.tradePlan.bias
        let orderType: 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP' | 'MARKET' =
          analysis.tradePlan.orderType || (bias === 'LONG' ? 'BUY_LIMIT' : 'SELL_LIMIT')
        let entry = roundP(analysis.tradePlan.suggestedEntry)
        let stopLoss = roundP(analysis.tradePlan.stopLoss)
        let takeProfit1 = roundP(analysis.tradePlan.takeProfit1)
        let takeProfit2 = roundP(analysis.tradePlan.takeProfit2)
        let rationale = analysis.tradePlan.rationale

        if (isBuyLimitIntent) {
          bias = 'LONG'
          orderType = 'BUY_LIMIT'
          entry = s1
          stopLoss = roundP(entry - analysis.indicators.atr14 * 0.85)
          takeProfit1 = r1
          takeProfit2 = roundP(takeProfit1 + (takeProfit1 - entry) * 0.618)
          rationale = isIndonesian
            ? `Order Buy Limit di area support demand ${formatP(entry)} dengan invalidasi SL di ${formatP(stopLoss)}.`
            : `Buy Limit at demand support ${formatP(entry)} with SL invalidation at ${formatP(stopLoss)}.`
        } else if (isSellLimitIntent) {
          bias = 'SHORT'
          orderType = 'SELL_LIMIT'
          entry = r1
          stopLoss = roundP(entry + analysis.indicators.atr14 * 0.85)
          takeProfit1 = s1
          takeProfit2 = roundP(takeProfit1 - (entry - takeProfit1) * 0.618)
          rationale = isIndonesian
            ? `Order Sell Limit di area resistance pullback ${formatP(entry)} untuk menghindari mengejar harga di support bawah.`
            : `Sell Limit at resistance retest zone ${formatP(entry)} to avoid chasing market at lows.`
        } else {
          if (analysis.trend === 'bearish' && analysis.indicators.rsi14 < 32) {
            bias = 'SHORT'
            orderType = 'SELL_LIMIT'
            entry = r1
            stopLoss = roundP(entry + analysis.indicators.atr14 * 0.85)
            takeProfit1 = s1
            takeProfit2 = roundP(takeProfit1 - (entry - takeProfit1) * 0.618)
            rationale = isIndonesian
              ? `RSI jenuh jual (${analysis.indicators.rsi14}). Rekomendasi Sell Limit di retest resistance ${formatP(entry)} untuk rasio R:R terbaik.`
              : `RSI oversold (${analysis.indicators.rsi14}). Recommended Sell Limit at resistance retest ${formatP(entry)}.`
          } else if (analysis.trend === 'bullish' && analysis.indicators.rsi14 > 68) {
            bias = 'LONG'
            orderType = 'BUY_LIMIT'
            entry = s1
            stopLoss = roundP(entry - analysis.indicators.atr14 * 0.85)
            takeProfit1 = r1
            takeProfit2 = roundP(takeProfit1 + (takeProfit1 - entry) * 0.618)
            rationale = isIndonesian
              ? `RSI jenuh beli (${analysis.indicators.rsi14}). Rekomendasi Buy Limit di pullback support ${formatP(entry)}.`
              : `RSI overbought (${analysis.indicators.rsi14}). Recommended Buy Limit at support pullback ${formatP(entry)}.`
          }
        }

        const risk = Math.abs(entry - stopLoss)
        const reward = Math.abs(takeProfit1 - entry)
        const riskRewardRatio = risk > 0 ? `1:${(reward / risk).toFixed(2)}` : '1:2.0'

        tradePlanToAttach = {
          symbol: currentSymbol,
          bias,
          orderType,
          entry,
          stopLoss,
          takeProfit1,
          takeProfit2,
          riskRewardRatio,
          suggestedLotSize: 0.1,
          rationale
        }

        // Replot trade plan levels on the chart canvas
        await AiMcpEngine.plotTradePlanLevels(tradePlanToAttach)

        thought = `1. Intent Analysis:
   • Query: "${prompt}"
   • Mode: Tactical Trade Setup Recommendation
   • Symbol: ${currentSymbol} spot price at ${formatP(livePrice)}

2. Quantitative Microstructure:
   • Trend: ${analysis.trend.toUpperCase()} (EMA20: ${formatP(analysis.indicators.ema20)} | EMA50: ${formatP(analysis.indicators.ema50)})
   • Momentum Velocity: RSI(14) at ${analysis.indicators.rsi14}
   • Volatility ATR(14): ${formatP(analysis.indicators.atr14)}
   • News Sentiment: ${analysis.sentimentSummary.sentiment.toUpperCase()} (${analysis.sentimentSummary.score > 0 ? '+' : ''}${analysis.sentimentSummary.score}%)

3. Execution Setup:
   • Order Type: ${orderType.replace('_', ' ')} at ${formatP(entry)}
   • Risk Calibration: Sized at 0.10 Lot | Risk:Reward ${riskRewardRatio}`

        content = isIndonesian
          ? `Berikut rekomendasi order taktis terukur untuk **${currentSymbol}** (Harga aktif: **${formatP(livePrice)}**):

### Setup Order Taktis: **${orderType.replace('_', ' ')}**
${rationale}

- **Tipe Order:** \`${orderType}\`
- **Area Entry:** **${formatP(entry)}**
- **Stop Loss (Invalidasi):** **${formatP(stopLoss)}**
- **Target Take Profit 1:** **${formatP(takeProfit1)}**
- **Target Take Profit 2:** **${formatP(takeProfit2)}**
- **Rasio Risk / Reward:** **${riskRewardRatio}**
- **Saran Ukuran Lot:** **0.10 Lot** (~1.0% model resiko modal)

*Level harga telah diproyeksikan ke canvas chart. Anda bisa langsung meninjau atau mengeksekusi order simulasi melalui tiket di bawah.*`
          : `Tactical trade plan recommendation for **${currentSymbol}** (Spot: **${formatP(livePrice)}**):

### Tactical Setup: **${orderType.replace('_', ' ')}**
${rationale}

- **Order Type:** \`${orderType}\`
- **Entry Price:** **${formatP(entry)}**
- **Stop Loss:** **${formatP(stopLoss)}**
- **Target 1:** **${formatP(takeProfit1)}**
- **Target 2:** **${formatP(takeProfit2)}**
- **Risk / Reward:** **${riskRewardRatio}**
- **Suggested Position Size:** **0.10 Lot**

*Chart levels projected onto active canvas. Click below to place order into paper account.*`
      }

      const builtinSteps: AgentStepTrace[] = [
        {
          step: 1,
          title: 'Step 1: get_news_sentiment',
          thought: `Aggregating news headlines and sentiment velocity for ${currentSymbol}...`,
          toolCalls: [
            { id: 'tc-1', name: 'get_news_sentiment', args: { symbol: currentSymbol }, result: analysis.sentimentSummary, durationMs: 28 }
          ],
          durationMs: 28,
          timestamp: Date.now()
        },
        {
          step: 2,
          title: 'Step 2: compute_technical_analysis',
          thought: `Computing multi-timeframe EMA alignment, RSI (14), and ATR volatility band...`,
          toolCalls: [
            { id: 'tc-2', name: 'compute_technical_analysis', args: { symbol: currentSymbol }, result: analysis.indicators, durationMs: 44 }
          ],
          durationMs: 44,
          timestamp: Date.now()
        },
        {
          step: 3,
          title: 'Step 3: execute_full_chart_analysis',
          thought: `Projecting dynamic support/resistance zones and drawing overlay levels on chart canvas...`,
          toolCalls: [
            { id: 'tc-3', name: 'execute_full_chart_analysis', args: { symbol: currentSymbol }, result: { plotted: analysis.plottedDrawingsCount }, durationMs: 65 }
          ],
          durationMs: 65,
          timestamp: Date.now()
        }
      ]

      set((state) => ({
        isBusy: false,
        statusMessage: null,
        activeAbortController: null,
        messages: [
          ...state.messages,
          {
            id: `asst-${Date.now()}`,
            role: 'assistant',
            thought,
            content,
            steps: builtinSteps,
            tradePlan: tradePlanToAttach,
            toolCalls: [
              { id: 'tc-1', name: 'get_news_sentiment', args: { symbol: currentSymbol }, result: analysis.sentimentSummary, durationMs: 28 },
              { id: 'tc-2', name: 'compute_technical_analysis', args: { symbol: currentSymbol }, result: analysis.indicators, durationMs: 44 },
              { id: 'tc-3', name: 'execute_full_chart_analysis', args: { symbol: currentSymbol }, result: { plotted: analysis.plottedDrawingsCount }, durationMs: 65 }
            ],
            timestamp: Date.now()
          }
        ]
      }))
    } catch (err: any) {
      set((state) => ({
        isBusy: false,
        statusMessage: null,
        activeAbortController: null,
        messages: [
          ...state.messages,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `Failed to execute quant analysis: ${err?.message || 'Insufficient candle history available.'}`,
            timestamp: Date.now()
          }
        ]
      }))
    }
  }
}))
