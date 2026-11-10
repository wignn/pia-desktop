/**
 * PIA Terminal - AI & Model Context Protocol (MCP) Analysis Engine
 * 
 * Provides an MCP-compliant toolset that ingests news sentiment, live orderbook depth,
 * multi-timeframe candles, and macro metrics, and executes automated technical analysis
 * with direct overlay projection (trendlines, support/resistance, order blocks) on the chart.
 */

import { candleEngine } from './candle-engine'
import { useMarketStore } from '../stores/useMarketStore'
import { usePiaScriptStore } from '../stores/usePiaScriptStore'
import { useKronosStore, setActiveKronosChart, requestKronosRollout } from './kronos-client'
import { timeframeMilliseconds } from './kronos-input'
import {
  sharedDbService,
  encodeMarketRegimeVector,
  computeCosineSimilarity,
  type MarketRegimeFeatureInput
} from './database'
import type { DrawingItem, OrderBookData } from '@shared/types'
import { getSymbolPrecision } from '@shared/market-utils'

export const SUPPORTED_PIASCRIPT_FUNCTIONS = [
  'ema(src, period)',
  'sma(src, period)',
  'rsi(src, period)',
  'atr(period)',
  'macd(src, fast, slow)',
  'macd_signal(src, fast, slow, sig)',
  'macd_hist(src, fast, slow, sig)',
  'bb_upper(src, period, mult)',
  'bb_lower(src, period, mult)',
  'bb_basis(src, period)',
  'stdev(src, period)',
  'highest(src, period)',
  'lowest(src, period)',
  'crossover(a, b)',
  'crossunder(a, b)',
  'input(default_val)',
  'abs(val)',
  'max(a, b)',
  'min(a, b)',
  'plot(series, color="#00bcd4", title="...")',
  'buy(1, sl=..., tp=...)',
  'sell(1, sl=..., tp=...)',
  'close()'
]

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
    orderType?: 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP' | 'MARKET'
    suggestedEntry: number
    stopLoss: number
    takeProfit1: number
    takeProfit2: number
    riskRewardRatio: string
    suggestedLotSize?: number
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
      },
      {
        name: 'run_piascript_backtest',
        description: 'Compile and backtest a custom PiaScript quantitative strategy on the active symbol, auto-applying indicator plots and BUY/SELL/CLOSE signals onto the chart and Strategy Tester while returning institutional risk metrics (Sharpe, Sortino, Expectancy, Profit Factor, Max Drawdown).',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Target symbol (e.g. BTCUSDT, XAUUSD)' },
            script: { type: 'string', description: 'Valid PiaScript DSL code using ema, sma, rsi, atr, macd, bb_upper, bb_lower, crossover, crossunder, plot, buy, sell, close' },
            initialCapital: { type: 'string', description: 'Starting capital in USD (default 10000)' }
          },
          required: ['symbol', 'script']
        }
      },
      {
        name: 'get_kronos_forecast',
        description: 'Retrieve Kronos AI multi-step probabilistic candlestick forecast (1 to 12 future bars) with q10/q50/q90 quantile bands and directional bias.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Target symbol' },
            timeframe: { type: 'string', description: 'Chart timeframe (e.g. 15m, 1h, 4h)' },
            horizon: { type: 'string', description: 'Forecast steps ahead (integer 1 to 12, default 12)' }
          },
          required: ['symbol']
        }
      },
      {
        name: 'search_similar_market_regimes',
        description: 'Search local SQLite Market Memory via 7D Cosine Similarity (K-NN) to find historical setups with similar RSI, ATR%, EMA spread, orderbook imbalance, sentiment, and Kronos return, returning empirical win rate and realized R-multiples.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Target symbol (e.g. XAUUSD, BTCUSDT)' },
            k: { type: 'number', description: 'Top-K similar episodes to retrieve (default 5)' },
            sameSymbolOnly: { type: 'string', description: 'Restrict matches to the same symbol (true/false, default true)' }
          },
          required: ['symbol']
        }
      },
      {
        name: 'audit_trading_journal',
        description: 'Audit closed paper-trade episodes in local SQLite Market Memory to compute win rate, profit factor, average realized R, long vs short accuracy, streak, and behavioral risk insights.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Optional symbol filter (e.g. XAUUSD, BTCUSDT)' },
            limit: { type: 'number', description: 'Maximum episodes to audit (default 100)' }
          }
        }
      }
    ]
  }

  /**
   * Get tools in OpenAI-compatible function calling format
   */
  public static getOpenAiTools(): Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: Record<string, any>
    }
  }> {
    return this.getMcpTools().map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema
      }
    }))
  }

  /**
   * Execute an MCP tool by name
   */
  public static async executeTool(name: string, args: Record<string, any>): Promise<any> {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be an object')
    if (name !== 'get_macro_context' && name !== 'audit_trading_journal') {
      if (typeof args.symbol !== 'string' || !args.symbol.trim() || args.symbol.length > 32) {
        throw new Error('A valid symbol is required')
      }
      args = { ...args, symbol: args.symbol.trim() }
    } else if (typeof args.symbol === 'string' && args.symbol.trim()) {
      args = { ...args, symbol: args.symbol.trim() }
    }
    const finitePositive = (key: string): number => {
      const value = typeof args[key] === 'string' ? Number(args[key]) : args[key]
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${key}`)
      return value
    }
    switch (name) {
      case 'get_market_snapshot':
        return this.getMarketSnapshot(args.symbol)
      case 'get_news_sentiment': {
        const limit = args.limit === undefined ? 8 : Number(args.limit)
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid news limit')
        return this.getNewsSentiment(args.symbol, limit)
      }
      case 'get_macro_context':
        return this.getMacroContext()
      case 'compute_technical_analysis':
        return this.computeTechnicalAnalysis(args.symbol, args.timeframe)
      case 'draw_trendline_on_chart': {
        const timestamp1 = finitePositive('timestamp1')
        const timestamp2 = finitePositive('timestamp2')
        if (timestamp1 === timestamp2) throw new Error('Trendline timestamps must differ')
        return this.drawTrendline(args.symbol, timestamp1, finitePositive('price1'), timestamp2, finitePositive('price2'), args.label, args.color)
      }
      case 'draw_level_on_chart':
        if (!['support', 'resistance', 'pivot'].includes(args.type)) throw new Error('Invalid level type')
        return this.drawLevel(args.symbol, finitePositive('price'), args.type, args.label)
      case 'draw_zone_on_chart': {
        const timestamp1 = finitePositive('timestamp1')
        const timestamp2 = finitePositive('timestamp2')
        if (timestamp1 === timestamp2 || !['demand', 'supply'].includes(args.type)) throw new Error('Invalid drawing zone')
        return this.drawZone(args.symbol, args.type, timestamp1, finitePositive('price1'), timestamp2, finitePositive('price2'), args.label)
      }
      case 'clear_chart_drawings':
        return this.clearDrawings(args.symbol)
      case 'execute_full_chart_analysis':
        return this.executeFullChartAnalysis(args.symbol, args.applyToChart !== 'false' && args.applyToChart !== false)
      case 'run_piascript_backtest': {
        if (typeof args.script !== 'string' || !args.script.trim()) {
          throw new Error('A valid PiaScript strategy string is required')
        }
        const initialCapital =
          args.initialCapital === undefined ? 10000 : Number(args.initialCapital)
        if (!Number.isFinite(initialCapital) || initialCapital < 100 || initialCapital > 100_000_000) {
          throw new Error('Invalid initialCapital')
        }
        return this.runPiaScriptBacktest(args.symbol, args.script, initialCapital)
      }
      case 'get_kronos_forecast': {
        const horizon = args.horizon === undefined ? 12 : Number(args.horizon)
        if (!Number.isInteger(horizon) || horizon < 1 || horizon > 12) {
          throw new Error('Invalid forecast horizon')
        }
        return this.getKronosForecast(args.symbol, args.timeframe, horizon)
      }
      case 'search_similar_market_regimes': {
        const k = args.k === undefined ? 5 : Number(args.k)
        if (!Number.isInteger(k) || k < 1 || k > 50) {
          throw new Error('Invalid k parameter')
        }
        const sameSymbolOnly = args.sameSymbolOnly !== false && args.sameSymbolOnly !== 'false'
        return this.searchSimilarMarketRegimes(args.symbol, k, sameSymbolOnly, args.featureOverride)
      }
      case 'audit_trading_journal': {
        const limit = args.limit === undefined ? 100 : Number(args.limit)
        if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
          throw new Error('Invalid limit parameter')
        }
        return this.auditTradingJournal(args.symbol, limit)
      }
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
    let orderbook: OrderBookData | null = null

    try {
      orderbook = await window.api?.orderbook?.get(symbol) ?? null
    } catch {}

    const bidVol = orderbook?.bids?.slice(0, 10).reduce((sum, level) => sum + level.size, 0)
    const askVol = orderbook?.asks?.slice(0, 10).reduce((sum, level) => sum + level.size, 0)
    return {
      symbol,
      capturedAt: Date.now(),
      price: liveTicker?.price,
      priceTimestamp: liveTicker?.receivedAt ?? liveTicker?.timestamp,
      change24h: liveTicker?.change24h,
      high24h: liveTicker?.high24h,
      low24h: liveTicker?.low24h,
      volume24h: liveTicker?.volume24h,
      orderbook: orderbook ? {
        timestamp: orderbook.timestamp,
        bidVolumeTop10: bidVol,
        askVolumeTop10: askVol,
        imbalanceRatio: askVol && askVol > 0 ? Number(((bidVol ?? 0) / askVol).toFixed(2)) : undefined,
        spread: orderbook.spread
      } : null
    }
  }

  public static async getNewsSentiment(symbol?: string, limit = 8): Promise<any> {
    let articles: any[] = []
    let socialPosts: any[] = []

    try {
      if (window.api?.news?.get) {
        const received = await window.api.news.get({ limit })
        // Provider fallback headlines are illustrative, not live evidence for sentiment.
        articles = received.filter((article) => !article.id.startsWith('news-sample-'))
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
      capturedAt: Date.now(),
      available: articles.length > 0 || socialPosts.length > 0,
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

    let centralBanks: unknown[] = []
    try {
      centralBanks = await window.api?.macro?.getCentralBanks() ?? []
    } catch {}

    return {
      capturedAt: Date.now(),
      fearGreedIndex: fearGreed?.value,
      fearGreedLabel: fearGreed?.sentiment,
      centralBanks,
      available: fearGreed !== null || centralBanks.length > 0
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

    // Precision helper to prevent raw floating-point drift (e.g. 82221.95999999999)
    const { pricePrecision } = getSymbolPrecision(symbol, undefined, currentPrice)
    const roundPrice = (n: number) => Number(Math.round(Number(n + 'e' + pricePrecision)) + 'e-' + pricePrecision)

    // Formulate institutional trade plan
    let bias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL'
    let orderType: 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP' | 'MARKET' = 'BUY_LIMIT'
    let suggestedEntry = roundPrice(currentPrice)
    let stopLoss = roundPrice(currentPrice)
    let tp1 = roundPrice(currentPrice)
    let tp2 = roundPrice(currentPrice)
    let rationale = ''

    if (trend === 'bullish' || (sentimentSummary.score > 20 && trend !== 'bearish')) {
      bias = 'LONG'
      // If RSI is overbought (> 68), wait for pullback with BUY_LIMIT at support/EMA20
      if (rsi14 > 68) {
        orderType = 'BUY_LIMIT'
        suggestedEntry = roundPrice(supportLevels[0] || Math.max(ema20, currentPrice - atr14 * 0.7))
        stopLoss = roundPrice(suggestedEntry - atr14 * 0.8)
        tp1 = roundPrice(resistanceLevels[0] || currentPrice + atr14 * 1.5)
        tp2 = roundPrice(tp1 + (tp1 - suggestedEntry) * 0.618)
        rationale = `Strong Bullish trend, but RSI (${rsi14}) is elevated. Recommended BUY LIMIT on pullback to support zone (${suggestedEntry}) to avoid buying local top.`
      } else {
        orderType = 'BUY_LIMIT'
        suggestedEntry = roundPrice(supportLevels[0] || currentPrice * 0.99)
        const primarySupport = supportLevels[0] || currentPrice * 0.985
        stopLoss = roundPrice(primarySupport - atr14 * 0.8)
        const primaryResistance = resistanceLevels[0] || currentPrice * 1.025
        tp1 = roundPrice(primaryResistance)
        tp2 = roundPrice(currentPrice + (tp1 - suggestedEntry) * 1.618)
        rationale = `Bullish continuation supported by EMA20 > EMA50 alignment and positive news sentiment (${sentimentSummary.score > 0 ? '+' : ''}${sentimentSummary.score}%). Target overhead liquidity at R1 (${tp1}).`
      }
    } else if (trend === 'bearish' || sentimentSummary.score < -20) {
      bias = 'SHORT'
      // If RSI is heavily oversold (< 32), selling at market is dangerous; use SELL_LIMIT on pullback
      if (rsi14 < 32) {
        orderType = 'SELL_LIMIT'
        suggestedEntry = roundPrice(resistanceLevels[0] || Math.min(ema20, currentPrice + atr14 * 0.8))
        stopLoss = roundPrice(suggestedEntry + atr14 * 0.8)
        tp1 = roundPrice(supportLevels[0] || currentPrice - atr14 * 1.5)
        tp2 = roundPrice(tp1 - (suggestedEntry - tp1) * 0.618)
        rationale = `Bearish market structure, but RSI (${rsi14}) is oversold. Chasing shorts here has high squeeze risk. Recommended SELL LIMIT on technical pullback to resistance (${suggestedEntry}).`
      } else {
        orderType = 'SELL_LIMIT'
        suggestedEntry = roundPrice(resistanceLevels[0] || currentPrice * 1.01)
        const primaryResistance = resistanceLevels[0] || currentPrice * 1.02
        stopLoss = roundPrice(primaryResistance + atr14 * 0.8)
        const primarySupport = supportLevels[0] || currentPrice * 0.975
        tp1 = roundPrice(primarySupport)
        tp2 = roundPrice(currentPrice - (suggestedEntry - tp1) * 1.618)
        rationale = `Bearish pressure under EMA20 with negative news sentiment (${sentimentSummary.score}%). Watch breakdown targeting key support level S1 (${tp1}).`
      }
    } else {
      bias = 'NEUTRAL'
      orderType = 'BUY_LIMIT'
      suggestedEntry = roundPrice(supportLevels[0] || currentPrice * 0.99)
      stopLoss = roundPrice(currentPrice - atr14 * 1.2)
      tp1 = roundPrice(resistanceLevels[0] || currentPrice * 1.015)
      tp2 = roundPrice(currentPrice + atr14 * 2.0)
      rationale = `Mean-reverting consolidation between S1 (${supportLevels[0]}) and R1 (${resistanceLevels[0]}). Favour range-bound scalping until clean breakout.`
    }

    const risk = Math.abs(suggestedEntry - stopLoss)
    const reward = Math.abs(tp1 - suggestedEntry)
    const rrr = risk > 0 ? `1 : ${(reward / risk).toFixed(2)}` : '1 : 2.0'

    return {
      symbol,
      timeframe: tf,
      currentPrice: roundPrice(currentPrice),
      trend,
      sentimentSummary,
      orderbookSummary: marketSnapshot?.orderbook,
      indicators: {
        rsi14,
        ema20: roundPrice(ema20),
        ema50: roundPrice(ema50),
        ema200: ema200 ? roundPrice(ema200) : undefined,
        atr14: roundPrice(atr14)
      },
      levels: {
        resistance: resistanceLevels.map(roundPrice),
        support: supportLevels.map(roundPrice),
        pivot: roundPrice((resistanceLevels[0] + supportLevels[0] + currentPrice) / 3)
      },
      trendlines,
      zones,
      tradePlan: {
        bias,
        orderType,
        suggestedEntry,
        stopLoss,
        takeProfit1: tp1,
        takeProfit2: tp2,
        riskRewardRatio: rrr,
        suggestedLotSize: 0.1,
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
    if (!symbol || !window.api?.drawings?.get || !window.api.drawings.delete) return false
    const drawings = await window.api.drawings.get({ symbol })
    const aiDrawings = drawings.filter((drawing) => drawing.id.startsWith('ai-'))
    for (const drawing of aiDrawings) await window.api.drawings.delete(drawing.id)
    if (aiDrawings.length > 0) {
      window.dispatchEvent(new CustomEvent('pia:reload-drawings', { detail: { symbol } }))
    }
    return true
  }

  /**
   * Projects tactical trade plan levels (Entry, Stop Loss, Take Profit 1, Take Profit 2)
   * directly onto the chart canvas.
   */
  // ponytail: plots discrete horizontal lines for plan levels. Upgrade to custom RiskRewardBox overlay when draggable dynamic ratio adjustment is requested.
  public static async plotTradePlanLevels(plan: {
    symbol: string
    bias: 'LONG' | 'SHORT' | 'NEUTRAL'
    orderType?: string
    entry: number
    stopLoss: number
    takeProfit1: number
    takeProfit2?: number
  }): Promise<boolean> {
    const { symbol, bias, orderType, entry, stopLoss, takeProfit1, takeProfit2 } = plan
    if (!window.api?.drawings?.save) return false

    const entryLabel = orderType ? orderType.replace('_', ' ') : bias
    const items: DrawingItem[] = [
      {
        id: `ai-plan-entry-${Date.now()}`,
        type: 'horizontalStraightLine',
        symbol,
        points: [{ timestamp: Date.now(), value: entry }],
        style: {
          color: '#3B82F6',
          lineWidth: 2,
          lineStyle: 'solid',
          text: `AI ENTRY (${entryLabel}) @ ${entry}`
        },
        lock: true,
        visible: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: `ai-plan-sl-${Date.now() + 1}`,
        type: 'horizontalStraightLine',
        symbol,
        points: [{ timestamp: Date.now(), value: stopLoss }],
        style: {
          color: '#F43F5E',
          lineWidth: 2,
          lineStyle: 'dashed',
          text: `AI STOP LOSS @ ${stopLoss}`
        },
        lock: true,
        visible: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: `ai-plan-tp1-${Date.now() + 2}`,
        type: 'horizontalStraightLine',
        symbol,
        points: [{ timestamp: Date.now(), value: takeProfit1 }],
        style: {
          color: '#10B981',
          lineWidth: 2,
          lineStyle: 'dashed',
          text: `AI TP1 @ ${takeProfit1}`
        },
        lock: true,
        visible: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ]

    if (takeProfit2 && takeProfit2 !== takeProfit1) {
      items.push({
        id: `ai-plan-tp2-${Date.now() + 3}`,
        type: 'horizontalStraightLine',
        symbol,
        points: [{ timestamp: Date.now(), value: takeProfit2 }],
        style: {
          color: '#059669',
          lineWidth: 2,
          lineStyle: 'dashed',
          text: `AI TP2 @ ${takeProfit2}`
        },
        lock: true,
        visible: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
    }

    for (const item of items) {
      await window.api.drawings.save(item)
    }

    window.dispatchEvent(new CustomEvent('pia:reload-drawings', { detail: { symbol } }))
    return true
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

  private static async ensureSymbolBars(symbol: string, timeframe?: string): Promise<any[]> {
    const marketState = useMarketStore.getState()
    const tf = timeframe || marketState.timeframe || '15m'
    let bars = candleEngine.getActiveBars()
    if (!bars || bars.length === 0) {
      bars = candleEngine.getBars()
    }

    if (!bars || bars.length < 12 || (marketState.symbol && marketState.symbol !== symbol)) {
      try {
        if (typeof window !== 'undefined' && window.api?.market?.getCandles) {
          const fetched = await (window.api.market.getCandles as any)({
            symbol,
            timeframe: tf,
            limit: 180
          })
          if (Array.isArray(fetched) && fetched.length > 0) {
            bars = fetched as any[]
            ;(candleEngine as any).activeBars = bars
            ;(candleEngine as any).bars = bars
          }
        }
      } catch {}
    }

    if (bars && bars.length > 0 && (!candleEngine.getActiveBars() || candleEngine.getActiveBars().length === 0)) {
      ;(candleEngine as any).activeBars = bars
    }
    return bars || []
  }

  /**
   * Compile and backtest a custom PiaScript strategy (Option A: auto-syncs with usePiaScriptStore,
   * plots indicators & signals onto the active chart, and returns compact institutional metrics).
   */
  public static async runPiaScriptBacktest(
    symbol: string,
    script: string,
    initialCapital = 10000
  ): Promise<any> {
    await this.ensureSymbolBars(symbol)

    const res = await usePiaScriptStore.getState().executeCustomScript(script, initialCapital)
    const storeState = usePiaScriptStore.getState()

    if (!res || !res.success || !res.backtest) {
      return {
        success: false,
        symbol,
        error: res?.error || storeState.error || 'PiaScript execution failed',
        supportedFunctions: SUPPORTED_PIASCRIPT_FUNCTIONS
      }
    }

    const bt = res.backtest
    return {
      success: true,
      symbol,
      appliedToChart: storeState.isAppliedToChart,
      plotsCount: res.plots.length,
      signalsCount: res.signals.length,
      metrics: {
        initialCapital: bt.initial_capital,
        finalEquity: bt.final_equity,
        netProfit: bt.net_profit,
        netProfitPercent: bt.net_profit_percent,
        totalTrades: bt.total_trades,
        winTrades: bt.win_trades,
        lossTrades: bt.loss_trades,
        winRate: bt.win_rate,
        profitFactor: bt.profit_factor,
        maxDrawdown: bt.max_drawdown,
        maxDrawdownPercent: bt.max_drawdown_percent,
        sharpeRatio: bt.sharpe_ratio ?? 0,
        sortinoRatio: bt.sortino_ratio ?? 0,
        expectancy: bt.expectancy ?? 0,
        avgWin: bt.avg_win ?? 0,
        avgLoss: bt.avg_loss ?? 0,
        maxConsecutiveWins: bt.max_consecutive_wins ?? 0,
        maxConsecutiveLosses: bt.max_consecutive_losses ?? 0,
        commissionPaid: bt.commission_paid ?? 0
      },
      recentTrades: bt.trades.slice(-10)
    }
  }

  /**
   * Retrieve or compute Kronos AI multi-step probabilistic candlestick forecast (1 to 12 future bars)
   * with q10/q50/q90 quantile bands and directional bias.
   */
  public static async getKronosForecast(
    symbol: string,
    timeframe?: string,
    horizon = 12
  ): Promise<any> {
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 12) {
      throw new Error('Invalid forecast horizon')
    }

    const marketState = useMarketStore.getState()
    const tf = timeframe || marketState.timeframe || '15m'
    const kronosState = useKronosStore.getState()

    if (
      kronosState.status === 'ready' &&
      kronosState.identity?.symbol === symbol &&
      kronosState.identity?.timeframe === tf &&
      kronosState.steps.length >= horizon
    ) {
      const sliced = kronosState.steps.slice(0, horizon)
      const originClose = kronosState.originClose || sliced[0].open
      const finalStep = sliced[sliced.length - 1]
      const expectedReturnPercent =
        originClose > 0 ? ((finalStep.close - originClose) / originClose) * 100 : 0
      const bias =
        expectedReturnPercent > 0.15
          ? 'BULLISH'
          : expectedReturnPercent < -0.15
            ? 'BEARISH'
            : 'NEUTRAL'
      return {
        symbol,
        timeframe: tf,
        horizon,
        model: kronosState.model || 'Kronos-small',
        originClose,
        finalForecastClose: finalStep.close,
        expectedReturnPercent: Number(expectedReturnPercent.toFixed(4)),
        quantiles: {
          q10: finalStep.q10,
          q50: finalStep.q50,
          q90: finalStep.q90
        },
        bias,
        steps: sliced.map((s) => ({
          timestamp: s.timestamp,
          close: s.close,
          q10: s.q10,
          q50: s.q50,
          q90: s.q90
        }))
      }
    }

    const bars = await this.ensureSymbolBars(symbol, tf)
    const isTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)
    if (isTauri && bars.length >= 12) {
      const alreadyInFlight =
        kronosState.identity?.symbol === symbol &&
        kronosState.identity?.timeframe === tf &&
        (kronosState.status === 'computing' ||
          kronosState.status === 'loading' ||
          kronosState.status === 'downloading')

      if (!alreadyInFlight) {
        try {
          setActiveKronosChart({ symbol, timeframe: tf })
          requestKronosRollout({ symbol, timeframe: tf }, bars, horizon)
        } catch {}
      }

      await new Promise<void>((resolve) => {
        const check = () => {
          const st = useKronosStore.getState()
          if (
            (st.status === 'ready' &&
              st.identity?.symbol === symbol &&
              st.identity?.timeframe === tf &&
              st.steps.length >= horizon) ||
            st.status === 'error'
          ) {
            return true
          }
          return false
        }
        if (check()) {
          resolve()
          return
        }
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          unsub()
          resolve()
        }
        const unsub = useKronosStore.subscribe(() => {
          if (check()) finish()
        })
        const timer = setTimeout(finish, 8000)
      })

      const updated = useKronosStore.getState()
      if (
        updated.status === 'ready' &&
        updated.identity?.symbol === symbol &&
        updated.identity?.timeframe === tf &&
        updated.steps.length >= horizon
      ) {
        return this.getKronosForecast(symbol, tf, horizon)
      }
    }

    // Statistical ATR/EMA quantile projection fallback when Kronos sidecar is offline or in non-Tauri test env
    const precision = getSymbolPrecision(symbol).pricePrecision
    const round = (v: number) => Number(v.toFixed(precision))
    const closes = bars.map((b) => b.close)
    const originClose = closes[closes.length - 1] || marketState.prices[symbol]?.price || 100
    const lastTs = bars[bars.length - 1]?.timestamp || Date.now()
    const stepMs = timeframeMilliseconds(tf) || 900_000

    let sumTr = 0
    for (let i = 1; i < bars.length; i++) {
      const tr = Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - bars[i - 1].close),
        Math.abs(bars[i].low - bars[i - 1].close)
      )
      sumTr += tr
    }
    const atr = bars.length > 1 ? sumTr / (bars.length - 1) : originClose * 0.005
    const lookback = Math.min(10, Math.max(1, closes.length - 1))
    const prevClose = closes[closes.length - 1 - lookback] || originClose
    const perBarDrift = (originClose - prevClose) / lookback

    const steps = []
    for (let h = 1; h <= horizon; h++) {
      const projected = originClose + perBarDrift * h
      const spread = atr * Math.sqrt(h) * 1.28
      const q50 = round(projected)
      const q10 = round(Math.min(q50, projected - spread))
      const q90 = round(Math.max(q50, projected + spread))
      steps.push({
        timestamp: lastTs + h * stepMs,
        close: q50,
        q10,
        q50,
        q90
      })
    }

    const finalStep = steps[steps.length - 1]
    const expectedReturnPercent =
      originClose > 0 ? ((finalStep.close - originClose) / originClose) * 100 : 0
    const bias =
      expectedReturnPercent > 0.15
        ? 'BULLISH'
        : expectedReturnPercent < -0.15
          ? 'BEARISH'
          : 'NEUTRAL'

    return {
      symbol,
      timeframe: tf,
      horizon,
      model: 'Kronos-Quantile-Fallback',
      originClose: round(originClose),
      finalForecastClose: finalStep.close,
      expectedReturnPercent: Number(expectedReturnPercent.toFixed(4)),
      quantiles: {
        q10: finalStep.q10,
        q50: finalStep.q50,
        q90: finalStep.q90
      },
      bias,
      steps
    }
  }

  /**
   * Search local SQLite Market Memory via 7D Cosine Similarity (K-NN) to find historical analogues.
   */
  public static async searchSimilarMarketRegimes(
    symbol: string,
    k = 5,
    sameSymbolOnly = true,
    featureOverride?: MarketRegimeFeatureInput
  ): Promise<any> {
    let queryInput: MarketRegimeFeatureInput
    if (featureOverride) {
      queryInput = featureOverride
    } else {
      const bars = await this.ensureSymbolBars(symbol)
      const closes = bars.map((b) => b.close)
      const currentPrice =
        closes[closes.length - 1] || useMarketStore.getState().prices[symbol]?.price || 100
      const rsi14 = closes.length >= 15 ? calculateRSI(closes, 14) : 50
      const ema20Arr = closes.length > 0 ? calculateEMA(closes, 20) : [currentPrice]
      const ema50Arr = closes.length > 0 ? calculateEMA(closes, 50) : [currentPrice]
      const ema20 = ema20Arr[ema20Arr.length - 1] ?? currentPrice
      const ema50 = ema50Arr[ema50Arr.length - 1] ?? currentPrice
      const atr14 = bars.length >= 2 ? calculateATR(bars, 14) : currentPrice * 0.005

      let newsScore = 0
      try {
        const news = await this.getNewsSentiment(symbol, 5)
        newsScore = Number.isFinite(news?.score) ? news.score : 0
      } catch {}

      let orderbookImbalance = 1
      try {
        const snap = await this.getMarketSnapshot(symbol)
        if (Number.isFinite(snap?.orderbook?.imbalanceRatio)) {
          orderbookImbalance = snap.orderbook.imbalanceRatio
        }
      } catch {}

      const trendDirection =
        ema20 > ema50 && currentPrice >= ema20
          ? 'BULLISH'
          : ema20 < ema50 && currentPrice <= ema20
            ? 'BEARISH'
            : 'NEUTRAL'

      queryInput = {
        price: currentPrice,
        rsi14,
        atr14,
        ema20,
        ema50,
        orderbookImbalance,
        newsScore,
        kronosExpectedReturnPercent: 0,
        trendDirection
      }
    }

    const queryVector = encodeMarketRegimeVector(queryInput)
    const episodes = sharedDbService.getMarketMemoryEpisodes(sameSymbolOnly ? symbol : undefined, 250)

    const allRanked = episodes
      .map((ep) => ({
        episode: ep,
        similarity: computeCosineSimilarity(queryVector, ep.featureVector)
      }))
      .sort((a, b) => b.similarity - a.similarity)

    const ranked = allRanked.slice(0, k)

    const closedAnalogueEpisodes = allRanked
      .filter(
        (item) =>
          item.episode.outcome === 'WIN' ||
          item.episode.outcome === 'LOSS' ||
          item.episode.outcome === 'BREAKEVEN'
      )
      .slice(0, k)
    const winCount = closedAnalogueEpisodes.filter((item) => item.episode.outcome === 'WIN').length
    const lossCount = closedAnalogueEpisodes.filter((item) => item.episode.outcome === 'LOSS').length
    const closedTradeCount = closedAnalogueEpisodes.length
    const historicalWinRate =
      closedTradeCount > 0 ? Number(((winCount / closedTradeCount) * 100).toFixed(2)) : 0
    const avgRealizedR =
      closedTradeCount > 0
        ? Number(
            (
              closedAnalogueEpisodes.reduce(
                (sum, item) => sum + (Number.isFinite(item.episode.realizedR) ? (item.episode.realizedR as number) : 0),
                0
              ) / closedTradeCount
            ).toFixed(2)
          )
        : 0
    const avgSimilarity =
      ranked.length > 0
        ? Number((ranked.reduce((sum, item) => sum + item.similarity, 0) / ranked.length).toFixed(4))
        : 0

    return {
      symbol,
      queryFeatures: {
        ...queryInput,
        vector: queryVector
      },
      matches: ranked.map(({ episode, similarity }) => ({
        id: episode.id,
        symbol: episode.symbol,
        timeframe: episode.timeframe,
        source: episode.source,
        side: episode.side,
        entryPrice: episode.entryPrice,
        exitPrice: episode.exitPrice,
        realizedPnl: episode.realizedPnl,
        realizedR: episode.realizedR,
        outcome: episode.outcome,
        similarity,
        metadata: episode.metadata,
        createdAt: episode.createdAt
      })),
      analogueStats: {
        sampleCount: ranked.length,
        closedTradeCount,
        winCount,
        lossCount,
        historicalWinRate,
        avgRealizedR,
        avgSimilarity
      }
    }
  }

  /**
   * Audit closed paper-trade episodes in local SQLite Market Memory for behavioral & performance analytics.
   */
  public static async auditTradingJournal(symbol?: string, limit = 100): Promise<any> {
    const episodes = sharedDbService.getMarketMemoryEpisodes(symbol, limit)
    const closedTrades = episodes.filter(
      (ep) =>
        ep.source === 'paper_trade' &&
        (ep.outcome === 'WIN' || ep.outcome === 'LOSS' || ep.outcome === 'BREAKEVEN')
    )

    const totalClosedTrades = closedTrades.length
    if (totalClosedTrades === 0) {
      return {
        symbol: symbol || 'ALL',
        totalClosedTrades: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        profitFactor: 0,
        totalRealizedPnl: 0,
        avgRealizedR: 0,
        expectancyUsd: 0,
        longWinRate: 0,
        shortWinRate: 0,
        streak: { type: 'NONE', count: 0 },
        behavioralInsights: ['No closed paper trades recorded in Market Memory yet.']
      }
    }

    const wins = closedTrades.filter((ep) => ep.outcome === 'WIN')
    const losses = closedTrades.filter((ep) => ep.outcome === 'LOSS')
    const winCount = wins.length
    const lossCount = losses.length
    const winRate = Number(((winCount / totalClosedTrades) * 100).toFixed(2))

    const grossProfit = wins.reduce((sum, ep) => sum + Math.max(0, ep.realizedPnl ?? 0), 0)
    const grossLoss = losses.reduce((sum, ep) => sum + Math.abs(Math.min(0, ep.realizedPnl ?? 0)), 0)
    const profitFactor =
      grossLoss > 0
        ? Number((grossProfit / grossLoss).toFixed(2))
        : grossProfit > 0
          ? 99.99
          : 0
    const totalRealizedPnl = Number(
      closedTrades.reduce((sum, ep) => sum + (ep.realizedPnl ?? 0), 0).toFixed(2)
    )
    const avgRealizedR = Number(
      (
        closedTrades.reduce((sum, ep) => sum + (ep.realizedR ?? 0), 0) / totalClosedTrades
      ).toFixed(2)
    )
    const expectancyUsd = Number((totalRealizedPnl / totalClosedTrades).toFixed(2))

    const longs = closedTrades.filter((ep) => ep.side === 'LONG')
    const shorts = closedTrades.filter((ep) => ep.side === 'SHORT')
    const longWins = longs.filter((ep) => ep.outcome === 'WIN').length
    const shortWins = shorts.filter((ep) => ep.outcome === 'WIN').length
    const longWinRate = longs.length > 0 ? Number(((longWins / longs.length) * 100).toFixed(2)) : 0
    const shortWinRate =
      shorts.length > 0 ? Number(((shortWins / shorts.length) * 100).toFixed(2)) : 0

    // Compute current streak (episodes are sorted newest first)
    const firstOutcome = closedTrades[0].outcome
    let streakCount = 0
    for (const ep of closedTrades) {
      if (ep.outcome === firstOutcome) streakCount++
      else break
    }

    const behavioralInsights: string[] = []
    const highRsiLongs = longs.filter((ep) => {
      const rsi = Number(ep.metadata?.rsi14)
      return Number.isFinite(rsi) && rsi >= 68
    })
    if (highRsiLongs.length >= 2) {
      const highRsiWinRate =
        (highRsiLongs.filter((ep) => ep.outcome === 'WIN').length / highRsiLongs.length) * 100
      if (highRsiWinRate < 40) {
        behavioralInsights.push(
          `LONG entries at elevated RSI (>= 68) have a ${highRsiWinRate.toFixed(0)}% win rate across ${highRsiLongs.length} trades — wait for pullback.`
        )
      }
    }

    const lowRsiShorts = shorts.filter((ep) => {
      const rsi = Number(ep.metadata?.rsi14)
      return Number.isFinite(rsi) && rsi <= 32
    })
    if (lowRsiShorts.length >= 2) {
      const lowRsiWinRate =
        (lowRsiShorts.filter((ep) => ep.outcome === 'WIN').length / lowRsiShorts.length) * 100
      if (lowRsiWinRate < 40) {
        behavioralInsights.push(
          `SHORT entries at oversold RSI (<= 32) have a ${lowRsiWinRate.toFixed(0)}% win rate across ${lowRsiShorts.length} trades — avoid chasing breakdowns.`
        )
      }
    }

    if (streakCount >= 2 && firstOutcome === 'LOSS') {
      behavioralInsights.push(
        `Currently on a ${streakCount}-trade losing streak — Risk Officer recommends tightening execution selectivity.`
      )
    }
    if (behavioralInsights.length === 0) {
      behavioralInsights.push(
        `Execution discipline stable: ${winRate}% win rate across ${totalClosedTrades} closed trades (avg ${avgRealizedR}R).`
      )
    }

    return {
      symbol: symbol || 'ALL',
      totalClosedTrades,
      winCount,
      lossCount,
      winRate,
      profitFactor,
      totalRealizedPnl,
      avgRealizedR,
      expectancyUsd,
      longWinRate,
      shortWinRate,
      streak: {
        type: firstOutcome,
        count: streakCount
      },
      behavioralInsights
    }
  }
}
