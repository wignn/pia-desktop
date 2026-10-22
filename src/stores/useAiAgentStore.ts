/**
 * PIA Terminal - AI Agent Store (Zustand)
 * Institutional Quantitative Copilot & MCP Tool Execution Store.
 * Supports OpenAI-compatible providers (OpenAI, DeepSeek, OpenRouter, Groq, Ollama)
 * with multi-tool calling, SSE token streaming, abort control, latency telemetry,
 * and direct paper trading execution.
 */

import { create } from 'zustand'
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

export interface AiAgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thought?: string
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
 * Parses <thought>...</thought> blocks out of raw text (Claude Code / OpenCode / Hermes style).
 */
export function parseThinkingAndContent(raw: string): { thought?: string; content: string } {
  if (!raw) return { content: '' }

  const thoughtMatch = raw.match(/<(?:thought|thinking)>([\s\S]*?)<\/(?:thought|thinking)>/i)
  if (thoughtMatch) {
    const thought = thoughtMatch[1].trim()
    const content = raw.replace(/<(?:thought|thinking)>[\s\S]*?<\/(?:thought|thinking)>/i, '').trim()
    return { thought, content }
  }

  const openMatch = raw.match(/<(?:thought|thinking)>([\s\S]*)$/i)
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

/**
 * Reads an SSE stream from an OpenAI-compatible endpoint and emits cumulative tokens.
 */
// ponytail: basic line-buffered SSE chunker. Upgrade to TransformStream when multi-channel multiplexing is needed.
async function readSseStream(
  response: Response,
  onToken: (accumulated: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const contentType = response.headers.get('content-type') || ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    onToken(content)
    return content
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let accumulated = ''
  let buffer = ''

  while (true) {
    if (signal?.aborted) {
      try {
        await reader.cancel()
      } catch {}
      break
    }

    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || !line.startsWith('data:')) continue
      const dataStr = line.replace(/^data:\s*/, '').trim()
      if (dataStr === '[DONE]') continue
      try {
        const parsed = JSON.parse(dataStr)
        const delta = parsed.choices?.[0]?.delta?.content || ''
        if (delta) {
          accumulated += delta
          onToken(accumulated)
        }
      } catch {}
    }
  }

  return accumulated
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
        'PIA Quantitative Copilot active. Connected to real-time market data, L2 orderbook, sentiment feeds, and charting primitives.\n\nReady for quantitative structure analysis, orderbook scans, or automated technical chart overlays.',
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
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5,
          temperature: 0.1
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
        comment: `AI Copilot ${plan.orderType.replace('_', ' ')} (${plan.riskRewardRatio})`
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
      comment: `AI Copilot Market (${plan.riskRewardRatio})`,
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
        const systemPrompt = `You are PIA Copilot, an elite agentic quantitative trader and market assistant (Claude Code / OpenCode / Hermes style) embedded inside PIA Terminal.
Active Chart Symbol: ${currentSymbol}.

AGENTIC PROTOCOLS:
1. Deep Chain-of-Thought: Before providing your response, formulate your step-by-step reasoning inside <thought>...</thought> tags:
   - User intent & conversational context
   - Market microstructure (orderbook bid/ask imbalance, liquidity walls, spread)
   - Technical indicators (EMA alignment, RSI momentum/divergence, ATR volatility)
   - Tactical order selection (Why BUY_LIMIT/SELL_LIMIT is preferred over market execution)
   - Risk management & position sizing
2. Conversational & Multilingual: Speak naturally, concisely, and insightfully. If the user writes in Indonesian, respond fluently in Indonesian. If in English, respond in English. Do NOT repeat a static generic template on follow-ups (e.g. "ok sekarang bagaimana"). Answer directly what they asked.
3. Explicit Order Types: Always recommend explicit order types: BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP, or MARKET. Explain WHY placing a Limit Order at a retest/demand zone avoids slippage and prevents chasing tops/bottoms.
4. Clean Precision: Never quote unrounded raw floating points (quote 82,220.00, not 82221.95999999999).
5. Tool Usage: Use available tools ('execute_full_chart_analysis', 'compute_technical_analysis', 'get_news_sentiment', 'get_market_snapshot', 'draw_trendline_on_chart', 'draw_level_on_chart') when fresh telemetry or chart drawings are needed.
6. Structured Trade Plan: Whenever you recommend a tactical setup, provide:
   - Bias: LONG or SHORT
   - Order Type: BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP, or MARKET
   - Entry: [clean price]
   - Stop Loss: [clean price]
   - Target 1: [clean price]
   - Target 2: [clean price]
   - Risk:Reward: [e.g. 1:2.4]
   - Suggested Lot: [e.g. 0.10 Lot]`

        const conversationHistory = [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-6).map((m) => ({
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

        const initialRes = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: config.model,
            messages: conversationHistory,
            tools: AiMcpEngine.getOpenAiTools(),
            tool_choice: 'auto',
            temperature: config.temperature ?? 0.1
          }),
          signal: abortController.signal
        })

        if (!initialRes.ok) {
          const errText = await initialRes.text()
          throw new Error(`API error (${initialRes.status}): ${errText.slice(0, 200)}`)
        }

        const data = await initialRes.json()
        const choice = data.choices?.[0]
        const assistantMsg = choice?.message

        if (!assistantMsg) {
          throw new Error('No response returned by provider')
        }

        let detectedTradePlan: TradePlanData | undefined

        // Process Tool Calls
        // ponytail: 1-turn tool execution loop. Upgrade to multi-turn reasoning graph when nested autonomous task delegation is needed.
        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          const executedToolCalls: ToolCallExecution[] = []
          const toolMessages: any[] = []

          for (const tc of assistantMsg.tool_calls) {
            const toolName = tc.function.name
            let toolArgs: Record<string, any> = {}
            try {
              toolArgs = JSON.parse(tc.function.arguments || '{}')
            } catch {}

            if (!toolArgs.symbol) {
              toolArgs.symbol = currentSymbol
            }

            set({ statusMessage: `Executing tool: ${toolName}...` })
            const toolStart = performance.now()

            try {
              const result = await AiMcpEngine.executeTool(toolName, toolArgs)
              const durationMs = Math.round(performance.now() - toolStart)

              if (result?.tradePlan) {
                detectedTradePlan = {
                  symbol: toolArgs.symbol || currentSymbol,
                  bias: result.tradePlan.bias,
                  entry: result.tradePlan.suggestedEntry,
                  stopLoss: result.tradePlan.stopLoss,
                  takeProfit1: result.tradePlan.takeProfit1,
                  takeProfit2: result.tradePlan.takeProfit2,
                  riskRewardRatio: result.tradePlan.riskRewardRatio,
                  rationale: result.tradePlan.rationale
                }
              }

              executedToolCalls.push({
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
                content: JSON.stringify(result)
              })
            } catch (err: any) {
              const durationMs = Math.round(performance.now() - toolStart)
              executedToolCalls.push({
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

          // Follow-up SSE Stream
          set({ statusMessage: 'Synthesizing quantitative plan...' })
          const asstMsgId = `asst-${Date.now()}`

          set((state) => ({
            statusMessage: null,
            messages: [
              ...state.messages,
              {
                id: asstMsgId,
                role: 'assistant',
                content: '',
                toolCalls: executedToolCalls,
                tradePlan: detectedTradePlan,
                isStreaming: true,
                timestamp: Date.now()
              }
            ]
          }))

          const followUpRes = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: config.model,
              messages: [
                ...conversationHistory,
                assistantMsg,
                ...toolMessages
              ],
              temperature: config.temperature ?? 0.1,
              stream: true
            }),
            signal: abortController.signal
          })

          if (followUpRes.ok) {
            const finalRaw = await readSseStream(
              followUpRes,
              (chunk) => {
                const parsed = parseThinkingAndContent(chunk)
                set((state) => ({
                  messages: state.messages.map((m) =>
                    m.id === asstMsgId
                      ? {
                          ...m,
                          thought: parsed.thought,
                          content: parsed.content
                        }
                      : m
                  )
                }))
              },
              abortController.signal
            )

            const finalParsed = parseThinkingAndContent(finalRaw)
            const resolvedPlan = detectedTradePlan || extractTradePlanFromText(finalParsed.content, currentSymbol)

            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === asstMsgId
                  ? {
                      ...m,
                      thought: finalParsed.thought,
                      content: finalParsed.content || 'Technical overlays and tactical plan executed.',
                      tradePlan: resolvedPlan,
                      isStreaming: false
                    }
                  : m
              )
            }))
          } else {
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === asstMsgId
                  ? {
                      ...m,
                      content: 'Technical analysis and chart overlays successfully executed.',
                      tradePlan: detectedTradePlan,
                      isStreaming: false
                    }
                  : m
              )
            }))
          }

          set({ isBusy: false, statusMessage: null, activeAbortController: null })
          return
        }

        // Direct response without tool calls
        const asstMsgId = `asst-${Date.now()}`
        const fullContent = assistantMsg.content || 'Instruction processed.'
        const parsedDirect = parseThinkingAndContent(fullContent)
        const resolvedPlan = detectedTradePlan || extractTradePlanFromText(parsedDirect.content, currentSymbol)

        set((state) => ({
          statusMessage: null,
          messages: [
            ...state.messages,
            {
              id: asstMsgId,
              role: 'assistant',
              thought: parsedDirect.thought,
              content: parsedDirect.content || 'Instruction processed.',
              tradePlan: resolvedPlan,
              timestamp: Date.now()
            }
          ]
        }))

        set({ isBusy: false, statusMessage: null, activeAbortController: null })
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

      // Default: Comprehensive Technical & Sentiment Analysis + Chart Auto-Draw
      set({ statusMessage: 'Synthesizing market structure & agentic reasoning...' })
      const analysis = await AiMcpEngine.executeFullChartAnalysis(currentSymbol, true)
      const livePrice = useMarketStore.getState().prices[currentSymbol]?.price || analysis.currentPrice
      const { pricePrecision } = getSymbolPrecision(currentSymbol, undefined, livePrice)
      const roundP = (n: number) => Number(Math.round(Number(n + 'e' + pricePrecision)) + 'e-' + pricePrecision)
      const formatP = (n?: number) => formatCleanPrice(n, pricePrecision)

      const isIndonesian = /bagaimana|gimana|sekarang|terus|rekomendasi|kasih|apa|posisi|beli|jual|pasang|taktis|bisa|dong|halo|tolong|masuk|ambil|order|sarannya|kira|kemana|open/i.test(prompt)
      const isBuyLimitIntent = /buy\s*limit|limit\s*buy|beli\s*limit|demand\s*entry/i.test(prompt)
      const isSellLimitIntent = /sell\s*limit|limit\s*sell|jual\s*limit|short\s*limit/i.test(prompt)
      const isConversationalFollowUp = /sekarang|gimana|bagaimana|what now|next move|terus|what should|saran|rekomendasi|posisi apa|ke mana|open apa/i.test(prompt)

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
        entry = roundP(analysis.levels.support[0] || (livePrice - analysis.indicators.atr14 * 0.8))
        stopLoss = roundP(entry - analysis.indicators.atr14 * 0.85)
        takeProfit1 = roundP(analysis.levels.resistance[0] || (livePrice + analysis.indicators.atr14 * 1.5))
        takeProfit2 = roundP(takeProfit1 + (takeProfit1 - entry) * 0.618)
        rationale = isIndonesian
          ? `Order Buy Limit di area support demand ${formatP(entry)} dengan invalidasi SL di ${formatP(stopLoss)}.`
          : `Buy Limit at demand support ${formatP(entry)} with SL invalidation at ${formatP(stopLoss)}.`
      } else if (isSellLimitIntent) {
        bias = 'SHORT'
        orderType = 'SELL_LIMIT'
        entry = roundP(analysis.levels.resistance[0] || Math.min(analysis.indicators.ema20, livePrice + analysis.indicators.atr14 * 0.8))
        stopLoss = roundP(entry + analysis.indicators.atr14 * 0.85)
        takeProfit1 = roundP(analysis.levels.support[0] || (livePrice - analysis.indicators.atr14 * 1.5))
        takeProfit2 = roundP(takeProfit1 - (entry - takeProfit1) * 0.618)
        rationale = isIndonesian
          ? `Order Sell Limit di area resistance pullback ${formatP(entry)} untuk menghindari mengejar harga di support bawah.`
          : `Sell Limit at resistance retest zone ${formatP(entry)} to avoid chasing market at lows.`
      } else if (isConversationalFollowUp) {
        if (analysis.trend === 'bearish' && analysis.indicators.rsi14 < 32) {
          bias = 'SHORT'
          orderType = 'SELL_LIMIT'
          entry = roundP(analysis.levels.resistance[0] || Math.min(analysis.indicators.ema20, livePrice + analysis.indicators.atr14 * 0.8))
          stopLoss = roundP(entry + analysis.indicators.atr14 * 0.85)
          takeProfit1 = roundP(analysis.levels.support[0] || (livePrice - analysis.indicators.atr14 * 1.5))
          takeProfit2 = roundP(takeProfit1 - (entry - takeProfit1) * 0.618)
          rationale = isIndonesian
            ? `RSI oversold (${analysis.indicators.rsi14}). Rekomendasi Sell Limit di retest resistance ${formatP(entry)} untuk R:R optimal.`
            : `RSI oversold (${analysis.indicators.rsi14}). Recommended Sell Limit at resistance retest ${formatP(entry)}.`
        } else if (analysis.trend === 'bullish' && analysis.indicators.rsi14 > 68) {
          bias = 'LONG'
          orderType = 'BUY_LIMIT'
          entry = roundP(analysis.levels.support[0] || Math.max(analysis.indicators.ema20, livePrice - analysis.indicators.atr14 * 0.8))
          stopLoss = roundP(entry - analysis.indicators.atr14 * 0.85)
          takeProfit1 = roundP(analysis.levels.resistance[0] || (livePrice + analysis.indicators.atr14 * 1.5))
          takeProfit2 = roundP(takeProfit1 + (takeProfit1 - entry) * 0.618)
          rationale = isIndonesian
            ? `RSI overbought (${analysis.indicators.rsi14}). Rekomendasi Buy Limit di pullback support ${formatP(entry)}.`
            : `RSI overbought (${analysis.indicators.rsi14}). Recommended Buy Limit at support pullback ${formatP(entry)}.`
        }
      }

      const risk = Math.abs(entry - stopLoss)
      const reward = Math.abs(takeProfit1 - entry)
      const riskRewardRatio = risk > 0 ? `1:${(reward / risk).toFixed(2)}` : '1:2.0'

      const tradePlan: TradePlanData = {
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
      await AiMcpEngine.plotTradePlanLevels(tradePlan)

      // Agentic Thought Process (Claude Code / OpenCode / Hermes style)
      const thought = `1. Intent Analysis:
   • Query: "${prompt}"
   • Language: ${isIndonesian ? 'Indonesian' : 'English'} | Mode: ${
     isConversationalFollowUp
       ? 'Conversational follow-up & tactical order advice'
       : isBuyLimitIntent
       ? 'Explicit Buy Limit recommendation'
       : isSellLimitIntent
       ? 'Explicit Sell Limit recommendation'
       : 'Quantitative chart analysis & level projection'
   }
   • Symbol: ${currentSymbol} spot price at ${formatP(livePrice)}

2. Quantitative Microstructure:
   • Structural Trend: ${analysis.trend.toUpperCase()} (EMA20: ${formatP(analysis.indicators.ema20)} | EMA50: ${formatP(analysis.indicators.ema50)})
   • Momentum Velocity: RSI(14) at ${analysis.indicators.rsi14} (${
     analysis.indicators.rsi14 < 32
       ? 'exhaustion / oversold bounce risk'
       : analysis.indicators.rsi14 > 68
       ? 'stretch / overbought pullback risk'
       : 'balanced momentum'
   })
   • Volatility Range: ATR(14) = ${formatP(analysis.indicators.atr14)}
   • Orderbook Flow: Imbalance ratio ${analysis.orderbookSummary?.imbalanceRatio?.toFixed(2) || '1.00'} (${
     (analysis.orderbookSummary?.imbalanceRatio ?? 1) > 1.1
       ? 'net bid accumulation'
       : (analysis.orderbookSummary?.imbalanceRatio ?? 1) < 0.9
       ? 'net ask distribution'
       : 'balanced orderbook'
   })
   • News Sentiment: ${analysis.sentimentSummary.sentiment.toUpperCase()} (${analysis.sentimentSummary.score > 0 ? '+' : ''}${analysis.sentimentSummary.score}%)

3. Execution Tactics:
   • Tactical Order Type: ${orderType.replace('_', ' ')} (${
     orderType === 'SELL_LIMIT'
       ? `Retest entry at ${formatP(entry)} to avoid shorting into oversold support`
       : orderType === 'BUY_LIMIT'
       ? `Demand entry at ${formatP(entry)} to capture liquidity bounce`
       : `Market execution at ${formatP(entry)}`
   })
   • Risk Calibration: Sized at 0.10 Lot (~1.0% equity risk model) | R:R ${riskRewardRatio}
   • Chart Canvas: Plotted ${analysis.plottedDrawingsCount + 4} technical overlays and key levels directly`

      let content = ''
      if (isIndonesian) {
        if (isConversationalFollowUp) {
          content = `Melihat pergerakan **${currentSymbol}** saat ini di harga **${formatP(livePrice)}**:

${
  analysis.trend === 'bearish' && analysis.indicators.rsi14 < 32
    ? `Meskipun struktur harga masih berada dalam tren **BEARISH** di bawah EMA 20 (${formatP(analysis.indicators.ema20)}), indikator RSI(14) saat ini sudah sangat jenuh jual (**${analysis.indicators.rsi14}**). Melakukan Market Sell langsung di harga sekarang memiliki risiko tinggi terkena *short squeeze* atau technical rebound.`
    : analysis.trend === 'bullish' && analysis.indicators.rsi14 > 68
    ? `Struktur harga berada dalam tren **BULLISH** di atas EMA 20 (${formatP(analysis.indicators.ema20)}), namun RSI(14) berada di area overbought (**${analysis.indicators.rsi14}**). Sebaiknya tunggu koreksi harga daripada membeli di pucuk.`
    : `Struktur pasar saat ini bergerak dengan bias **${bias}**. Harga aktif berada di **${formatP(livePrice)}** dengan rentang volatilitas ATR(14) sebesar **${formatP(analysis.indicators.atr14)}**.`
}

### Rekomendasi Taktis: **${orderType.replace('_', ' ')}**
${
  orderType === 'SELL_LIMIT'
    ? `Strategi dengan rasio risiko-imbalan terbaik adalah menempatkan **SELL LIMIT** di area resistance re-test **${formatP(entry)}**. Ini memberi harga masuk yang jauh lebih ideal saat terjadi pullback.`
    : `Strategi optimal adalah memasang **BUY LIMIT** di area demand support **${formatP(entry)}** untuk menangkap pantulan harga dengan stop loss terukur.`
}

- **Tipe Order:** \`${orderType}\`
- **Area Entry:** **${formatP(entry)}**
- **Stop Loss (Invalidasi):** **${formatP(stopLoss)}**
- **Target Take Profit 1:** **${formatP(takeProfit1)}**
- **Target Take Profit 2:** **${formatP(takeProfit2)}**
- **Risk / Reward:** **${riskRewardRatio}**
- **Saran Ukuran Lot:** **0.10 Lot** (Model resiko modal ~1.0%)

*Level taktis dan overlays telah otomatis diproyeksikan ke chart. Anda bisa langsung meninjau atau mengeksekusi order simulasi melalui tiket di bawah.*`
        } else if (isBuyLimitIntent || isSellLimitIntent) {
          content = `Berikut rencana order limit terukur untuk **${currentSymbol}** di harga **${formatP(livePrice)}**:

### Setup Taktis: **${orderType.replace('_', ' ')}**
${rationale}

- **Tipe Order:** \`${orderType}\`
- **Area Entry:** **${formatP(entry)}**
- **Stop Loss:** **${formatP(stopLoss)}**
- **Take Profit 1:** **${formatP(takeProfit1)}**
- **Take Profit 2:** **${formatP(takeProfit2)}**
- **Rasio Risk / Reward:** **${riskRewardRatio}**
- **Saran Ukuran Lot:** **0.10 Lot**

*Level harga telah diproyeksikan langsung ke canvas chart. Klik tombol pada tiket di bawah untuk menempatkan order.*`
        } else {
          content = `Analisis kuantitatif dan struktur pasar **${currentSymbol}** (Harga: **${formatP(livePrice)}**):

- **Bias Institusional:** **${bias}** (Struktur: **${analysis.trend.toUpperCase()}**)
- **Sentimen & Flow:** Sentimen berita **${analysis.sentimentSummary.sentiment.toUpperCase()}** (${analysis.sentimentSummary.score > 0 ? '+' : ''}${analysis.sentimentSummary.score}%) | Imbalance Orderbook: **${analysis.orderbookSummary?.imbalanceRatio?.toFixed(2) || '1.00'}**
- **Momentum:** RSI(14): **${analysis.indicators.rsi14}** | ATR(14): **${formatP(analysis.indicators.atr14)}** | EMA20: **${formatP(analysis.indicators.ema20)}**

### Rekomendasi Order Taktis: **${orderType.replace('_', ' ')}**
${rationale}

- **Tipe Order:** \`${orderType}\`
- **Area Entry:** **${formatP(entry)}**
- **Stop Loss:** **${formatP(stopLoss)}**
- **Target TP 1 & TP 2:** **${formatP(takeProfit1)}** / **${formatP(takeProfit2)}**
- **Risk / Reward:** **${riskRewardRatio}**

*Level teknikal dan zona supply/demand telah otomatis digambar pada chart canvas.*`
        }
      } else {
        if (isConversationalFollowUp) {
          content = `Analyzing current price action for **${currentSymbol}** trading at **${formatP(livePrice)}**:

${
  analysis.trend === 'bearish' && analysis.indicators.rsi14 < 32
    ? `While the prevailing structure is **BEARISH** below EMA 20 (${formatP(analysis.indicators.ema20)}), RSI(14) is heavily oversold (**${analysis.indicators.rsi14}**). Entering a Market Sell directly here carries high squeeze and bounce risk.`
    : analysis.trend === 'bullish' && analysis.indicators.rsi14 > 68
    ? `The trend is strongly **BULLISH** above EMA 20 (${formatP(analysis.indicators.ema20)}), but RSI(14) is stretched into overbought territory (**${analysis.indicators.rsi14}**). Avoid FOMO buying into local resistance.`
    : `The market is currently consolidating with a **${bias}** bias. Active mark price is **${formatP(livePrice)}** with ATR(14) volatility at **${formatP(analysis.indicators.atr14)}**.`
}

### Tactical Recommendation: **${orderType.replace('_', ' ')}**
${
  orderType === 'SELL_LIMIT'
    ? `The highest expectancy play is placing a **SELL LIMIT** at the resistance retest zone **${formatP(entry)}**. This yields a superior entry price on any technical pullback.`
    : `The optimal play is placing a **BUY LIMIT** at the structural demand support zone **${formatP(entry)}** to capture the liquidity bounce with tight invalidation.`
}

- **Order Type:** \`${orderType}\`
- **Entry Price:** **${formatP(entry)}**
- **Stop Loss (Invalidation):** **${formatP(stopLoss)}**
- **Target 1:** **${formatP(takeProfit1)}**
- **Target 2:** **${formatP(takeProfit2)}**
- **Risk / Reward:** **${riskRewardRatio}**
- **Suggested Position Size:** **0.10 Lot** (~1.0% equity risk model)

*Tactical price levels and chart overlays have been drawn. You can execute this simulation order directly via the trade ticket below.*`
        } else if (isBuyLimitIntent || isSellLimitIntent) {
          content = `Tactical order setup for **${currentSymbol}** at **${formatP(livePrice)}**:

### Tactical Setup: **${orderType.replace('_', ' ')}**
${rationale}

- **Order Type:** \`${orderType}\`
- **Entry Price:** **${formatP(entry)}**
- **Stop Loss:** **${formatP(stopLoss)}**
- **Target 1:** **${formatP(takeProfit1)}**
- **Target 2:** **${formatP(takeProfit2)}**
- **Risk / Reward:** **${riskRewardRatio}**
- **Suggested Lot Size:** **0.10 Lot**

*Chart levels projected onto active canvas. Click below to place order into paper account.*`
        } else {
          content = `Quantitative structure scan for **${currentSymbol}** (Spot: **${formatP(livePrice)}**):

- **Institutional Bias:** **${bias}** (Structure: **${analysis.trend.toUpperCase()}**)
- **Sentiment & Flow:** News sentiment **${analysis.sentimentSummary.sentiment.toUpperCase()}** (${analysis.sentimentSummary.score > 0 ? '+' : ''}${analysis.sentimentSummary.score}%) | Orderbook Imbalance: **${analysis.orderbookSummary?.imbalanceRatio?.toFixed(2) || '1.00'}**
- **Momentum Metrics:** RSI(14): **${analysis.indicators.rsi14}** | ATR(14): **${formatP(analysis.indicators.atr14)}** | EMA20: **${formatP(analysis.indicators.ema20)}**

### Tactical Recommendation: **${orderType.replace('_', ' ')}**
${rationale}

- **Order Type:** \`${orderType}\`
- **Entry Price:** **${formatP(entry)}**
- **Stop Loss:** **${formatP(stopLoss)}**
- **Take Profit Targets:** **${formatP(takeProfit1)}** / **${formatP(takeProfit2)}**
- **Risk / Reward:** **${riskRewardRatio}**

*Plotted ${analysis.plottedDrawingsCount} technical overlays and key levels directly to the chart canvas.*`
        }
      }

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
            tradePlan,
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
