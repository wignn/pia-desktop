import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiAgentStore, parseLlmResponseBody } from './useAiAgentStore'

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
  })
})
