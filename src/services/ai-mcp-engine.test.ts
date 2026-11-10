import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AiMcpEngine } from './ai-mcp-engine'
import { candleEngine } from './candle-engine'
import { sharedDbService, encodeMarketRegimeVector } from './database'

describe('AiMcpEngine (AI & MCP Tool Execution)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    const listeners: Record<string, Function[]> = {}
    const mockWindow = {
      addEventListener: vi.fn((event: string, cb: Function) => {
        listeners[event] = listeners[event] || []
        listeners[event].push(cb)
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      api: {
        drawings: {
          save: vi.fn().mockResolvedValue(true),
          get: vi.fn().mockResolvedValue([]),
          delete: vi.fn().mockResolvedValue(true),
          clear: vi.fn().mockResolvedValue(true)
        },
        news: {
          get: vi.fn().mockResolvedValue([
            { id: 'news-live-1', title: 'Bitcoin surges past resistance in institutional rally', sentiment: 'bullish' },
            { id: 'news-live-2', title: 'Crypto markets breakout to new weekly highs', sentiment: 'bullish' }
          ])
        },
        social: {
          getPosts: vi.fn().mockResolvedValue([
            { content: 'Strong bid absorption on BTC', sentiment: 'bullish' }
          ])
        },
        macro: {
          getFearGreed: vi.fn().mockResolvedValue({ value: 68, sentiment: 'Greed' })
        },
        market: {
          getOrderbook: vi.fn().mockResolvedValue({
            bids: [[65000, 10.5], [64950, 8.2]],
            asks: [[65050, 5.1], [65100, 4.3]]
          })
        }
      }
    }
    ;(globalThis as any).window = mockWindow
    ;(globalThis as any).CustomEvent = class CustomEvent {
      type: string
      detail: any
      constructor(type: string, params?: { detail?: any }) {
        this.type = type
        this.detail = params?.detail
      }
    }
  })

  it('exposes complete MCP tool specifications', () => {
    const tools = AiMcpEngine.getMcpTools()
    expect(tools.length).toBeGreaterThanOrEqual(8)
    const toolNames = tools.map((t) => t.name)
    expect(toolNames).toContain('get_market_snapshot')
    expect(toolNames).toContain('get_news_sentiment')
    expect(toolNames).toContain('compute_technical_analysis')
    expect(toolNames).toContain('draw_trendline_on_chart')
    expect(toolNames).toContain('draw_level_on_chart')
    expect(toolNames).toContain('draw_zone_on_chart')
    expect(toolNames).toContain('execute_full_chart_analysis')
  })

  it('calculates news sentiment polarity correctly', async () => {
    const sentiment = await AiMcpEngine.getNewsSentiment('BTCUSDT', 5)
    expect(sentiment.sentiment).toBe('bullish')
    expect(sentiment.score).toBeGreaterThan(0)
    expect(sentiment.available).toBe(true)
    expect(sentiment.topHeadlines.length).toBeGreaterThan(0)
  })

  it('draws trendlines, levels, and zones on the chart', async () => {
    const dispatchSpy = vi.spyOn(globalThis.window, 'dispatchEvent')

    const tlSuccess = await AiMcpEngine.drawTrendline('BTCUSDT', 1700000000000, 60000, 1700050000000, 65000)
    expect(tlSuccess).toBe(true)
    expect(globalThis.window.api.drawings.save).toHaveBeenCalled()
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'pia:reload-drawings' }))

    const lvlSuccess = await AiMcpEngine.drawLevel('BTCUSDT', 64000, 'support')
    expect(lvlSuccess).toBe(true)

    const zoneSuccess = await AiMcpEngine.drawZone('BTCUSDT', 'demand', 1700000000000, 63000, 1700080000000, 62500)
    expect(zoneSuccess).toBe(true)

    const planPlotSuccess = await AiMcpEngine.plotTradePlanLevels({
      symbol: 'BTCUSDT',
      bias: 'LONG',
      entry: 64000,
      stopLoss: 63500,
      takeProfit1: 65000,
      takeProfit2: 66000
    })
    expect(planPlotSuccess).toBe(true)
    expect(globalThis.window.api.drawings.save).toHaveBeenCalled()
  })

  it('runs full quantitative technical analysis with trade plan on mock candle series', async () => {
    // Generate synthetic 60 bars
    const mockBars = []
    let basePrice = 60000
    const now = Date.now()
    for (let i = 0; i < 60; i++) {
      const open = basePrice + (i % 2 === 0 ? 100 : -50)
      const close = open + 120
      const high = close + 80
      const low = open - 60
      basePrice = close
      mockBars.push({
        timestamp: now - (60 - i) * 60000,
        open,
        high,
        low,
        close,
        volume: 50 + i
      })
    }
    vi.spyOn(candleEngine, 'getBars').mockReturnValue(mockBars as any)

    const result = await AiMcpEngine.executeFullChartAnalysis('BTCUSDT', true)
    expect(result.symbol).toBe('BTCUSDT')
    expect(result.currentPrice).toBeGreaterThan(0)
    expect(result.levels.support.length).toBeGreaterThan(0)
    expect(result.levels.resistance.length).toBeGreaterThan(0)
    expect(result.tradePlan.bias).toBeDefined()
    expect(result.tradePlan.riskRewardRatio).toBeDefined()
    expect(result.plottedDrawingsCount).toBeGreaterThan(0)
  })

  it('executes run_piascript_backtest, syncs with usePiaScriptStore (Option A), and returns compact metrics', async () => {
    const mockBars = Array.from({ length: 50 }, (_, i) => ({
      timestamp: 1700000000000 + i * 60000,
      open: 100 + Math.sin(i * 0.4) * 5,
      high: 102 + Math.sin(i * 0.4) * 5,
      low: 98 + Math.sin(i * 0.4) * 5,
      close: 100 + Math.sin(i * 0.4) * 5,
      volume: 1500
    }))
    ;(candleEngine as any).activeBars = mockBars
    ;(candleEngine as any).bars = mockBars

    const script = `fast = ema(close, 5)\nslow = ema(close, 12)\nplot(fast, color="#00bcd4", title="Fast")\nif crossover(fast, slow):\n    buy(1)\nif crossunder(fast, slow):\n    close()`
    const res = await AiMcpEngine.executeTool('run_piascript_backtest', {
      symbol: 'BTCUSDT',
      script,
      initialCapital: 25000
    })

    expect(res.success).toBe(true)
    expect(res.appliedToChart).toBe(true)
    expect(res.metrics.initialCapital).toBe(25000)
    expect(typeof res.metrics.sharpeRatio).toBe('number')
    expect(typeof res.metrics.sortinoRatio).toBe('number')
    expect(typeof res.metrics.expectancy).toBe('number')
  })

  it('returns self-correction guidance when run_piascript_backtest encounters an invalid function', async () => {
    const mockBars = Array.from({ length: 30 }, (_, i) => ({
      timestamp: 1700000000000 + i * 60000,
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100 + i,
      volume: 1000
    }))
    ;(candleEngine as any).activeBars = mockBars

    const res = await AiMcpEngine.executeTool('run_piascript_backtest', {
      symbol: 'BTCUSDT',
      script: 'bad = supertrend(close, 10)\nplot(bad)'
    })
    expect(res.success).toBe(false)
    expect(res.error).toContain('Unknown function: supertrend')
    expect(Array.isArray(res.supportedFunctions)).toBe(true)
    expect(res.supportedFunctions).toContain('ema(src, period)')
  })

  it('computes probabilistic quantile projections in get_kronos_forecast and rejects invalid horizon', async () => {
    const mockBars = Array.from({ length: 40 }, (_, i) => ({
      timestamp: 1700000000000 + i * 900000,
      open: 2000 + i * 2,
      high: 2005 + i * 2,
      low: 1995 + i * 2,
      close: 2002 + i * 2,
      volume: 500
    }))
    ;(candleEngine as any).bars = mockBars
    ;(candleEngine as any).activeBars = mockBars

    const forecast = await AiMcpEngine.executeTool('get_kronos_forecast', {
      symbol: 'XAUUSD',
      timeframe: '15m',
      horizon: 6
    })
    expect(forecast.symbol).toBe('XAUUSD')
    expect(forecast.horizon).toBe(6)
    expect(forecast.steps).toHaveLength(6)
    expect(forecast.quantiles.q10).toBeLessThanOrEqual(forecast.quantiles.q50)
    expect(forecast.quantiles.q50).toBeLessThanOrEqual(forecast.quantiles.q90)
    expect(['BULLISH', 'BEARISH', 'NEUTRAL']).toContain(forecast.bias)

    await expect(
      AiMcpEngine.executeTool('get_kronos_forecast', { symbol: 'XAUUSD', horizon: 25 })
    ).rejects.toThrow('Invalid forecast horizon')
  })

  it('fetches symbol candles when candleEngine is empty and awaits async Kronos store readiness', async () => {
    ;(candleEngine as any).activeBars = []
    ;(candleEngine as any).bars = []
    const fetchedBars = Array.from({ length: 35 }, (_, i) => ({
      timestamp: 1700000000000 + i * 900000,
      open: 3000 + i * 3,
      high: 3005 + i * 3,
      low: 2995 + i * 3,
      close: 3002 + i * 3,
      volume: 800
    }))
    ;(globalThis.window as any).api.market.getCandles = vi.fn().mockResolvedValue(fetchedBars)

    const btRes = await AiMcpEngine.executeTool('run_piascript_backtest', {
      symbol: 'ETHUSDT',
      script: 'fast = ema(close, 5)\nplot(fast)',
      initialCapital: 10000
    })
    expect((globalThis.window as any).api.market.getCandles).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'ETHUSDT' })
    )
    expect(btRes.success).toBe(true)

    // Simulate Tauri async rollout transitioning useKronosStore from computing -> ready after 25ms
    const { useKronosStore } = await import('./kronos-client')
    ;(globalThis.window as any).__TAURI_INTERNALS__ = { invoke: vi.fn() }
    useKronosStore.setState({
      identity: { symbol: 'ETHUSDT', timeframe: '15m' },
      status: 'computing',
      steps: [],
      model: 'Kronos-small'
    })
    setTimeout(() => {
      useKronosStore.setState({
        identity: { symbol: 'ETHUSDT', timeframe: '15m' },
        status: 'ready',
        originClose: 3100,
        model: 'Kronos-small',
        steps: Array.from({ length: 4 }, (_, idx) => ({
          timestamp: 1700050000000 + (idx + 1) * 900000,
          open: 3100 + idx * 5,
          high: 3110 + idx * 5,
          low: 3095 + idx * 5,
          close: 3105 + idx * 5,
          q10: 3090 + idx * 5,
          q50: 3105 + idx * 5,
          q90: 3120 + idx * 5
        }))
      })
    }, 25)

    const krRes = await AiMcpEngine.executeTool('get_kronos_forecast', {
      symbol: 'ETHUSDT',
      timeframe: '15m',
      horizon: 4
    })
    expect(krRes.model).toBe('Kronos-small')
    expect(krRes.steps).toHaveLength(4)
  })

  it('ranks similar market regimes via cosine similarity and computes historical analogue stats', async () => {
    sharedDbService.clearMarketMemoryEpisodes()

    const bullishVec = encodeMarketRegimeVector({
      price: 2750,
      rsi14: 64,
      atr14: 18,
      ema20: 2758,
      ema50: 2742,
      orderbookImbalance: 1.4,
      newsScore: 45,
      kronosExpectedReturnPercent: 0.8,
      trendDirection: 'BULLISH'
    })

    const bearishVec = encodeMarketRegimeVector({
      price: 2750,
      rsi14: 32,
      atr14: 22,
      ema20: 2730,
      ema50: 2760,
      orderbookImbalance: 0.6,
      newsScore: -50,
      kronosExpectedReturnPercent: -0.9,
      trendDirection: 'BEARISH'
    })

    sharedDbService.saveMarketMemoryEpisode({
      id: 'ep-bull-1',
      symbol: 'XAUUSD',
      timeframe: '15m',
      source: 'paper_trade',
      side: 'LONG',
      entryPrice: 2740,
      exitPrice: 2760,
      stopLoss: 2730,
      realizedPnl: 400,
      realizedR: 2.0,
      outcome: 'WIN',
      featureVector: bullishVec,
      metadata: { rsi14: 64 },
      createdAt: 1000
    })

    sharedDbService.saveMarketMemoryEpisode({
      id: 'ep-bull-2',
      symbol: 'XAUUSD',
      timeframe: '15m',
      source: 'paper_trade',
      side: 'LONG',
      entryPrice: 2745,
      exitPrice: 2762,
      stopLoss: 2735,
      realizedPnl: 340,
      realizedR: 1.7,
      outcome: 'WIN',
      featureVector: bullishVec,
      metadata: { rsi14: 62 },
      createdAt: 2000
    })

    sharedDbService.saveMarketMemoryEpisode({
      id: 'ep-bear-1',
      symbol: 'XAUUSD',
      timeframe: '15m',
      source: 'paper_trade',
      side: 'SHORT',
      entryPrice: 2750,
      exitPrice: 2765,
      stopLoss: 2765,
      realizedPnl: -300,
      realizedR: -1.0,
      outcome: 'LOSS',
      featureVector: bearishVec,
      metadata: { rsi14: 32 },
      createdAt: 3000
    })

    const mockBars = Array.from({ length: 45 }, (_, i) => ({
      timestamp: 1700000000000 + i * 900000,
      open: 2710 + i * 1.2,
      high: 2714 + i * 1.2,
      low: 2708 + i * 1.2,
      close: 2712 + i * 1.2,
      volume: 1000
    }))
    ;(candleEngine as any).activeBars = mockBars
    ;(candleEngine as any).bars = mockBars

    const res = await AiMcpEngine.executeTool('search_similar_market_regimes', {
      symbol: 'XAUUSD',
      k: 2,
      sameSymbolOnly: true
    })

    expect(res.symbol).toBe('XAUUSD')
    expect(res.matches).toHaveLength(2)
    expect(res.matches[0].id).toMatch(/ep-bull-/)
    expect(res.matches[0].similarity).toBeGreaterThan(0.5)
    expect(res.analogueStats.closedTradeCount).toBe(2)
    expect(res.analogueStats.historicalWinRate).toBe(100)
    expect(res.analogueStats.avgRealizedR).toBeCloseTo(1.85, 2)

    // Ensure OPEN committee_snapshot episodes do not crowd out closed trades in analogueStats
    for (let i = 0; i < 5; i++) {
      sharedDbService.saveMarketMemoryEpisode({
        id: `ep-open-snap-${i}`,
        symbol: 'XAUUSD',
        timeframe: '15m',
        source: 'committee_snapshot',
        side: 'LONG',
        entryPrice: 2750,
        outcome: 'OPEN',
        featureVector: bullishVec,
        metadata: { rsi14: 64 },
        createdAt: 5000 + i
      })
    }

    const resWithOpenSnaps = await AiMcpEngine.executeTool('search_similar_market_regimes', {
      symbol: 'XAUUSD',
      k: 2,
      sameSymbolOnly: true
    })
    expect(resWithOpenSnaps.analogueStats.closedTradeCount).toBe(2)
    expect(resWithOpenSnaps.analogueStats.historicalWinRate).toBe(100)
  })

  it('audits trading journal metrics and surfaces behavioral insights', async () => {
    sharedDbService.clearMarketMemoryEpisodes()

    sharedDbService.saveMarketMemoryEpisode({
      id: 'audit-1',
      symbol: 'XAUUSD',
      timeframe: '15m',
      source: 'paper_trade',
      side: 'LONG',
      entryPrice: 2750,
      exitPrice: 2735,
      realizedPnl: -150,
      realizedR: -1.0,
      outcome: 'LOSS',
      featureVector: [0.5, 0.3, 0.2, 0.1, 0.2, 0.2, 1],
      metadata: { rsi14: 74 },
      createdAt: 1000
    })

    sharedDbService.saveMarketMemoryEpisode({
      id: 'audit-2',
      symbol: 'XAUUSD',
      timeframe: '15m',
      source: 'paper_trade',
      side: 'LONG',
      entryPrice: 2760,
      exitPrice: 2740,
      realizedPnl: -200,
      realizedR: -1.2,
      outcome: 'LOSS',
      featureVector: [0.55, 0.3, 0.2, 0.1, 0.2, 0.2, 1],
      metadata: { rsi14: 76 },
      createdAt: 2000
    })

    sharedDbService.saveMarketMemoryEpisode({
      id: 'audit-3',
      symbol: 'XAUUSD',
      timeframe: '15m',
      source: 'paper_trade',
      side: 'SHORT',
      entryPrice: 2770,
      exitPrice: 2730,
      realizedPnl: 400,
      realizedR: 2.0,
      outcome: 'WIN',
      featureVector: [-0.3, 0.3, -0.2, -0.1, -0.2, -0.2, -1],
      metadata: { rsi14: 45 },
      createdAt: 3000
    })

    const audit = await AiMcpEngine.executeTool('audit_trading_journal', {
      symbol: 'XAUUSD'
    })

    expect(audit.totalClosedTrades).toBe(3)
    expect(audit.winCount).toBe(1)
    expect(audit.lossCount).toBe(2)
    expect(audit.winRate).toBeCloseTo(33.33, 1)
    expect(audit.profitFactor).toBeCloseTo(400 / 350, 2)
    expect(audit.longWinRate).toBe(0)
    expect(audit.shortWinRate).toBe(100)
    expect(Array.isArray(audit.behavioralInsights)).toBe(true)
    expect(audit.behavioralInsights.some((s: string) => s.toLowerCase().includes('rsi'))).toBe(true)
  })
})
