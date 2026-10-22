import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AiMcpEngine } from './ai-mcp-engine'
import { candleEngine } from './candle-engine'

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
            { title: 'Bitcoin surges past resistance in institutional rally', sentiment: 'bullish' },
            { title: 'Crypto markets breakout to new weekly highs', sentiment: 'bullish' }
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
})
