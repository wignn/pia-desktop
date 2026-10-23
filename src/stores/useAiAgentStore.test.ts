import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useAiAgentStore,
  parseLlmResponseBody,
  parseThinkingAndContent,
  hasExplicitTradeIntent
} from './useAiAgentStore'

describe('useAiAgentStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn()
    })
    useAiAgentStore.getState().clearChat()
  })

  it('initializes with default config and built-in provider', () => {
    const config = useAiAgentStore.getState().config
    expect(config.provider).toBe('builtin')
  })

  it('updates provider presets cleanly', () => {
    const { applyPreset } = useAiAgentStore.getState()

    applyPreset('deepseek')
    let config = useAiAgentStore.getState().config
    expect(config.provider).toBe('openai')
    expect(config.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(config.model).toBe('deepseek-chat')

    applyPreset('ollama')
    config = useAiAgentStore.getState().config
    expect(config.baseUrl).toBe('http://localhost:11434/v1')
    expect(config.model).toBe('llama3.1')
  })

  it('appends user message and cleans up state on reset', () => {
    const store = useAiAgentStore.getState()
    store.clearChat()
    expect(useAiAgentStore.getState().messages).toHaveLength(1)
  })

  it('correctly parses standard JSON and SSE stream responses in parseLlmResponseBody', () => {
    // 1. JSON
    const jsonInput = JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'hello world' } }] })
    expect(parseLlmResponseBody(jsonInput).choices[0].message.content).toBe('hello world')

    // 2. SSE chunks
    const sseInput = `data: {"choices":[{"delta":{"content":"foo "}}]}\n\ndata: {"choices":[{"delta":{"content":"bar"}}]}\n\ndata: [DONE]`
    const parsedSse = parseLlmResponseBody(sseInput)
    expect(parsedSse.choices[0].message.content).toBe('foo bar')

    // 3. SSE chunks with reasoning
    const sseReasoning = `data: {"choices":[{"delta":{"reasoning_content":"thinking..."}}]}\n\ndata: {"choices":[{"delta":{"content":"result"}}]}\n\ndata: [DONE]`
    const parsedReasoning = parseLlmResponseBody(sseReasoning)
    expect(parsedReasoning.choices[0].message.content).toContain('<thought>\nthinking...\n</thought>')
    expect(parsedReasoning.choices[0].message.content).toContain('result')

    // 4. JSON with reasoning_content (DeepSeek / Gemini style)
    const jsonReasoning = JSON.stringify({
      choices: [{ message: { role: 'assistant', reasoning_content: 'Deep step reasoning', content: 'Final answer' } }]
    })
    const parsedJsonReasoning = parseLlmResponseBody(jsonReasoning)
    expect(parsedJsonReasoning.choices[0].message.content).toContain('<thought>\nDeep step reasoning\n</thought>')
    expect(parsedJsonReasoning.choices[0].message.content).toContain('Final answer')
  })

  it('parses <thought>, <thinking>, and <think> tags correctly', () => {
    // Claude / Hermes <thought>
    const res1 = parseThinkingAndContent('<thought>Step 1 reasoning</thought>Execution result')
    expect(res1.thought).toBe('Step 1 reasoning')
    expect(res1.content).toBe('Execution result')

    // DeepSeek / Qwen <think>
    const res2 = parseThinkingAndContent('<think>DeepSeek internal thinking</think>Trade recommendation')
    expect(res2.thought).toBe('DeepSeek internal thinking')
    expect(res2.content).toBe('Trade recommendation')

    // Claude alternative <thinking>
    const res3 = parseThinkingAndContent('<thinking>Multi-step plan</thinking>Done')
    expect(res3.thought).toBe('Multi-step plan')
    expect(res3.content).toBe('Done')
  })

  it('correctly discriminates explicit trade setup intent from informational queries', () => {
    // Informational queries (MUST NOT trigger trade setup intent)
    expect(hasExplicitTradeIntent('kenapa hari ini emas sangat tertekan')).toBe(false)
    expect(hasExplicitTradeIntent('mengapa btc turun drastis?')).toBe(false)
    expect(hasExplicitTradeIntent('analisis fundamental usd')).toBe(false)
    expect(hasExplicitTradeIntent('what is the market sentiment for gold today?')).toBe(false)
    expect(hasExplicitTradeIntent('jelaskan struktur pergerakan harga xauusd')).toBe(false)

    // Explicit trade setup requests (MUST trigger trade setup intent)
    expect(hasExplicitTradeIntent('buatkan trading plan untuk xauusd')).toBe(true)
    expect(hasExplicitTradeIntent('berikan setup entry untuk gold')).toBe(true)
    expect(hasExplicitTradeIntent('apakah boleh buy emas sekarang?')).toBe(true)
    expect(hasExplicitTradeIntent('kapan saatnya sell btc?')).toBe(true)
    expect(hasExplicitTradeIntent('rekomendasi order limit untuk eth')).toBe(true)
    expect(hasExplicitTradeIntent('sinyal buy atau sell hari ini')).toBe(true)
    expect(hasExplicitTradeIntent('pasang posisi buy limit')).toBe(true)
  })
})
