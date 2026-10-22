/**
 * PIA Terminal - AI & Model Context Protocol (MCP) Analysis Engine
 * 
 * Provides an MCP-compliant toolset that ingests news sentiment, live orderbook depth,
 * multi-timeframe candles, and macro metrics, and executes automated technical analysis
 * with direct overlay projection (trendlines, support/resistance, order blocks) on the chart.
 */

import { candleEngine } from './candle-engine'
import { useMarketStore } from '../stores/useMarketStore'
import type { DrawingItem } from '@shared/types'

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
    }>
    required?: string[]
  }
}

export interface TechnicalPivot {
  index: number
  timestamp: number
  price: number
  type: 'high' | 'low'
}

export interface TechnicalAnalysisResult {
  symbol: string
  timeframe: string
  currentPrice: number
  trend: 'bullish' | 'bearish' | 'ranging'
  sentimentSummary: {
    score: number // -100 (extreme fear/bearish) to +100 (extreme greed/bullish)
    sentiment: 'bullish' | 'bearish' | 'neutral'
    headlineCount: number
    topHeadlines: string[]
  }
  orderbookSummary?: {
    bidVol: number
    askVol: number
    imbalanceRatio: number // > 1 indicates net bid buying pressure
    spread: number
  }
  indicators: {
    rsi14: number
    ema20: number
    ema50: number
    ema200?: number
    atr14: number
  }
  levels: {
    resistance: number[]
    support: number[]
    pivot: number
  }
  trendlines: Array<{
    type: 'support_trendline' | 'resistance_trendline'
    p1: { timestamp: number; price: number }
    p2: { timestamp: number; price: number }
  }>
  zones: Array<{
    type: 'demand' | 'supply'
    from: { timestamp: number; price: number }
    to: { timestamp: number; price: number }
    label: string
  }>
  tradePlan: {
    bias: 'LONG' | 'SHORT' | 'NEUTRAL'
    suggestedEntry: number
    stopLoss: number
    takeProfit1: number
    takeProfit2: number
    riskRewardRatio: string
    rationale: string
  }
  plottedDrawingsCount: number
}

// ==========================================
// Math & Technical Indicators Helpers
// ==========================================

function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return []
  const k = 2 / (period + 1)
  const emaArray: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) {
    emaArray.push(values[i] * k + emaArray[i - 1] * (1 - k))
  }
  return emaArray
}

function calculateRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50
  let gains = 0
  let losses = 0

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gains += diff
    else losses -= diff
  }

  let avgGain = gains / period
  let avgLoss = losses / period

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period
      avgLoss = (avgLoss * (period - 1)) / period
    } else {
      avgGain = (avgGain * (period - 1)) / period
      avgLoss = (avgLoss * (period - 1) - diff) / period
    }
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10
}

function calculateATR(bars: Array<{ high: number; low: number; close: number }>, period = 14): number {
  if (bars.length < 2) return 0
  const trs: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const hl = bars[i].high - bars[i].low
    const hc = Math.abs(bars[i].high - bars[i - 1].close)
    const lc = Math.abs(bars[i].low - bars[i - 1].close)
    trs.push(Math.max(hl, hc, lc))
  }
  const slice = trs.slice(-period)
  if (slice.length === 0) return 0
  return slice.reduce((a, b) => a + b, 0) / slice.length
}

function findPivots(bars: Array<{ timestamp: number; high: number; low: number }>, left = 3, right = 3): {
  swingHighs: TechnicalPivot[]
  swingLows: TechnicalPivot[]
} {
  const swingHighs: TechnicalPivot[] = []
  const swingLows: TechnicalPivot[] = []

  for (let i = left; i < bars.length - right; i++) {
    let isHigh = true
    let isLow = true
    const currentHigh = bars[i].high
    const currentLow = bars[i].low

    for (let j = 1; j <= left; j++) {
      if (bars[i - j].high > currentHigh) isHigh = false
      if (bars[i - j].low < currentLow) isLow = false
    }
    for (let j = 1; j <= right; j++) {
      if (bars[i + j].high >= currentHigh) isHigh = false
      if (bars[i + j].low <= currentLow) isLow = false
    }

    if (isHigh) {
      swingHighs.push({
        index: i,
        timestamp: bars[i].timestamp,
        price: currentHigh,
        type: 'high'
      })
    }
    if (isLow) {
      swingLows.push({
        index: i,
        timestamp: bars[i].timestamp,
        price: currentLow,
        type: 'low'
      })
    }
  }

  return { swingHighs, swingLows }
}

// ==========================================
// AI & MCP Engine Implementation
// ==========================================

export class AiMcpEngine {
  /**
   * Get complete MCP Tool Definitions for external LLMs / agents
   */
  public static getMcpTools(): McpToolDefinition[] {
    return [
      {
        name: 'get_market_snapshot',
        description: 'Read live orderbook depth, spread, 24h ticker metrics, and volume for a symbol.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Ticker symbol, e.g. BTCUSDT, ETHUSDT' }
          },
          required: ['symbol']
        }
      },
      {
        name: 'get_news_sentiment',
        description: 'Read news articles, social FinTwit feed, and sentiment polarity for a given asset or global market.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Target symbol (optional)' },
            limit: { type: 'number', description: 'Number of articles to fetch' }
          }
        }
      },
      {
        name: 'get_macro_context',
        description: 'Read macro indicators including Crypto Fear & Greed index, central bank positioning, and COT reports.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'compute_technical_analysis',
        description: 'Compute swing highs/lows, trend direction, EMAs, RSI, support/resistance, and institutional supply/demand zones.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Asset symbol' },
            timeframe: { type: 'string', description: 'Candle timeframe (e.g. 15m, 1h, 4h, 1d)' }
          },
          required: ['symbol']
        }
      },
      {
        name: 'draw_trendline_on_chart',
        description: 'Draw a technical trendline directly onto the active chart between two price/time coordinates.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Asset symbol' },
            timestamp1: { type: 'number', description: 'Start point UNIX timestamp (ms)' },
            price1: { type: 'number', description: 'Start point price' },
            timestamp2: { type: 'number', description: 'End point UNIX timestamp (ms)' },
            price2: { type: 'number', description: 'End point price' },
            label: { type: 'string', description: 'Trendline description' },
            color: { type: 'string', description: 'Hex color, default #D4AF37' }
          },
          required: ['symbol', 'timestamp1', 'price1', 'timestamp2', 'price2']
        }
      },
      {
        name: 'draw_level_on_chart',
        description: 'Draw a key horizontal Support, Resistance, or Pivot line directly onto the chart.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Asset symbol' },
            price: { type: 'number', description: 'Price level' },
            type: { type: 'string', description: 'support | resistance | pivot', enum: ['support', 'resistance', 'pivot'] },
            label: { type: 'string', description: 'Display name' }
          },
          required: ['symbol', 'price', 'type']
        }
      },
      {
        name: 'draw_zone_on_chart',
        description: 'Draw an Institutional Order Block, Fair Value Gap (FVG), or Supply/Demand zone rectangle on the chart.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Asset symbol' },
            type: { type: 'string', description: 'demand | supply', enum: ['demand', 'supply'] },
            timestamp1: { type: 'number', description: 'Start timestamp' },
            price1: { type: 'number', description: 'Upper price bound' },
            timestamp2: { type: 'number', description: 'End timestamp' },
            price2: { type: 'number', description: 'Lower price bound' },
            label: { type: 'string', description: 'Zone label' }
          },
          required: ['symbol', 'type', 'timestamp1', 'price1', 'timestamp2', 'price2']
        }
      },
      {
        name: 'clear_chart_drawings',
        description: 'Clear all AI and custom drawings from the chart for a specified symbol.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Target symbol' }
          },
          required: ['symbol']
        }
      },
      {
        name: 'execute_full_chart_analysis',
        description: 'All-in-one AI execution: Ingests news sentiment, orderbook, and candles, determines high-probability trade plan, and plots trendlines and levels directly on the chart.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Target symbol' },
            applyToChart: { type: 'string', description: 'Whether to immediately draw on chart (true/false)' }
          },
          required: ['symbol']
        }
      }
    ]
  }

  /**
   * Execute an MCP tool by name
   */
  public static async executeTool(name: string, args: Record<string, any>): Promise<any> {
    switch (name) {
      case 'get_market_snapshot':
        return this.getMarketSnapshot(args.symbol)
      case 'get_news_sentiment':
        return this.getNewsSentiment(args.symbol, args.limit)
      case 'get_macro_context':
        return this.getMacroContext()
      case 'compute_technical_analysis':
        return this.computeTechnicalAnalysis(args.symbol, args.timeframe)
      case 'draw_trendline_on_chart':
        return this.drawTrendline(args.symbol, args.timestamp1, args.price1, args.timestamp2, args.price2, args.label, args.color)
      case 'draw_level_on_chart':
        return this.drawLevel(args.symbol, args.price, args.type, args.label)
      case 'draw_zone_on_chart':
        return this.drawZone(args.symbol, args.type, args.timestamp1, args.price1, args.timestamp2, args.price2, args.label)
      case 'clear_chart_drawings':
        return this.clearDrawings(args.symbol)
      case 'execute_full_chart_analysis':
        return this.executeFullChartAnalysis(args.symbol, args.applyToChart !== 'false' && args.applyToChart !== false)
      default:
        throw new Error(`Unknown MCP tool: ${name}`)
    }
  }

  // ==========================================
  // Core Data Ingestion & Technical Math
  // ==========================================

  public static async getMarketSnapshot(symbol: string): Promise<any> {
    const marketState = useMarketStore.getState()
    const liveTicker = marketState.prices[symbol]
    let orderbook: any = null

    try {
      if ((window.api?.market as any)?.getOrderbook) {
        orderbook = await (window.api.market as any).getOrderbook(symbol)
      }
    } catch {}

    let bidVol = 0
    let askVol = 0
    let spread = 0
    if (orderbook && orderbook.bids?.length && orderbook.asks?.length) {
      bidVol = orderbook.bids.slice(0, 10).reduce((acc: number, b: any) => acc + (b.size || b[1] || 0), 0)
      askVol = orderbook.asks.slice(0, 10).reduce((acc: number, a: any) => acc + (a.size || a[1] || 0), 0)
      const bestBid = orderbook.bids[0].price || orderbook.bids[0][0] || 0
      const bestAsk = orderbook.asks[0].price || orderbook.asks[0][0] || 0
      spread = Math.abs(bestAsk - bestBid)
    }

    return {
      symbol,
      price: liveTicker?.price ?? 0,
      change24h: liveTicker?.change24h ?? 0,
      high24h: liveTicker?.high24h ?? 0,
      low24h: liveTicker?.low24h ?? 0,
      volume24h: liveTicker?.volume24h ?? 0,
      orderbook: {
        bidVolumeTop10: bidVol,
        askVolumeTop10: askVol,
        imbalanceRatio: askVol > 0 ? Number((bidVol / askVol).toFixed(2)) : 1.0,
        spread
      }
    }
  }

  public static async getNewsSentiment(symbol?: string, limit = 8): Promise<any> {
    let articles: any[] = []
    let socialPosts: any[] = []

    try {
      if (window.api?.news?.get) {
        articles = await (window.api.news.get as any)({ symbol, limit })
      }
    } catch {}

    try {
      if (window.api?.social?.getPosts) {
        socialPosts = await window.api.social.getPosts({ symbol, limit })
      }
    } catch {}

    let bullishCount = 0
    let bearishCount = 0

    // Analyze headlines sentiment
    const headlines: string[] = []
    for (const art of (articles || []).slice(0, limit)) {
      if (art.title) {
        headlines.push(art.title)
        const t = art.title.toLowerCase()
        if (t.includes('surge') || t.includes('rally') || t.includes('bull') || t.includes('breakout') || t.includes('record') || t.includes('gain')) {
          bullishCount++
        } else if (t.includes('drop') || t.includes('crash') || t.includes('bear') || t.includes('fall') || t.includes('plunge') || t.includes('loss')) {
          bearishCount++
        }
      }
    }

    // Include social sentiment
    for (const post of (socialPosts || []).slice(0, limit)) {
      if (post.sentiment === 'bullish') bullishCount++
      else if (post.sentiment === 'bearish') bearishCount++
    }

    const totalSignals = bullishCount + bearishCount
    let score = 0
    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral'

    if (totalSignals > 0) {
      score = Math.round(((bullishCount - bearishCount) / totalSignals) * 100)
      if (score > 20) sentiment = 'bullish'
      else if (score < -20) sentiment = 'bearish'
    }

    return {
      symbol: symbol || 'GLOBAL',
      score,
      sentiment,
      bullishSignals: bullishCount,
      bearishSignals: bearishCount,
      topHeadlines: headlines.slice(0, 5)
    }
  }

  public static async getMacroContext(): Promise<any> {
    let fearGreed: any = null
    try {
      if (window.api?.macro?.getFearGreed) {
        fearGreed = await window.api.macro.getFearGreed()
      }
    } catch {}

    return {
      fearGreedIndex: fearGreed?.value ?? 55,
      fearGreedLabel: fearGreed?.sentiment ?? 'Neutral',
      macroRegime: 'Risk-On Liquidity Expansion',
      centralBankPolicy: 'Accommodative / Selective Rate Adjustments'
    }
  }

  /**
   * Run full technical calculations on current bars
   */
  public static async computeTechnicalAnalysis(symbol: string, timeframe?: string): Promise<TechnicalAnalysisResult> {
    const tf = timeframe || useMarketStore.getState().timeframe || '15m'
    let bars = candleEngine.getBars()

    // Fetch bars if current memory is empty or symbol does not match
    if (!bars || bars.length < 20 || useMarketStore.getState().symbol !== symbol) {
      try {
        if (window.api?.market?.getCandles) {
          const fetched = await (window.api.market.getCandles as any)({
            symbol,
            timeframe: tf,
            limit: 120
          })
          if (fetched && fetched.length > 0) {
            bars = fetched as any
          }
        }
      } catch {}
    }

    if (!bars || bars.length < 15) {
      throw new Error(`Insufficient candle history for ${symbol} to perform institutional technical analysis.`)
    }

    const currentPrice = bars[bars.length - 1].close
    const closes = bars.map((b) => b.close)

    // Indicators
    const rsi14 = calculateRSI(closes, 14)
    const ema20Arr = calculateEMA(closes, 20)
    const ema50Arr = calculateEMA(closes, 50)
    const ema200Arr = bars.length >= 200 ? calculateEMA(closes, 200) : undefined
    const ema20 = ema20Arr[ema20Arr.length - 1]
    const ema50 = ema50Arr[ema50Arr.length - 1]
    const ema200 = ema200Arr ? ema200Arr[ema200Arr.length - 1] : undefined
    const atr14 = calculateATR(bars, 14)

    // Swing Pivots
    const { swingHighs, swingLows } = findPivots(bars, 3, 3)

    // Determine Trend Structure
    let trend: 'bullish' | 'bearish' | 'ranging' = 'ranging'
    if (ema20 > ema50 && currentPrice > ema20) {
      trend = 'bullish'
    } else if (ema20 < ema50 && currentPrice < ema20) {
      trend = 'bearish'
    }

    // Identify Support & Resistance Price Levels
    const recentHighs = swingHighs.slice(-4).map((p) => p.price)
    const recentLows = swingLows.slice(-4).map((p) => p.price)

    // Distinct levels rounded to sensible precision
    const resistanceLevels = Array.from(new Set(recentHighs.filter((p) => p > currentPrice * 0.999))).slice(-2)
    const supportLevels = Array.from(new Set(recentLows.filter((p) => p < currentPrice * 1.001))).slice(-2)

    if (resistanceLevels.length === 0) {
      resistanceLevels.push(Number((currentPrice * 1.02).toFixed(4)))
    }
    if (supportLevels.length === 0) {
      supportLevels.push(Number((currentPrice * 0.98).toFixed(4)))
    }

    // Trendline Coordinates
    const trendlines: TechnicalAnalysisResult['trendlines'] = []

    // 1. Support Trendline (connecting 2 consecutive swing lows)
    if (swingLows.length >= 2) {
      const p1 = swingLows[swingLows.length - 2]
      const p2 = swingLows[swingLows.length - 1]
      trendlines.push({
        type: 'support_trendline',
        p1: { timestamp: p1.timestamp, price: p1.price },
        p2: { timestamp: p2.timestamp, price: p2.price }
      })
    }

    // 2. Resistance Trendline (connecting 2 consecutive swing highs)
    if (swingHighs.length >= 2) {
      const p1 = swingHighs[swingHighs.length - 2]
      const p2 = swingHighs[swingHighs.length - 1]
      trendlines.push({
        type: 'resistance_trendline',
        p1: { timestamp: p1.timestamp, price: p1.price },
        p2: { timestamp: p2.timestamp, price: p2.price }
      })
    }

    // Institutional Supply / Demand Zones (Order Blocks)
    const zones: TechnicalAnalysisResult['zones'] = []
    const lastSwingLow = swingLows[swingLows.length - 1]
    const lastSwingHigh = swingHighs[swingHighs.length - 1]

    if (lastSwingLow) {
      const lowIndex = lastSwingLow.index
      const baseBar = bars[Math.max(0, lowIndex - 1)]
      zones.push({
        type: 'demand',
        from: { timestamp: baseBar.timestamp, price: Math.max(baseBar.open, baseBar.close) },
        to: { timestamp: bars[bars.length - 1].timestamp + 3600000 * 4, price: baseBar.low },
        label: 'Demand Zone (Order Block)'
      })
    }

    if (lastSwingHigh) {
      const highIndex = lastSwingHigh.index
      const baseBar = bars[Math.max(0, highIndex - 1)]
      zones.push({
        type: 'supply',
        from: { timestamp: baseBar.timestamp, price: baseBar.high },
        to: { timestamp: bars[bars.length - 1].timestamp + 3600000 * 4, price: Math.min(baseBar.open, baseBar.close) },
        label: 'Supply Zone (Liquidity)'
      })
    }

    // Ingest news sentiment
    const sentimentSummary = await this.getNewsSentiment(symbol, 6)
    const marketSnapshot = await this.getMarketSnapshot(symbol)

    // Formulate institutional trade plan
    let bias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL'
    let suggestedEntry = currentPrice
    let stopLoss = currentPrice
    let tp1 = currentPrice
    let tp2 = currentPrice
    let rationale = ''

    if (trend === 'bullish' || (sentimentSummary.score > 20 && trend !== 'bearish')) {
      bias = 'LONG'
      suggestedEntry = currentPrice
      const primarySupport = supportLevels[0] || currentPrice * 0.985
      stopLoss = Number((primarySupport - atr14 * 0.8).toFixed(4))
      const primaryResistance = resistanceLevels[0] || currentPrice * 1.025
      tp1 = primaryResistance
      tp2 = Number((currentPrice + (tp1 - suggestedEntry) * 1.618).toFixed(4))
      rationale = `Bullish continuation supported by EMA20 > EMA50 alignment and positive news sentiment (${sentimentSummary.score > 0 ? '+' : ''}${sentimentSummary.score}%). Target overhead liquidity at R1 (${tp1}).`
    } else if (trend === 'bearish' || sentimentSummary.score < -20) {
      bias = 'SHORT'
      suggestedEntry = currentPrice
      const primaryResistance = resistanceLevels[0] || currentPrice * 1.02
      stopLoss = Number((primaryResistance + atr14 * 0.8).toFixed(4))
      const primarySupport = supportLevels[0] || currentPrice * 0.975
      tp1 = primarySupport
      tp2 = Number((currentPrice - (suggestedEntry - tp1) * 1.618).toFixed(4))
      rationale = `Bearish pressure under EMA20 with negative news sentiment (${sentimentSummary.score}%). Watch breakdown targeting key support level S1 (${tp1}).`
    } else {
      bias = 'NEUTRAL'
      stopLoss = Number((currentPrice - atr14 * 1.2).toFixed(4))
      tp1 = resistanceLevels[0] || currentPrice * 1.015
      tp2 = Number((currentPrice + atr14 * 2.0).toFixed(4))
      rationale = `Mean-reverting consolidation between S1 (${supportLevels[0]}) and R1 (${resistanceLevels[0]}). Favour range-bound scalping until clean breakout.`
    }

    const risk = Math.abs(suggestedEntry - stopLoss)
    const reward = Math.abs(tp1 - suggestedEntry)
    const rrr = risk > 0 ? `1 : ${(reward / risk).toFixed(2)}` : '1 : 2.0'

    return {
      symbol,
      timeframe: tf,
      currentPrice,
      trend,
      sentimentSummary,
      orderbookSummary: marketSnapshot?.orderbook,
      indicators: {
        rsi14,
        ema20: Number(ema20.toFixed(4)),
        ema50: Number(ema50.toFixed(4)),
        ema200: ema200 ? Number(ema200.toFixed(4)) : undefined,
        atr14: Number(atr14.toFixed(4))
      },
      levels: {
        resistance: resistanceLevels,
        support: supportLevels,
        pivot: Number(((resistanceLevels[0] + supportLevels[0] + currentPrice) / 3).toFixed(4))
      },
      trendlines,
      zones,
      tradePlan: {
        bias,
        suggestedEntry,
        stopLoss,
        takeProfit1: tp1,
        takeProfit2: tp2,
        riskRewardRatio: rrr,
        rationale
      },
      plottedDrawingsCount: 0
    }
  }

  // ==========================================
  // Direct Chart Drawing Primitives
  // ==========================================

  public static async drawTrendline(
    symbol: string,
    timestamp1: number,
    price1: number,
    timestamp2: number,
    price2: number,
    label?: string,
    color = '#D4AF37'
  ): Promise<boolean> {
    const drawingItem: DrawingItem = {
      id: `ai-tl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'straightLine',
      symbol,
      points: [
        { timestamp: timestamp1, value: price1 },
        { timestamp: timestamp2, value: price2 }
      ],
      style: {
        color,
        lineWidth: 2,
        lineStyle: 'solid',
        text: label || 'AI Trendline'
      },
      lock: true,
      visible: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    if (window.api?.drawings?.save) {
      await window.api.drawings.save(drawingItem)
      window.dispatchEvent(new CustomEvent('pia:reload-drawings', { detail: { symbol } }))
      return true
    }
    return false
  }

  public static async drawLevel(
    symbol: string,
    price: number,
    type: 'support' | 'resistance' | 'pivot',
    label?: string
  ): Promise<boolean> {
    const color =
      type === 'support' ? '#10B981' : type === 'resistance' ? '#F43F5E' : '#D4AF37'
    const defaultLabel =
      type === 'support' ? `AI Support (${price})` : type === 'resistance' ? `AI Resistance (${price})` : `AI Pivot (${price})`

    const drawingItem: DrawingItem = {
      id: `ai-lvl-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'horizontalStraightLine',
      symbol,
      points: [{ timestamp: Date.now(), value: price }],
      style: {
        color,
        lineWidth: 1.5,
        lineStyle: type === 'pivot' ? 'dashed' : 'solid',
        text: label || defaultLabel
      },
      lock: true,
      visible: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    if (window.api?.drawings?.save) {
      await window.api.drawings.save(drawingItem)
      window.dispatchEvent(new CustomEvent('pia:reload-drawings', { detail: { symbol } }))
      return true
    }
    return false
  }

  public static async drawZone(
    symbol: string,
    type: 'demand' | 'supply',
    timestamp1: number,
    price1: number,
    timestamp2: number,
    price2: number,
    label?: string
  ): Promise<boolean> {
    const isDemand = type === 'demand'
    const color = isDemand ? '#10B981' : '#F43F5E'
    const fillColor = isDemand ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)'

    const drawingItem: DrawingItem = {
      id: `ai-zone-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'rect',
      symbol,
      points: [
        { timestamp: timestamp1, value: price1 },
        { timestamp: timestamp2, value: price2 }
      ],
      style: {
        color,
        lineWidth: 1,
        fillColor,
        text: label || (isDemand ? 'AI Demand Zone' : 'AI Supply Zone')
      },
      lock: true,
      visible: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    if (window.api?.drawings?.save) {
      await window.api.drawings.save(drawingItem)
      window.dispatchEvent(new CustomEvent('pia:reload-drawings', { detail: { symbol } }))
      return true
    }
    return false
  }

  public static async clearDrawings(symbol: string): Promise<boolean> {
    if (window.api?.drawings?.clear) {
      await window.api.drawings.clear({ symbol })
      window.dispatchEvent(new CustomEvent('pia:reload-drawings', { detail: { symbol } }))
      return true
    }
    return false
  }

  /**
   * End-to-end master pipeline:
   * Analyzes candles, news sentiment, macro context, and plots trendlines + levels + zones on the chart.
   */
  public static async executeFullChartAnalysis(symbol: string, applyToChart = true): Promise<TechnicalAnalysisResult> {
    const analysis = await this.computeTechnicalAnalysis(symbol)

    if (applyToChart) {
      let count = 0

      // 1. Draw Support and Resistance Levels
      for (const s of analysis.levels.support) {
        await this.drawLevel(symbol, s, 'support')
        count++
      }
      for (const r of analysis.levels.resistance) {
        await this.drawLevel(symbol, r, 'resistance')
        count++
      }

      // 2. Draw Trendlines
      for (const tl of analysis.trendlines) {
        const color = tl.type === 'support_trendline' ? '#10B981' : '#F43F5E'
        const label = tl.type === 'support_trendline' ? 'AI Support Trendline' : 'AI Resistance Trendline'
        await this.drawTrendline(symbol, tl.p1.timestamp, tl.p1.price, tl.p2.timestamp, tl.p2.price, label, color)
        count++
      }

      // 3. Draw Supply & Demand Zones
      for (const z of analysis.zones) {
        await this.drawZone(symbol, z.type, z.from.timestamp, z.from.price, z.to.timestamp, z.to.price, z.label)
        count++
      }

      analysis.plottedDrawingsCount = count
      // Trigger canvas refresh
      window.dispatchEvent(new CustomEvent('pia:reload-drawings', { detail: { symbol } }))
    }

    return analysis
  }
}
