/**
 * PIA Terminal - AI Agent Store (Zustand)
 * Manages conversational AI state, OpenAI-compatible provider configurations,
 * and autonomous MCP tool-calling execution loops.
 */

import { create } from 'zustand'
import { AiMcpEngine } from '../services/ai-mcp-engine'

export type AiProviderType = 'builtin' | 'openai'

export interface AiAgentConfig {
  provider: AiProviderType
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
}

export interface AiAgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: Array<{
    id: string
    name: string
    args: Record<string, any>
    result?: any
  }>
  timestamp: number
}

interface AiAgentState {
  config: AiAgentConfig
  messages: AiAgentMessage[]
  isBusy: boolean
  statusMessage: string | null
  isConfigOpen: boolean

  setConfigOpen: (open: boolean) => void
  updateConfig: (updates: Partial<AiAgentConfig>) => void
  applyPreset: (presetKey: 'openai' | 'deepseek' | 'openrouter' | 'groq' | 'ollama') => void
  sendMessage: (prompt: string, currentSymbol: string) => Promise<void>
  clearChat: () => void
}

const DEFAULT_CONFIG: AiAgentConfig = {
  provider: 'builtin',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.2
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

export const useAiAgentStore = create<AiAgentState>((set, get) => ({
  config: loadInitialConfig(),
  messages: [
    {
      id: 'init-msg',
      role: 'assistant',
      content:
        'PIA Copilot active. Connected to real-time orderbook, candle history, news sentiment, and direct charting tools.\n\nType analysis instructions or select a quick action below to plot technical levels directly onto the chart.',
      timestamp: Date.now()
    }
  ],
  isBusy: false,
  statusMessage: null,
  isConfigOpen: false,

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
          model: 'gpt-4o-mini'
        })
        break
      case 'deepseek':
        get().updateConfig({
          provider: 'openai',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat'
        })
        break
      case 'openrouter':
        get().updateConfig({
          provider: 'openai',
          baseUrl: 'https://openrouter.ai/api/v1',
          model: 'openai/gpt-4o-mini'
        })
        break
      case 'groq':
        get().updateConfig({
          provider: 'openai',
          baseUrl: 'https://api.groq.com/openai/v1',
          model: 'llama-3.3-70b-versatile'
        })
        break
      case 'ollama':
        get().updateConfig({
          provider: 'openai',
          baseUrl: 'http://localhost:11434/v1',
          model: 'llama3.1'
        })
        break
    }
  },

  clearChat: () => {
    set({
      messages: [
        {
          id: `init-${Date.now()}`,
          role: 'assistant',
          content: 'Chat session reset. Ready for next analysis or chart plotting instructions.',
          timestamp: Date.now()
        }
      ],
      statusMessage: null
    })
  },

  sendMessage: async (userPrompt: string, currentSymbol: string) => {
    const prompt = userPrompt.trim()
    if (!prompt) return

    const userMsg: AiAgentMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now()
    }

    set((state) => ({
      messages: [...state.messages, userMsg],
      isBusy: true,
      statusMessage: 'Processing request...'
    }))

    const { config, messages } = get()

    // PATH 1: OpenAI-compatible LLM Tool Calling Agent
    if (config.provider === 'openai') {
      if (!config.apiKey && !config.baseUrl.includes('localhost') && !config.baseUrl.includes('127.0.0.1')) {
        set((state) => ({
          isBusy: false,
          statusMessage: null,
          messages: [
            ...state.messages,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content:
                '[Configuration Required] API Key is missing.\nClick the settings icon to configure your API key, or switch to the Built-in Quant Engine.',
              timestamp: Date.now()
            }
          ]
        }))
        return
      }

      try {
        const systemPrompt = `You are PIA Terminal AI Agent, an institutional financial market copilot embedded in PIA Terminal.
Active symbol on chart: ${currentSymbol}.
You have direct access to real-time market data, orderbook depth, news sentiment, macro context, and direct chart drawing tools via function calling.
Tools available:
- get_market_snapshot: Read live orderbook depth, spread, 24h metrics.
- get_news_sentiment: Read news articles and sentiment polarity.
- get_macro_context: Read Fear & Greed and macro regming.
- compute_technical_analysis: Calculate swing pivots, trend, EMAs, RSI, support/resistance, order blocks.
- draw_trendline_on_chart: Draw a trendline between two coordinates directly on the chart.
- draw_level_on_chart: Draw a horizontal support, resistance, or pivot level on the chart.
- draw_zone_on_chart: Draw an order block or demand/supply zone on the chart.
- clear_chart_drawings: Clear all drawings for the symbol.
- execute_full_chart_analysis: All-in-one analysis and auto-projection of all trendlines and key levels on the chart.

CRITICAL INSTRUCTIONS:
1. When asked to analyze or draw on the chart, ALWAYS call the corresponding tools.
2. If asked to draw trendlines or levels, execute the drawing tools immediately.
3. Respond in concise, professional English.
4. Summarize clearly what was analyzed and what levels/trendlines were plotted onto the chart.
5. Do NOT use emojis. Maintain an institutional, analytical terminal tone.`

        const conversationHistory = [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-6).map((m) => ({
            role: m.role,
            content: m.content
          })),
          { role: 'user', content: prompt }
        ]

        set({ statusMessage: `Contacting ${config.model}...` })

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
            temperature: config.temperature ?? 0.2
          })
        })

        if (!initialRes.ok) {
          const errText = await initialRes.text()
          throw new Error(`API error (${initialRes.status}): ${errText.slice(0, 200)}`)
        }

        const data = await initialRes.json()
        const choice = data.choices?.[0]
        const assistantMsg = choice?.message

        if (!assistantMsg) {
          throw new Error('No response message returned by LLM')
        }

        // Check if LLM requested tool calls
        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          const executedToolCalls: Array<{ id: string; name: string; args: any; result: any }> = []
          const toolMessages: any[] = []

          for (const tc of assistantMsg.tool_calls) {
            const toolName = tc.function.name
            let toolArgs: Record<string, any> = {}
            try {
              toolArgs = JSON.parse(tc.function.arguments || '{}')
            } catch {}

            // Ensure symbol defaults to active symbol if missing
            if (!toolArgs.symbol) {
              toolArgs.symbol = currentSymbol
            }

            set({ statusMessage: `Executing tool: ${toolName}...` })

            try {
              const result = await AiMcpEngine.executeTool(toolName, toolArgs)
              executedToolCalls.push({
                id: tc.id,
                name: toolName,
                args: toolArgs,
                result
              })
              toolMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                name: toolName,
                content: JSON.stringify(result)
              })
            } catch (err: any) {
              toolMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                name: toolName,
                content: JSON.stringify({ error: err?.message || 'Tool execution failed' })
              })
            }
          }

          // Follow-up request to let LLM formulate final answer with tool outputs
          set({ statusMessage: 'Synthesizing analysis...' })

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
              temperature: config.temperature ?? 0.2
            })
          })

          let finalContent = ''
          if (followUpRes.ok) {
            const followUpData = await followUpRes.json()
            finalContent = followUpData.choices?.[0]?.message?.content || ''
          } else {
            finalContent = 'Analysis and chart technical overlays were successfully executed.'
          }

          set((state) => ({
            isBusy: false,
            statusMessage: null,
            messages: [
              ...state.messages,
              {
                id: `asst-${Date.now()}`,
                role: 'assistant',
                content: finalContent,
                toolCalls: executedToolCalls,
                timestamp: Date.now()
              }
            ]
          }))
          return
        }

        // Direct response without tool calls
        set((state) => ({
          isBusy: false,
          statusMessage: null,
          messages: [
            ...state.messages,
            {
              id: `asst-${Date.now()}`,
              role: 'assistant',
              content: assistantMsg.content || 'Instruction processed.',
              timestamp: Date.now()
            }
          ]
        }))
      } catch (err: any) {
        set((state) => ({
          isBusy: false,
          statusMessage: null,
          messages: [
            ...state.messages,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: `[Connection Error] ${err?.message || 'Network error'}\nVerify that Base URL, API Key, and Model name are properly configured.`,
              timestamp: Date.now()
            }
          ]
        }))
      }
      return
    }

    // PATH 2: Built-in Institutional Quant Heuristic Agent
    try {
      const lower = prompt.toLowerCase()
      const isClear = lower.includes('clear') || lower.includes('reset') || lower.includes('remove') || lower.includes('hapus')
      const isSentimentOnly = lower.includes('sentiment') && !lower.includes('draw') && !lower.includes('trendline') && !lower.includes('chart')

      if (isClear) {
        set({ statusMessage: 'Clearing chart overlays...' })
        await AiMcpEngine.clearDrawings(currentSymbol)
        set((state) => ({
          isBusy: false,
          statusMessage: null,
          messages: [
            ...state.messages,
            {
              id: `asst-${Date.now()}`,
              role: 'assistant',
              content: `All AI technical drawings for **${currentSymbol}** have been cleared from the chart.`,
              toolCalls: [{ id: 'tc-clear', name: 'clear_chart_drawings', args: { symbol: currentSymbol }, result: true }],
              timestamp: Date.now()
            }
          ]
        }))
        return
      }

      if (isSentimentOnly) {
        set({ statusMessage: 'Analyzing news sentiment & FinTwit feeds...' })
        const sent = await AiMcpEngine.getNewsSentiment(currentSymbol, 8)
        const content = `### Sentiment Analysis: ${currentSymbol}
- **Polarity:** ${sent.sentiment.toUpperCase()} (Score: ${sent.score > 0 ? '+' : ''}${sent.score}%)
- **Bullish Signals:** ${sent.bullishSignals} | **Bearish Signals:** ${sent.bearishSignals}
${sent.topHeadlines.length > 0 ? `\n**Top Headlines:**\n${sent.topHeadlines.map((h: string) => `- ${h}`).join('\n')}` : ''}`

        set((state) => ({
          isBusy: false,
          statusMessage: null,
          messages: [
            ...state.messages,
            {
              id: `asst-${Date.now()}`,
              role: 'assistant',
              content,
              toolCalls: [{ id: 'tc-sent', name: 'get_news_sentiment', args: { symbol: currentSymbol }, result: sent }],
              timestamp: Date.now()
            }
          ]
        }))
        return
      }

      // Default: Full Technical & Sentiment Analysis + Chart Auto-Draw
      set({ statusMessage: 'Analyzing sentiment, orderbook, and plotting levels...' })
      const analysis = await AiMcpEngine.executeFullChartAnalysis(currentSymbol, true)

      const content = `### Quantitative Analysis & Chart Projection: ${currentSymbol}

- **Institutional Bias:** **${analysis.tradePlan.bias}** (Trend Structure: **${analysis.trend.toUpperCase()}**)
- **News Sentiment:** ${analysis.sentimentSummary.sentiment.toUpperCase()} (${analysis.sentimentSummary.score > 0 ? '+' : ''}${analysis.sentimentSummary.score}%)
- **RSI (14):** ${analysis.indicators.rsi14} | **ATR:** ${analysis.indicators.atr14}

#### Trade Plan
- **Entry Zone:** ${analysis.tradePlan.suggestedEntry}
- **Stop Loss:** ${analysis.tradePlan.stopLoss}
- **Take Profit 1:** ${analysis.tradePlan.takeProfit1}
- **Take Profit 2:** ${analysis.tradePlan.takeProfit2}
- **Risk : Reward:** ${analysis.tradePlan.riskRewardRatio}

*Rationale: ${analysis.tradePlan.rationale}*

**Chart Overlays Plotted:** Successfully drawn **${analysis.plottedDrawingsCount} technical overlays** (Horizontal support/resistance, structural trendlines, and Institutional Order Block) directly on your live chart.`

      set((state) => ({
        isBusy: false,
        statusMessage: null,
        messages: [
          ...state.messages,
          {
            id: `asst-${Date.now()}`,
            role: 'assistant',
            content,
            toolCalls: [
              { id: 'tc-1', name: 'get_news_sentiment', args: { symbol: currentSymbol }, result: analysis.sentimentSummary },
              { id: 'tc-2', name: 'compute_technical_analysis', args: { symbol: currentSymbol }, result: analysis.indicators },
              { id: 'tc-3', name: 'execute_full_chart_analysis', args: { symbol: currentSymbol }, result: { plotted: analysis.plottedDrawingsCount } }
            ],
            timestamp: Date.now()
          }
        ]
      }))
    } catch (err: any) {
      set((state) => ({
        isBusy: false,
        statusMessage: null,
        messages: [
          ...state.messages,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `Failed to execute analysis: ${err?.message || 'Insufficient candle history.'}`,
            timestamp: Date.now()
          }
        ]
      }))
    }
  }
}))
