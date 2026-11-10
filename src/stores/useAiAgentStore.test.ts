import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useAiAgentStore,
  parseLlmResponseBody,
  parseThinkingAndContent,
  hasExplicitTradeIntent,
  shouldRunTradingCommittee,
  computeCommitteeRiskAssessment,
  runTradingCommitteeGraph,
  createCompactAnalysisSnapshot,
  loadAnalysisSnapshots,
  persistAnalysisSnapshot,
  type CompactAnalysisSnapshot
} from './useAiAgentStore'
import { usePaperTradingStore } from './usePaperTradingStore'
import { AiMcpEngine } from '../services/ai-mcp-engine'
import { sharedDbService } from '../services/database'
import { AnalysisSnapshotCard } from '../components/panels/AnalysisSnapshotCard'

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

  it('keeps provider API keys out of localStorage config', () => {
    useAiAgentStore.getState().updateConfig({ provider: 'openai', apiKey: 'private-test-key' })
    const savedConfig = vi.mocked(localStorage.setItem).mock.calls
      .find(([key]) => key === 'pia_ai_agent_config')?.[1]
    expect(savedConfig).toBeTruthy()
    expect(savedConfig).not.toContain('private-test-key')
    expect(JSON.parse(savedConfig || '{}')).not.toHaveProperty('apiKey')
    useAiAgentStore.getState().updateConfig({ apiKey: '' })
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

  it('records sharpeRatio, winRate, and kronosBias in createCompactAnalysisSnapshot from quant tools', () => {
    const snapshot = createCompactAnalysisSnapshot('BTCUSDT', '15m', 'Quant & Forecast pass', [
      {
        step: 1,
        timestamp: Date.now(),
        toolCalls: [
          {
            id: 'bt-1',
            name: 'run_piascript_backtest',
            args: { symbol: 'BTCUSDT' },
            result: {
              success: true,
              metrics: {
                sharpeRatio: 2.15,
                winRate: 64.5,
                profitFactor: 2.3
              }
            }
          },
          {
            id: 'kr-1',
            name: 'get_kronos_forecast',
            args: { symbol: 'BTCUSDT', horizon: 6 },
            result: {
              symbol: 'BTCUSDT',
              bias: 'BULLISH',
              expectedReturnPercent: 1.42
            }
          }
        ]
      }
    ])
    expect(snapshot.evidence.sharpeRatio).toBe(2.15)
    expect(snapshot.evidence.winRate).toBe(64.5)
    expect(snapshot.evidence.kronosBias).toBe('BULLISH')
  })

  it('routes fast-path utility commands vs 3-agent committee requests in shouldRunTradingCommittee', () => {
    expect(shouldRunTradingCommittee('clear chart drawings', false)).toBe(false)
    expect(shouldRunTradingCommittee('hapus semua garis di chart', true)).toBe(false)

    expect(shouldRunTradingCommittee('cek orderbook depth sekarang', false)).toBe(false)
    expect(shouldRunTradingCommittee('halo selamat pagi', false)).toBe(false)
    expect(shouldRunTradingCommittee('bagaimana kondisi market hari ini?', false)).toBe(false)
    expect(shouldRunTradingCommittee('bagaimana kondisi market hari ini?', true)).toBe(true)

    expect(shouldRunTradingCommittee('buatkan trading plan untuk XAUUSD', false)).toBe(true)
    expect(shouldRunTradingCommittee('jalankan backtest piascript dan prediksi kronos', false)).toBe(true)
    expect(shouldRunTradingCommittee('analisis komite lengkap untuk BTCUSDT', false)).toBe(true)
  })

  it('computes 1% equity position sizing, cent multiplier, zero-stop safety, and verdict guardrails in computeCommitteeRiskAssessment', () => {
    usePaperTradingStore.setState({
      accountType: 'standard',
      account: {
        balance: 10000,
        initialBalance: 10000,
        currency: 'USD',
        positions: [],
        updatedAt: Date.now(),
        accountType: 'standard'
      }
    })

    const approved = computeCommitteeRiskAssessment({
      symbol: 'XAUUSD',
      bias: 'LONG',
      entry: 2000,
      stopLoss: 1980,
      takeProfit1: 2040,
      sharpeRatio: 1.85,
      winRate: 62,
      kronosBias: 'BULLISH'
    })
    expect(approved.verdict).toBe('APPROVED')
    expect(approved.recommendedLotSize).toBe(4.5)
    expect(approved.rewardRiskRatio).toBeCloseTo(2.0, 2)

    usePaperTradingStore.setState({
      accountType: 'cent',
      account: {
        balance: 10000,
        initialBalance: 10000,
        currency: 'USC',
        positions: [],
        updatedAt: Date.now(),
        accountType: 'cent'
      }
    })
    const centRisk = computeCommitteeRiskAssessment({
      symbol: 'XAUUSD',
      bias: 'LONG',
      entry: 2000,
      stopLoss: 1980,
      takeProfit1: 2040
    })
    expect(centRisk.recommendedLotSize).toBe(0.04)

    const zeroStop = computeCommitteeRiskAssessment({
      symbol: 'XAUUSD',
      bias: 'LONG',
      entry: 2000,
      stopLoss: 2000,
      takeProfit1: 2040
    })
    expect(Number.isFinite(zeroStop.recommendedLotSize)).toBe(true)
    expect(zeroStop.recommendedLotSize).toBe(0.01)
    expect(zeroStop.rewardRiskRatio).toBe(0)

    usePaperTradingStore.setState({
      accountType: 'standard',
      account: {
        balance: 100000,
        initialBalance: 100000,
        currency: 'USD',
        positions: [],
        updatedAt: Date.now(),
        accountType: 'standard'
      }
    })
    const caution = computeCommitteeRiskAssessment({
      symbol: 'BTCUSDT',
      bias: 'LONG',
      entry: 60000,
      stopLoss: 59000,
      takeProfit1: 62000,
      sharpeRatio: -0.4,
      kronosBias: 'BEARISH'
    })
    expect(caution.verdict).toBe('CAUTION')
    expect(caution.reasons.length).toBeGreaterThanOrEqual(2)

    usePaperTradingStore.setState({
      accountType: 'standard',
      account: {
        balance: 82000,
        initialBalance: 100000,
        currency: 'USD',
        positions: [],
        updatedAt: Date.now(),
        accountType: 'standard'
      }
    })
    const vetoed = computeCommitteeRiskAssessment({
      symbol: 'BTCUSDT',
      bias: 'LONG',
      entry: 60000,
      stopLoss: 59000,
      takeProfit1: 60500
    })
    expect(vetoed.verdict).toBe('VETOED')
  })

  it('executes the 3-node LangGraph StateGraph in runTradingCommitteeGraph and enriches TradePlanData + snapshot', async () => {
    usePaperTradingStore.setState({
      accountType: 'standard',
      account: {
        balance: 50000,
        initialBalance: 50000,
        currency: 'USD',
        positions: [],
        updatedAt: Date.now(),
        accountType: 'standard'
      }
    })

    vi.spyOn(AiMcpEngine, 'executeFullChartAnalysis').mockResolvedValue({
      symbol: 'XAUUSD',
      timeframe: '15m',
      currentPrice: 2750,
      trend: 'BULLISH',
      indicators: { ema20: 2745, ema50: 2730, rsi14: 58.4, atr14: 8.5 },
      levels: { support: [2740, 2725], resistance: [2768, 2785] },
      zones: { demand: [], supply: [] },
      sentiment: { sentiment: 'bullish', score: 45, bullishSignals: 4, bearishSignals: 1, topHeadlines: [], available: true },
      orderbook: { bidVol: 120, askVol: 80, imbalanceRatio: 1.5, spread: 0.25 },
      tradePlan: {
        symbol: 'XAUUSD',
        bias: 'LONG',
        entry: 2740,
        stopLoss: 2725,
        takeProfit1: 2770,
        takeProfit2: 2785,
        riskRewardRatio: '1:2.00'
      },
      plottedDrawingsCount: 5
    } as any)

    vi.spyOn(AiMcpEngine, 'getMarketSnapshot').mockResolvedValue({
      symbol: 'XAUUSD',
      price: 2750,
      change24h: 1.2,
      volume24h: 145000,
      orderbook: { bidVol: 120, askVol: 80, imbalanceRatio: 1.5, spread: 0.25 }
    } as any)

    vi.spyOn(AiMcpEngine, 'getNewsSentiment').mockResolvedValue({
      symbol: 'XAUUSD',
      sentiment: 'bullish',
      score: 48,
      bullishSignals: 5,
      bearishSignals: 1,
      topHeadlines: ['Gold steady ahead of macro release'],
      available: true
    } as any)

    vi.spyOn(AiMcpEngine, 'executeTool').mockImplementation(async (name: string) => {
      if (name === 'run_piascript_backtest') {
        return {
          success: true,
          appliedToChart: true,
          metrics: {
            sharpeRatio: 1.92,
            sortinoRatio: 2.45,
            expectancy: 85.4,
            winRate: 62.5,
            profitFactor: 2.1,
            totalTrades: 8,
            maxDrawdownPercent: 3.2
          }
        }
      }
      if (name === 'get_kronos_forecast') {
        return {
          symbol: 'XAUUSD',
          timeframe: '15m',
          horizon: 6,
          model: 'Kronos-base',
          bias: 'BULLISH',
          expectedReturnPercent: 0.65,
          quantiles: { q10: 2738, q50: 2768, q90: 2782 },
          steps: []
        }
      }
      return {}
    })

    const stepUpdates: string[] = []
    const res = await runTradingCommitteeGraph({
      prompt: 'buatkan trading plan untuk XAUUSD',
      symbol: 'XAUUSD',
      provider: 'builtin',
      config: useAiAgentStore.getState().config,
      onStepUpdate: (_steps, status) => {
        stepUpdates.push(status)
      }
    })

    expect(res.steps).toHaveLength(3)
    expect(res.steps[0].title).toContain('[1/3] Technical & Structure Analyst')
    expect(res.steps[1].title).toContain('[2/3] Quant & Kronos Forecast Specialist')
    expect(res.steps[2].title).toContain('[3/3] Risk & Execution Officer')
    expect(stepUpdates.length).toBeGreaterThanOrEqual(3)

    expect(res.tradePlan).toBeDefined()
    expect(res.tradePlan?.committeeVerdict).toBe('APPROVED')
    expect(res.tradePlan?.suggestedLotSize).toBeGreaterThan(0)
    expect(res.tradePlan?.riskAmountUsd).toBeGreaterThan(0)

    const snapshot = createCompactAnalysisSnapshot('XAUUSD', '15m', res.content, res.steps, res.tradePlan)
    expect(snapshot.evidence.committeeVerdict).toBe('APPROVED')
    expect(snapshot.evidence.recommendedLotSize).toBe(res.tradePlan?.suggestedLotSize)
    expect(snapshot.evidence.sharpeRatio).toBe(1.92)
    expect(snapshot.evidence.kronosBias).toBe('BULLISH')
    expect(snapshot.evidence.newsScore).toBe(48)
    expect(snapshot.unavailable).not.toContain('news sentiment')
  })

  it('survives partial tool failures in Node 2 and still completes Node 3 risk assessment', async () => {
    vi.spyOn(AiMcpEngine, 'executeFullChartAnalysis').mockResolvedValue({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      currentPrice: 65000,
      trend: 'BULLISH',
      indicators: { ema20: 64800, ema50: 64200, rsi14: 55, atr14: 450 },
      levels: { support: [64200, 63500], resistance: [66000, 67200] },
      zones: { demand: [], supply: [] },
      sentiment: { sentiment: 'neutral', score: 0, bullishSignals: 1, bearishSignals: 1, topHeadlines: [], available: true },
      orderbook: { bidVol: 50, askVol: 45, imbalanceRatio: 1.11, spread: 1.0 },
      tradePlan: {
        symbol: 'BTCUSDT',
        bias: 'LONG',
        entry: 64200,
        stopLoss: 63500,
        takeProfit1: 66000,
        takeProfit2: 67200,
        riskRewardRatio: '1:2.57'
      },
      plottedDrawingsCount: 4
    } as any)

    vi.spyOn(AiMcpEngine, 'getMarketSnapshot').mockResolvedValue({
      symbol: 'BTCUSDT',
      price: 65000,
      change24h: 0.8,
      volume24h: 500000
    } as any)

    vi.spyOn(AiMcpEngine, 'executeTool').mockImplementation(async (name: string) => {
      if (name === 'run_piascript_backtest') {
        throw new Error('Backtest engine busy')
      }
      if (name === 'get_kronos_forecast') {
        throw new Error('Kronos sidecar unavailable')
      }
      return {}
    })

    const res = await runTradingCommitteeGraph({
      prompt: 'analisis komite lengkap BTCUSDT',
      symbol: 'BTCUSDT',
      provider: 'builtin',
      config: useAiAgentStore.getState().config
    })

    expect(res.steps).toHaveLength(3)
    expect(res.steps[1].toolCalls?.some((tc) => tc.isError)).toBe(true)
    expect(res.riskAssessment.verdict).toBeDefined()
    expect(res.content.length).toBeGreaterThan(20)
  })

  it('renders Sharpe, Win rate, Kronos, Verdict, and Lot (1% Risk) in AnalysisSnapshotCard', () => {
    const html = renderToStaticMarkup(
      React.createElement(AnalysisSnapshotCard, {
        snapshot: {
          id: 'snap-committee-1',
          symbol: 'XAUUSD',
          timeframe: '15m',
          capturedAt: Date.now(),
          bias: 'LONG',
          summary: 'Committee APPROVED',
          evidence: {
            price: 2750,
            rsi14: 58.4,
            atr14: 8.5,
            sharpeRatio: 1.92,
            winRate: 62.5,
            kronosBias: 'BULLISH',
            committeeVerdict: 'APPROVED',
            recommendedLotSize: 0.35
          },
          unavailable: [],
          tools: []
        }
      })
    )

    expect(html).toContain('Sharpe:')
    expect(html).toContain('1.92')
    expect(html).toContain('Win rate:')
    expect(html).toContain('62.5%')
    expect(html).toContain('Kronos:')
    expect(html).toContain('BULLISH')
    expect(html).toContain('Verdict:')
    expect(html).toContain('APPROVED')
    expect(html).toContain('Lot (1% Risk):')
    expect(html).toContain('0.35')
  })

  it('auto-records closed paper trades into Market Memory with finite realizedR even when stopLoss is undefined', async () => {
    sharedDbService.clearMarketMemoryEpisodes()
    ;(globalThis as any).window = {
      ...(globalThis as any).window,
      api: {
        ...((globalThis as any).window?.api || {}),
        paper: {
          saveAccount: vi.fn().mockResolvedValue(true)
        }
      }
    }

    usePaperTradingStore.setState({
      accountType: 'standard',
      account: {
        balance: 98000,
        initialBalance: 100000,
        currency: 'USD',
        positions: [
          {
            id: 'pos-win-1',
            symbol: 'XAUUSD',
            side: 'buy',
            entryPrice: 2000,
            size: 1.0,
            timestamp: 1000,
            stopLoss: 1980,
            takeProfit: 2040,
            accountType: 'standard'
          },
          {
            id: 'pos-no-sl-1',
            symbol: 'BTCUSDT',
            side: 'sell',
            entryPrice: 60000,
            size: 0.1,
            timestamp: 2000,
            accountType: 'standard'
          }
        ],
        updatedAt: Date.now(),
        accountType: 'standard'
      }
    })

    const closed1 = await usePaperTradingStore.getState().closePosition('pos-win-1', 2030)
    expect(closed1).toBe(true)

    const closed2 = await usePaperTradingStore.getState().closePosition('pos-no-sl-1', 60600)
    expect(closed2).toBe(true)

    const episodes = sharedDbService.getMarketMemoryEpisodes()
    expect(episodes).toHaveLength(2)

    const xauEp = episodes.find((e) => e.symbol === 'XAUUSD')!
    expect(xauEp).toBeDefined()
    expect(xauEp.source).toBe('paper_trade')
    expect(xauEp.outcome).toBe('WIN')
    expect(xauEp.realizedPnl).toBe(30)
    expect(xauEp.realizedR).toBeCloseTo(1.5, 2)
    expect(xauEp.featureVector).toHaveLength(7)
    expect(typeof xauEp.metadata.rsi14).toBe('number')

    const btcEp = episodes.find((e) => e.symbol === 'BTCUSDT')!
    expect(btcEp).toBeDefined()
    expect(btcEp.outcome).toBe('LOSS')
    expect(btcEp.realizedPnl).toBe(-60)
    expect(Number.isFinite(btcEp.realizedR)).toBe(true)
    expect(btcEp.realizedR).toBeCloseTo(-1.0, 2)
    // Closing BTCUSDT while active chart is XAUUSD must NOT mix XAUUSD bar prices into BTCUSDT emaSpreadNorm
    expect(Math.abs(btcEp.featureVector[2])).toBeLessThan(0.95)
  })

  it('enforces historical RAG win-rate guardrails in computeCommitteeRiskAssessment and renders Hist. Win Rate in AnalysisSnapshotCard', () => {
    usePaperTradingStore.setState({
      accountType: 'standard',
      account: {
        balance: 100000,
        initialBalance: 100000,
        currency: 'USD',
        positions: [],
        updatedAt: Date.now(),
        accountType: 'standard'
      }
    })

    // Cold-start (< 3 closed trades) MUST NOT penalize verdict with CAUTION
    const coldStart = computeCommitteeRiskAssessment({
      symbol: 'XAUUSD',
      bias: 'LONG',
      entry: 2700,
      stopLoss: 2680,
      takeProfit1: 2740,
      historicalWinRate: 0,
      historicalSampleCount: 2
    })
    expect(coldStart.verdict).toBe('APPROVED')

    // >= 3 similar closed trades with < 35% win rate MUST trigger CAUTION
    const lowHistorical = computeCommitteeRiskAssessment({
      symbol: 'XAUUSD',
      bias: 'LONG',
      entry: 2700,
      stopLoss: 2680,
      takeProfit1: 2740,
      historicalWinRate: 25,
      historicalSampleCount: 4
    })
    expect(lowHistorical.verdict).toBe('CAUTION')
    expect(lowHistorical.reasons.some((r) => r.includes('Historical Memory RAG'))).toBe(true)

    // >= 3 similar closed trades with >= 60% win rate remains APPROVED and includes positive RAG confirmation
    const strongHistorical = computeCommitteeRiskAssessment({
      symbol: 'XAUUSD',
      bias: 'LONG',
      entry: 2700,
      stopLoss: 2680,
      takeProfit1: 2740,
      historicalWinRate: 75,
      historicalSampleCount: 4
    })
    expect(strongHistorical.verdict).toBe('APPROVED')
    expect(strongHistorical.reasons.some((r) => r.includes('75%'))).toBe(true)

    const html = renderToStaticMarkup(
      React.createElement(AnalysisSnapshotCard, {
        snapshot: {
          id: 'snap-rag-1',
          symbol: 'XAUUSD',
          timeframe: '15m',
          capturedAt: Date.now(),
          bias: 'LONG',
          summary: 'RAG test',
          evidence: {
            price: 2750,
            historicalWinRate: 75
          },
          unavailable: [],
          tools: []
        }
      })
    )
    expect(html).toContain('Hist. Win Rate:')
    expect(html).toContain('75%')
  })
})
