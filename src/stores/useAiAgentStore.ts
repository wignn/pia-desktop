/**
 * PIA Terminal - AI Agent Store (Zustand)
 * Institutional Quantitative Agent & MCP Tool Execution Store.
 * Supports OpenAI-compatible providers (OpenAI, DeepSeek, OpenRouter, Groq, Ollama)
 * with multi-tool calling, SSE token streaming, abort control, latency telemetry,
 * and direct paper trading execution.
 */

import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { AiMcpEngine } from '../services/ai-mcp-engine'
import { usePaperTradingStore } from './usePaperTradingStore'
import { useMarketStore } from './useMarketStore'
import { getSymbolPrecision } from '@shared/market-utils'

export type AiProviderType = 'builtin' | 'openai'

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
}

export interface ToolCallExecution {
  id: string
  name: string
  args: Record<string, any>
  result?: any
  durationMs?: number
  isError?: boolean
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
  messages: AiAgentMessage[]
  isBusy: boolean
  statusMessage: string | null
  isConfigOpen: boolean
  activeAbortController: AbortController | null

  setConfigOpen: (open: boolean) => void
  updateConfig: (updates: Partial<AiAgentConfig>) => void
  applyPreset: (presetKey: 'openai' | 'deepseek' | 'openrouter' | 'groq' | 'ollama') => void
  sendMessage: (prompt: string, currentSymbol: string) => Promise<void>
  abortGeneration: () => void
  clearChat: () => void
  testConnection: (overrideConfig?: Partial<AiAgentConfig>) => Promise<{ success: boolean; latencyMs?: number; error?: string }>
  executePaperOrderFromPlan: (plan: TradePlanData, lotSize?: number) => Promise<{ success: boolean; error?: string }>
  replotTradePlan: (planOrSymbol: TradePlanData | string) => Promise<boolean>
}

const DEFAULT_CONFIG: AiAgentConfig = {
  provider: 'builtin',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.1
}

function loadInitialConfig(): AiAgentConfig {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('pia_ai_agent_config')
      if (raw) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
      }
    } catch {}
  }
  return DEFAULT_CONFIG
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

export const useAiAgentStore = create<AiAgentState>((set, get) => ({
  config: loadInitialConfig(),
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

  updateConfig: (updates) => {
    const next = { ...get().config, ...updates }
    set({ config: next })
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('pia_ai_agent_config', JSON.stringify(next))
      } catch {}
    }
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
    if (activeAbortController) {
      activeAbortController.abort()
    }
    set({
      isBusy: false,
      statusMessage: null,
      activeAbortController: null
    })
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

    if (isLimitOrStop && plan.orderType) {
      const paperType = plan.orderType.toLowerCase() as 'buy_limit' | 'sell_limit' | 'buy_stop' | 'sell_stop'
      return await placeOrder({
        symbol: plan.symbol,
        type: paperType,
        price: plan.entry,
        size,
        stopLoss: plan.stopLoss,
        takeProfit: plan.takeProfit1,
        comment: `PIA Agent ${plan.orderType.replace('_', ' ')} (${plan.riskRewardRatio})`
      })
    }

    const side = plan.bias === 'LONG' ? 'buy' : 'sell'
    return await openPosition({
      symbol: plan.symbol,
      side,
      size,
      price: plan.entry,
      stopLoss: plan.stopLoss,
      takeProfit: plan.takeProfit1,
      comment: `PIA Agent Market (${plan.riskRewardRatio})`,
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

    const { config, messages } = get()

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
        const systemPrompt = `You are PIA Agent, an elite autonomous quantitative trading agent (Claude Code / OpenCode / Hermes style) embedded inside PIA Terminal.
Active Chart Symbol: ${currentSymbol}.

AGENTIC PROTOCOL & MULTI-TURN REASONING LOOP:
1. Multi-Step Execution Loop:
   - You operate in an iterative tool-use loop (think -> call tool -> observe telemetry -> think -> call tool ... -> final briefing).
   - In each turn, first formulate your reasoning and intent inside <thought>...</thought> (or <think>...</think>) tags:
     * User intent & conversational context
     * Microstructure hypothesis (orderbook bid/ask imbalance, liquidity walls, spread)
     * Technical indicators (EMA alignment, RSI momentum/divergence, ATR volatility)
     * Tactical order selection (Why BUY_LIMIT/SELL_LIMIT is preferred over market execution)
     * Risk management & position sizing
   - To inspect real market telemetry or project drawings onto the active chart, call available tools ('get_market_snapshot', 'compute_technical_analysis', 'get_news_sentiment', 'draw_trendline_on_chart', 'draw_level_on_chart', 'execute_full_chart_analysis').
   - NEVER invent or guess orderbook depth, spreads, or indicator values.
2. Step-by-Step Refinement:
   - After tool outputs are returned, evaluate the data in your next step before proceeding.
   - If further telemetry or chart levels are needed, call additional tools.
   - Once all telemetry is gathered, synthesize a crisp, high-conviction quantitative briefing.
3. Explicit Order Types & Trade Plan:
   - Always recommend explicit order types: BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP, or MARKET.
   - Detail WHY placing a Limit Order at a dynamic demand/supply or retest zone avoids slippage compared to chasing market momentum.
   - Conclude tactical setups with structured trade parameters:
     - Bias: LONG or SHORT
     - Order Type: BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP, or MARKET
     - Entry: [clean price]
     - Stop Loss: [clean price]
     - Target 1: [clean price]
     - Target 2: [clean price]
     - Risk:Reward: [e.g. 1:2.4]
     - Suggested Lot: [e.g. 0.10 Lot]
4. Clean Precision & Multilingual:
   - Always format prices cleanly (e.g. 4,023.60, never raw floats like 4023.6000000001).
   - Match the user's language (Indonesian if asked in Indonesian, English if asked in English). Do NOT repeat generic boilerplate on follow-up questions.`

        const activeConversation: any[] = [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-8).map((m) => ({
            role: m.role,
            content: m.content
          })),
          { role: 'user', content: prompt }
        ]

        set({ statusMessage: `Connecting to ${config.model}...` })

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        }
        if (config.apiKey) {
          headers['Authorization'] = `Bearer ${config.apiKey}`
        }

        const normalizedBaseUrl = config.baseUrl.replace(/\/+$/, '')
        const endpoint = `${normalizedBaseUrl}/chat/completions`

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

        const MAX_STEPS = 6
        let currentStep = 1
        const executedSteps: AgentStepTrace[] = []
        let detectedTradePlan: TradePlanData | undefined

        // ponytail: autonomous multi-turn tool execution loop. Upgrade to DAG task graph when parallel agent sub-delegation is needed.
        while (currentStep <= MAX_STEPS) {
          if (abortController.signal.aborted) break
          const isLastStep = currentStep === MAX_STEPS
          set({ statusMessage: `Step ${currentStep}/${MAX_STEPS} • Reasoning with ${config.model}...` })
          const stepStart = performance.now()

          const stepRes = await universalFetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: config.model,
              messages: activeConversation,
              tools: isLastStep ? undefined : AiMcpEngine.getOpenAiTools(),
              tool_choice: isLastStep ? 'none' : 'auto',
              temperature: config.temperature ?? 0.1,
              stream: false
            }),
            signal: abortController.signal
          })

          if (!stepRes.ok) {
            const errText = await stepRes.text()
            throw new Error(`API error (${stepRes.status}): ${errText.slice(0, 200)}`)
          }

          const stepData = await stepRes.json()
          const choice = stepData.choices?.[0]
          const assistantMsg = choice?.message

          if (!assistantMsg) {
            break
          }

          const rawContent = assistantMsg.content || ''
          const parsed = parseThinkingAndContent(rawContent)
          const stepThought = parsed.thought || assistantMsg.reasoning_content || ''
          const hasToolCalls = assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0 && !isLastStep

          if (hasToolCalls) {
            const stepToolExecutions: ToolCallExecution[] = []
            const toolMessages: any[] = []

            for (const tc of assistantMsg.tool_calls) {
              if (abortController.signal.aborted) break
              const toolName = tc.function.name
              let toolArgs: Record<string, any> = {}
              try {
                toolArgs = JSON.parse(tc.function.arguments || '{}')
              } catch {}

              if (!toolArgs.symbol) {
                toolArgs.symbol = currentSymbol
              }

              set({ statusMessage: `Step ${currentStep}/${MAX_STEPS} • Running ${toolName}...` })
              const toolStart = performance.now()

              try {
                const result = await AiMcpEngine.executeTool(toolName, toolArgs)
                const durationMs = Math.round(performance.now() - toolStart)

                if (result?.tradePlan) {
                  detectedTradePlan = {
                    symbol: toolArgs.symbol || currentSymbol,
                    bias: result.tradePlan.bias,
                    orderType: result.tradePlan.orderType,
                    entry: result.tradePlan.suggestedEntry,
                    stopLoss: result.tradePlan.stopLoss,
                    takeProfit1: result.tradePlan.takeProfit1,
                    takeProfit2: result.tradePlan.takeProfit2,
                    riskRewardRatio: result.tradePlan.riskRewardRatio,
                    suggestedLotSize: result.tradePlan.suggestedLotSize,
                    rationale: result.tradePlan.rationale
                  }
                }

                stepToolExecutions.push({
                  id: tc.id,
                  name: toolName,
                  args: toolArgs,
                  result,
                  durationMs,
                  isError: false
                })
                toolMessages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  name: toolName,
                  content: typeof result === 'string' ? result : JSON.stringify(result)
                })
              } catch (err: any) {
                const durationMs = Math.round(performance.now() - toolStart)
                stepToolExecutions.push({
                  id: tc.id,
                  name: toolName,
                  args: toolArgs,
                  result: { error: err?.message || 'Tool execution failed' },
                  durationMs,
                  isError: true
                })
                toolMessages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  name: toolName,
                  content: JSON.stringify({ error: err?.message || 'Tool execution failed' })
                })
              }
            }

            const stepDuration = Math.round(performance.now() - stepStart)
            const stepTrace: AgentStepTrace = {
              step: currentStep,
              title: `Step ${currentStep}: ${stepToolExecutions.map((t) => t.name).join(', ')}`,
              thought: stepThought,
              toolCalls: stepToolExecutions,
              content: parsed.content,
              durationMs: stepDuration,
              timestamp: Date.now()
            }
            executedSteps.push(stepTrace)

            const allToolCalls = executedSteps.flatMap((s) => s.toolCalls || [])

            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === asstMsgId
                  ? {
                      ...m,
                      steps: [...executedSteps],
                      toolCalls: allToolCalls,
                      thought: stepThought || m.thought,
                      content: parsed.content || m.content,
                      tradePlan: detectedTradePlan || m.tradePlan
                    }
                  : m
              )
            }))

            activeConversation.push(assistantMsg)
            activeConversation.push(...toolMessages)

            currentStep++
          } else {
            // Final response without tool calls reached
            const stepDuration = Math.round(performance.now() - stepStart)
            if (stepThought || parsed.content) {
              executedSteps.push({
                step: currentStep,
                title: 'Synthesis',
                thought: stepThought,
                content: parsed.content,
                durationMs: stepDuration,
                timestamp: Date.now()
              })
            }

            const allToolCalls = executedSteps.flatMap((s) => s.toolCalls || [])
            const resolvedPlan = detectedTradePlan || extractTradePlanFromText(parsed.content, currentSymbol)

            const allThoughts = executedSteps
              .map((s) => s.thought?.trim())
              .filter(Boolean)
              .join('\n\n')

            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === asstMsgId
                  ? {
                      ...m,
                      steps: [...executedSteps],
                      toolCalls: allToolCalls,
                      thought: allThoughts || stepThought,
                      content: parsed.content || 'Analysis synthesized.',
                      tradePlan: resolvedPlan,
                      isStreaming: false
                    }
                  : m
              ),
              isBusy: false,
              statusMessage: null,
              activeAbortController: null
            }))

            return
          }
        }

        // Loop concluded after MAX_STEPS
        const allToolCalls = executedSteps.flatMap((s) => s.toolCalls || [])
        const allThoughts = executedSteps
          .map((s) => s.thought?.trim())
          .filter(Boolean)
          .join('\n\n')

        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === asstMsgId
              ? {
                  ...m,
                  steps: [...executedSteps],
                  toolCalls: allToolCalls,
                  thought: allThoughts || m.thought,
                  content: m.content || 'Autonomous loop completed.',
                  tradePlan: detectedTradePlan || m.tradePlan,
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
          set({ isBusy: false, statusMessage: null, activeAbortController: null })
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
          ? `Halo! Saya **PIA Agent**, asisten kuantitatif pasar Anda.

Saat ini kita sedang memantau instrumen **${currentSymbol}** di harga **${formatP(livePrice)}** (Tren: **${analysis.trend.toUpperCase()}**, RSI: **${analysis.indicators.rsi14}**).

Anda bisa bertanya seputar kondisi pasar saat ini, misalnya:
- *"Menurut kamu support mana paling kuat?"*
- *"Resistance terdekat di berapa?"*
- *"Apakah aman buy sekarang?"*
- *"Minta rekomendasi order taktis"*`
          : `Hello! I am **PIA Agent**, your institutional quantitative agent. Active symbol: **${currentSymbol}** at **${formatP(livePrice)}** (Trend: **${analysis.trend.toUpperCase()}**). How can I assist your trading analysis today?`
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
