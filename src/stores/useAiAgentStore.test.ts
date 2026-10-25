import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useAiAgentStore,
  parseLlmResponseBody,
  parseThinkingAndContent,
  hasExplicitTradeIntent,
  createCompactAnalysisSnapshot,
  loadAnalysisSnapshots,
  persistAnalysisSnapshot,
  type CompactAnalysisSnapshot
} from './useAiAgentStore'

describe('useAiAgentStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn()
    })
    useAiAgentStore.getState().clearChat()
  })

  it('bounds and validates compact analysis history without dropping older same-symbol snapshots', () => {
    const snapshots: CompactAnalysisSnapshot[] = Array.from({ length: 21 }, (_, index) => ({
      id: `analysis-${index}`,
      symbol: index === 20 ? 'XAUUSD' : 'EURUSD',
      timeframe: '1h',
      capturedAt: index + 1,
      summary: `Summary ${index}`,
      evidence: { price: 2000 + index },
      unavailable: [],
      tools: []
    }))

    const retained = persistAnalysisSnapshot(snapshots[20], snapshots.slice(0, 20))
    expect(retained).toHaveLength(20)
    expect(retained.some((item) => item.id === 'analysis-0')).toBe(true)
    expect(retained.some((item) => item.id === 'analysis-20')).toBe(true)

    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify([
      snapshots[0],
      { ...snapshots[1], evidence: { price: { unexpected: true } } },
      { ...snapshots[2], tools: [{ name: 'bad', status: 'running' }] }
    ]))
    expect(loadAnalysisSnapshots()).toEqual([snapshots[0]])

    vi.mocked(localStorage.getItem).mockReturnValue('x'.repeat(50_001))
    expect(loadAnalysisSnapshots()).toEqual([])
  })

  it('does not fabricate missing market evidence in compact analysis snapshots', () => {
    const snapshot = createCompactAnalysisSnapshot('XAUUSD', '15m', 'Review', [{
      step: 1,
      timestamp: Date.now(),
      toolCalls: [{ id: '1', name: 'get_market_snapshot', args: {}, result: { price: null } }]
    }])
    expect(snapshot.evidence).toEqual({})
    expect(snapshot.unavailable).toContain('price')
    expect(snapshot.unavailable).toContain('RSI')
    expect(snapshot.unavailable).toContain('ATR')
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
