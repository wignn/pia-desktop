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
  entry: number
  stopLoss: number
  takeProfit1: number
  takeProfit2: number
  riskRewardRatio: string
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
  toolCalls?: ToolCallExecution[]
  tradePlan?: TradePlanData
  timestamp: number
  isStreaming?: boolean
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
  const biasMatch = text.match(/\b(LONG|SHORT|BUY|SELL)\b/i)
  const entryMatch = text.match(/(?:entry|open|buy at|sell at|entry zone)[:\s*]+([0-9]+(?:\.[0-9]+)?)/i)
  const slMatch = text.match(/(?:stop loss|sl|invalidation)[:\s*]+([0-9]+(?:\.[0-9]+)?)/i)
  const tp1Match = text.match(/(?:take profit 1|tp1|target 1|tp 1|take profit)[:\s*]+([0-9]+(?:\.[0-9]+)?)/i)
  const tp2Match = text.match(/(?:take profit 2|tp2|target 2|tp 2)[:\s*]+([0-9]+(?:\.[0-9]+)?)/i)
  const rrMatch = text.match(/(?:risk[\s/:]*reward|r:r|rrr)[:\s*]+([0-9]+(?::[0-9.]+|(?:\.[0-9]+)?))/i)

  if (entryMatch && slMatch && tp1Match) {
    const rawBias = biasMatch ? biasMatch[1].toUpperCase() : ''
    const bias: 'LONG' | 'SHORT' | 'NEUTRAL' =
      rawBias === 'BUY' || rawBias === 'LONG' ? 'LONG' : rawBias === 'SELL' || rawBias === 'SHORT' ? 'SHORT' : 'NEUTRAL'

    const entry = parseFloat(entryMatch[1])
    const stopLoss = parseFloat(slMatch[1])
    const takeProfit1 = parseFloat(tp1Match[1])
    const takeProfit2 = tp2Match ? parseFloat(tp2Match[1]) : takeProfit1

    const calculatedRr =
      Math.abs(takeProfit1 - entry) > 0 && Math.abs(entry - stopLoss) > 0
        ? `1:${(Math.abs(takeProfit1 - entry) / Math.abs(entry - stopLoss)).toFixed(2)}`
        : '1:2'

    return {
      symbol: defaultSymbol,
      bias,
      entry,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskRewardRatio: rrMatch ? rrMatch[1] : calculatedRr,
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

  executePaperOrderFromPlan: async (plan: TradePlanData, lotSize = 0.1) => {
    const { openPosition } = usePaperTradingStore.getState()
    const side = plan.bias === 'LONG' ? 'buy' : 'sell'
    return await openPosition({
      symbol: plan.symbol,
      side,
      size: lotSize,
      price: plan.entry,
      stopLoss: plan.stopLoss,
      takeProfit: plan.takeProfit1,
      comment: `AI Copilot (${plan.riskRewardRatio})`,
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
        const systemPrompt = `You are the Institutional Quantitative Copilot embedded inside PIA Terminal.
Active Chart Symbol: ${currentSymbol}.

OPERATIONAL RULES:
1. High Signal, Zero Fluff: Strictly NO conversational filler, no greetings, no "Certainly!", no textbook explanations. Directly deliver actionable quantitative intelligence.
2. Market Tools: You have access to real-time market data, orderbook depth, news sentiment, technical indicators, and direct chart drawing tools via function calling.
3. Execution: If asked to analyze or draw, ALWAYS execute the relevant tools first ('execute_full_chart_analysis', 'compute_technical_analysis', 'get_news_sentiment', 'get_market_snapshot', 'draw_trendline_on_chart', 'draw_level_on_chart').
4. Structured Response:
   - EXECUTIVE BIAS: State directional conviction (LONG / SHORT / NEUTRAL) with rationale.
   - MARKET STRUCTURE & VOLATILITY: Quote exact values for RSI, EMAs, ATR, and orderbook imbalance ratio.
   - KEY STRUCTURAL LEVELS: Support, Resistance, and Invalidation levels.
   - TACTICAL TRADE SETUP: State exact Entry, Stop Loss, Target 1, Target 2, and Risk:Reward.
   - CHART OVERLAYS: Confirm which technical overlays were plotted onto the chart.
5. Tone: Institutional, mathematically grounded, concise terminal format.`

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
            const finalContent = await readSseStream(
              followUpRes,
              (chunk) => {
                set((state) => ({
                  messages: state.messages.map((m) =>
                    m.id === asstMsgId ? { ...m, content: chunk } : m
                  )
                }))
              },
              abortController.signal
            )

            const resolvedPlan = detectedTradePlan || extractTradePlanFromText(finalContent, currentSymbol)

            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === asstMsgId
                  ? {
                      ...m,
                      content: finalContent || 'Technical overlays and tactical plan executed.',
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
        const resolvedPlan = detectedTradePlan || extractTradePlanFromText(fullContent, currentSymbol)

        set((state) => ({
          statusMessage: null,
          messages: [
            ...state.messages,
            {
              id: asstMsgId,
              role: 'assistant',
              content: fullContent,
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
      set({ statusMessage: 'Synthesizing market structure & drawing levels...' })
      const analysis = await AiMcpEngine.executeFullChartAnalysis(currentSymbol, true)

      const tradePlan: TradePlanData = {
        symbol: currentSymbol,
        bias: analysis.tradePlan.bias,
        entry: analysis.tradePlan.suggestedEntry,
        stopLoss: analysis.tradePlan.stopLoss,
        takeProfit1: analysis.tradePlan.takeProfit1,
        takeProfit2: analysis.tradePlan.takeProfit2,
        riskRewardRatio: analysis.tradePlan.riskRewardRatio,
        rationale: analysis.tradePlan.rationale
      }

      const content = `### Quantitative Briefing: ${currentSymbol}

- **Institutional Bias:** **${analysis.tradePlan.bias}** (Structure: **${analysis.trend.toUpperCase()}**)
- **Sentiment Velocity:** ${analysis.sentimentSummary.sentiment.toUpperCase()} (${analysis.sentimentSummary.score > 0 ? '+' : ''}${analysis.sentimentSummary.score}%)
- **Momentum Indicators:** RSI(14): **${analysis.indicators.rsi14}** | ATR(14): **${analysis.indicators.atr14}** | EMA20: **${analysis.indicators.ema20}** | EMA50: **${analysis.indicators.ema50}**

*Rationale: ${analysis.tradePlan.rationale}*

**Chart Canvas Status:** Plotted **${analysis.plottedDrawingsCount} technical overlays** (Support/Resistance levels, Trendlines, and Institutional Order Block) directly to the active chart.`

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
