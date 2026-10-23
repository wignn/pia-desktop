/**
 * PIA Terminal - PiaProvider Service
 * Coordinates @piaa/sdk REST and Realtime streaming data, subscription reference counting,
 * heartbeat monitoring, and timestamp normalization.
 */

import { PiaClient } from '@piaa/sdk'
import type { MarketPrice, Candle } from '@piaa/sdk'
import { TIMEFRAMES } from '@shared/types'
import type {
  CandleBar,
  PriceQuote,
  ConnectionState,
  EconomicEvent,
  NewsArticle,
  SymbolInfo,
  Timeframe,
  OrderBookData,
  IntelligenceAnalyzeResult,
  MarketInsightResult,
  OptionChainData,
  OptionContractData,
  OptionGexData,
  OptionGexLevel,
  OptionSummaryData,
  FearGreedResult,
  FearGreedHistoryItem,
  CotReportResult,
  CentralBankStanceResult,
  YieldCurveResult,
  YieldSpreadResult,
  GeoSignalEventItem,
  GeoSignalsMapRegion,
  GeoAssetImpactItem,
  EnergyDashboardData,
  SecFilingItemData,
  SocialPostItemData,
  MacroMapResult,
  CountryMacroData,
  TradingHaltItem,
  CorporateActionItem,
  VolatilityData,
  MarketSessionData,
  MarketDataQualityData,
  MarketSpikeData,
  ProviderAlertData,
  NewsDetailData,
  EnergySeriesData,
  EconomicMetadataData,
  RateLimitStatus,
  ProviderJson,
  FixedIncomeRateData,
  FixedIncomeHistoryData,
  SecCompanyData,
  WsTicketData
} from '@shared/types'
import { IPC_CHANNELS } from '@shared/contracts'
import {
  mapPiaAssetTypeToCategory,
  getSymbolPrecision,
  capabilitiesForSymbol,
  resolveOptionsUnderlying,
  resolveNewsImage
} from '@shared/market-utils'
import { parseCalendarTimestamp } from '@shared/calendar-helpers'
import type { CredentialManager } from './credentials'

const SYMBOL_CATALOG_TTL_MS = 60_000

const DEFAULT_MARKET_NEWS: NewsArticle[] = [
  {
    id: 'news-sample-1',
    title: 'Fed Signals Patience on Rates Amid Resilient Growth and Sticky Inflation',
    summary: 'Federal Reserve officials emphasized a balanced data-dependent stance as labor markets remain tight.',
    url: 'https://www.bloomberg.com',
    source: 'Bloomberg',
    publishedAt: Date.now() - 1000 * 60 * 18,
    category: 'Macro',
    imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=500&q=80'
  },
  {
    id: 'news-sample-2',
    title: 'Bitcoin Holds Above $90,000 as Institutional Spot ETF Net Inflows Accelerate',
    summary: 'Crypto assets saw broad momentum as market liquidity deepened across institutional OTC venues.',
    url: 'https://www.coindesk.com',
    source: 'CoinDesk',
    publishedAt: Date.now() - 1000 * 60 * 45,
    category: 'Crypto',
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&q=80'
  },
  {
    id: 'news-sample-3',
    title: 'Gold Advances Toward Record High as Global Central Banks Boost Reserves',
    summary: 'Spot bullion drew sustained safe-haven demand alongside sovereign treasury diversification.',
    url: 'https://www.reuters.com',
    source: 'Reuters',
    publishedAt: Date.now() - 1000 * 60 * 110,
    category: 'Commodities',
    imageUrl: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=500&q=80'
  },
  {
    id: 'news-sample-4',
    title: 'Semiconductor Index Surges on AI Infrastructure Spending Forecasts',
    summary: 'Chipmakers posted double-digit order growth as hyperscale cloud providers expanded data centers.',
    url: 'https://www.cnbc.com',
    source: 'CNBC',
    publishedAt: Date.now() - 1000 * 60 * 180,
    category: 'Stocks',
    imageUrl: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=500&q=80'
  },
  {
    id: 'news-sample-5',
    title: 'WTI Crude Holds Above $80 Following OPEC+ Supply Quota Roll-Over',
    summary: 'Energy futures stabilized as physical inventory draws in the US countered Chinese demand headwinds.',
    url: 'https://www.wsj.com',
    source: 'Wall Street Journal',
    publishedAt: Date.now() - 1000 * 60 * 250,
    category: 'Energy',
    imageUrl: 'https://images.unsplash.com/photo-1518331647614-7a1f04cd34cf?w=500&q=80'
  },
  {
    id: 'news-sample-6',
    title: 'US 10-Year Treasury Yield Eases Below 4.20% Ahead of CPI Print',
    summary: 'Fixed-income benchmarks rallied across the curve as traders priced in two rate reductions this year.',
    url: 'https://www.ft.com',
    source: 'Financial Times',
    publishedAt: Date.now() - 1000 * 60 * 360,
    category: 'Yields',
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=500&q=80'
  }
]

export class PiaProvider {
  private client: PiaClient | null = null
  private subscriptionCounts = new Map<string, number>()
  private credManager: CredentialManager
  private connectionState: ConnectionState = { status: 'disconnected' }
  private lastLatencyCheck = 0
  private discoveredSymbols = new Map<string, SymbolInfo>()
  private symbolsRefreshPromise: Promise<void> | null = null
  private symbolsRefreshedAt = 0
  private loggedSymbolCount: number | null = null
  private realtimeErrorDetail: string | null = null
  private candleCache = new Map<string, { bars: CandleBar[]; cachedAt: number }>()
  private listeners = new Map<string, Set<(data: any) => void>>()
  // ponytail: 30m in-memory day-open cache prevents redundant rollup queries; upgrade to server 24h ticker feed when backend exposes it.
  private dayOpenCache = new Map<string, { open: number; cachedAt: number }>()
  private dayOpenPending = new Set<string>()
  private sessionBaselinePrices = new Map<string, number>()
  private latestQuotes = new Map<string, PriceQuote>()
  private watchdogTimer: ReturnType<typeof setInterval> | null = null
  private lastActivityAt = 0

  constructor(credManager: CredentialManager) {
    this.credManager = credManager
    this.initializeClient()
  }

  public initializeClient(): void {
    const apiKey = this.credManager.getApiKey()
    const baseUrl = this.credManager.getBaseUrl()
    let wsUrl = this.credManager.getWsUrl()

    if (apiKey) {
      try {
        const u = new URL(wsUrl)
        if (!u.searchParams.has('api_key') || u.searchParams.get('api_key')?.startsWith('wi_live_')) {
          u.searchParams.set('api_key', apiKey)
          wsUrl = u.toString()
        }
      } catch {
        if (!wsUrl.includes('api_key=')) {
          const sep = wsUrl.includes('?') ? '&' : '?'
          wsUrl = `${wsUrl}${sep}api_key=${encodeURIComponent(apiKey)}`
        }
      }
    }

    this.discoveredSymbols.clear()
    this.symbolsRefreshPromise = null
    this.symbolsRefreshedAt = 0
    this.loggedSymbolCount = null
    this.stopWatchdog()

    if (this.client) {
      try {
        this.client.realtime.disconnect()
      } catch {
        // ignore disconnect error
      }
      this.client = null
    }

    if (!apiKey) {
      this.setConnectionState({ status: 'disconnected', error: 'No API key configured' })
      return
    }

    try {
      this.client = new PiaClient({
        apiKey,
        baseUrl,
        wsUrl,
        timeoutMs: 8000,
        maxRetries: 1,
        debug: false
      })

      this.setupRealtimeListeners()
      this.lastLatencyCheck = Date.now()
      this.client.realtime.connect()
      this.startWatchdog()
      this.setConnectionState({ status: 'connecting' })
      this.refreshSymbolsCatalog().catch((err) => {
        console.warn('Initial refreshSymbolsCatalog error:', err)
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to initialize PiaClient:', msg)
      this.setConnectionState({ status: 'error', error: msg })
    }
  }

  public reconnectRealtime(reason = 'manual'): void {
    if (!this.client) return
    console.info(`[PiaProvider] Reconnecting realtime connection (reason: ${reason})...`)
    this.lastActivityAt = Date.now()
    this.setConnectionState({ status: 'reconnecting' })
    try {
      this.client.realtime.disconnect()
    } catch {
      // ignore
    }

    setTimeout(() => {
      if (this.client) {
        this.lastLatencyCheck = Date.now()
        this.client.realtime.connect()
      }
    }, 500)
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer)
    this.lastActivityAt = Date.now()
    this.watchdogTimer = setInterval(() => {
      this.checkWatchdogHealth()
    }, 15000)
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer)
      this.watchdogTimer = null
    }
  }

  private checkWatchdogHealth(): void {
    if (!this.client) return
    const status = this.connectionState.status
    if (status !== 'connected') return

    const activeSymbols = Array.from(this.subscriptionCounts.entries())
      .filter(([, count]) => count > 0)
      .map(([sym]) => sym)

    if (activeSymbols.length === 0) return

    // If any active symbol is a 24/7 crypto symbol, ticks occur continuously.
    // If over 45s without any inbound packet or tick, socket is a zombie / half-open.
    const isAnyCryptoActive = activeSymbols.some((s) => {
      const sym = s.toUpperCase()
      return (
        sym.endsWith('USDT') ||
        (sym.endsWith('USD') && (sym.startsWith('BTC') || sym.startsWith('ETH') || sym.startsWith('SOL')))
      )
    })

    const timeoutThresholdMs = isAnyCryptoActive ? 40000 : 90000
    const elapsed = Date.now() - this.lastActivityAt

    if (elapsed > timeoutThresholdMs) {
      console.warn(
        `[PiaProvider] Realtime watchdog: detected silent stall (${Math.round(elapsed / 1000)}s idle). Triggering recovery reconnect...`
      )
      this.reconnectRealtime('watchdog-timeout')
    }
  }

  private setupRealtimeListeners(): void {
    if (!this.client) return

    const rt = this.client.realtime

    rt.on('connect', () => {
      this.lastActivityAt = Date.now()
      const latency = Date.now() - this.lastLatencyCheck
      this.setConnectionState({
        status: 'connected',
        latencyMs: latency > 0 && latency < 5000 ? latency : 35,
        lastHeartbeat: Date.now()
      })

      // Re-subscribe to all active symbols with refCount > 0
      const activeSymbols = Array.from(this.subscriptionCounts.entries())
        .filter(([, count]) => count > 0)
        .map(([sym]) => sym)

      if (activeSymbols.length > 0) {
        rt.subscribe(activeSymbols)
      }

      this.refreshSymbolsCatalog().catch((err) => {
        console.warn('Connect refreshSymbolsCatalog error:', err)
      })
    })

    rt.on('authenticated', () => {
      this.lastActivityAt = Date.now()
      const latency = Date.now() - this.lastLatencyCheck
      this.setConnectionState({
        status: 'connected',
        latencyMs: latency > 0 && latency < 5000 ? latency : 35,
        lastHeartbeat: Date.now()
      })

      // Ensure all active subscriptions are registered after socket reaches authenticated state
      const activeSymbols = Array.from(this.subscriptionCounts.entries())
        .filter(([, count]) => count > 0)
        .map(([sym]) => sym)

      if (activeSymbols.length > 0) {
        rt.subscribe(activeSymbols)
      }
    })

    rt.on('disconnect', () => {
      this.lastActivityAt = Date.now()
      this.setConnectionState({ status: 'disconnected' })
    })

    rt.on('raw', (payload: unknown) => {
      this.lastActivityAt = Date.now()
      const candidate = this.extractRealtimeError(payload)
      if (candidate) this.realtimeErrorDetail = candidate
    })

    rt.on('error', (err: unknown) => {
      const msg =
        this.formatProviderError(err) || this.realtimeErrorDetail || 'Realtime connection error'
      this.realtimeErrorDetail = null
      console.warn('[PiaProvider] Realtime notice/error:', msg)

      // Only transition connection state to error if the underlying socket is closed.
      // Transient stream errors or notices should not mark an active connection as failed.
      const state = rt.getState()
      const isSocketOpen =
        state === 'AUTHENTICATED' || state === 'CONNECTING' || state === 'AUTHENTICATING'
      if (!isSocketOpen) {
        this.setConnectionState({ status: 'error', error: msg })
      }
    })

    rt.on('snapshot', (snapshot) => {
      this.lastActivityAt = Date.now()
      if (this.connectionState.status !== 'connected') {
        this.setConnectionState({
          status: 'connected',
          latencyMs: this.connectionState.latencyMs ?? 35,
          lastHeartbeat: Date.now()
        })
      }
      if (snapshot && Array.isArray(snapshot.items)) {
        for (const item of snapshot.items) {
          const quote = this.normalizeMarketPrice(item)
          if (quote) {
            this.broadcast(IPC_CHANNELS.MARKET_ON_PRICE_UPDATE, quote)
          }
        }
      }
    })

    rt.on('tick', (tick: MarketPrice) => {
      this.lastActivityAt = Date.now()
      if (this.connectionState.status !== 'connected') {
        this.setConnectionState({
          status: 'connected',
          latencyMs: this.connectionState.latencyMs ?? 35,
          lastHeartbeat: Date.now()
        })
      }
      const quote = this.normalizeMarketPrice(tick)
      if (quote) {
        this.broadcast(IPC_CHANNELS.MARKET_ON_PRICE_UPDATE, quote)
      }
    })
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state
    this.broadcast(IPC_CHANNELS.MARKET_ON_CONNECTION_STATE, state)
  }

  public on(channel: string, listener: (data: any) => void): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set())
    }
    this.listeners.get(channel)!.add(listener)
    return () => {
      this.listeners.get(channel)?.delete(listener)
    }
  }

  private broadcast(channel: string, data: unknown): void {
    const set = this.listeners.get(channel)
    if (set) {
      set.forEach((fn) => {
        try {
          fn(data)
        } catch (e) {
          console.error(e)
        }
      })
    }
  }

  private formatProviderError(error: unknown): string {
    if (error instanceof Error && error.message) {
      const cause = (error as Error & { causeError?: unknown }).causeError
      if (cause)
        return `${error.message.replace('[object Object]', '').trim()}: ${this.formatProviderError(cause)}`
      if (!error.message.includes('[object Object]')) return error.message
      const anyErr = error as any
      if (anyErr.error && typeof anyErr.error === 'object') {
        return anyErr.error.msg || anyErr.error.message || JSON.stringify(anyErr.error)
      }
      return error.message.replace('[object Object]', 'Stream subscription rejected')
    }
    if (typeof error === 'string') return error
    if (error && typeof error === 'object') {
      const value = error as Record<string, unknown>
      for (const key of ['msg', 'message', 'detail', 'error', 'reason']) {
        if (typeof value[key] === 'string' && value[key]) return value[key] as string
        if (value[key] && typeof value[key] === 'object') {
          const nested = value[key] as Record<string, unknown>
          if (typeof nested.msg === 'string') return nested.msg
          if (typeof nested.message === 'string') return nested.message
        }
      }
    }
    return ''
  }

  private extractRealtimeError(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null
    const value = payload as Record<string, unknown>
    if (!('error' in value)) return null
    return (
      this.formatProviderError(value.error) ||
      (typeof value.message === 'string' ? value.message : null)
    )
  }

  private normalizeEconomicValue(value: unknown): string | number | null | undefined {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number'
    ) {
      return value
    }
    return undefined
  }

  private normalizeMarketPrice(raw: MarketPrice): PriceQuote | null {
    if (!raw || !raw.symbol) return null
    const rawValue = raw as MarketPrice & {
      volume?: number
      volume_type?: 'exchange' | 'tick' | 'unavailable'
      volume_available?: boolean
      trade_time_ms?: number
      received_at?: string
    }
    const cleanSymbol = raw.symbol.trim().toUpperCase()
    const price = Number(raw.price)
    if (isNaN(price) || price <= 0) return null

    let rawTs: number | undefined
    if (raw.timestamp !== undefined && raw.timestamp !== null) {
      rawTs = Number(raw.timestamp)
    } else if (rawValue.trade_time_ms !== undefined && rawValue.trade_time_ms !== null) {
      rawTs = Number(rawValue.trade_time_ms)
    } else if (rawValue.received_at) {
      const parsed = Date.parse(rawValue.received_at)
      if (!isNaN(parsed)) rawTs = parsed
    }

    let ts = rawTs !== undefined && !isNaN(rawTs) ? rawTs : Date.now()
    if (ts < 1e11) ts *= 1000

    let change24h: number | undefined
    let change24hPercent: number | undefined

    if (raw.change_24h_pct !== undefined && !isNaN(Number(raw.change_24h_pct))) {
      change24hPercent = Number(raw.change_24h_pct)
      change24h = (price * change24hPercent) / 100
    } else {
      const cached = this.dayOpenCache.get(cleanSymbol)
      let baseline: number | undefined

      if (cached && cached.open > 0) {
        baseline = cached.open
      } else {
        void this.requestDayOpen(cleanSymbol)
        if (!this.sessionBaselinePrices.has(cleanSymbol)) {
          this.sessionBaselinePrices.set(cleanSymbol, price)
        }
        baseline = this.sessionBaselinePrices.get(cleanSymbol)
      }

      if (baseline !== undefined && baseline > 0) {
        change24h = price - baseline
        change24hPercent = ((price - baseline) / baseline) * 100
      }
    }

    const quote: PriceQuote = {
      symbol: cleanSymbol,
      price,
      receivedAt: Date.now(),
      bid: raw.bid !== undefined ? Number(raw.bid) : undefined,
      ask: raw.ask !== undefined ? Number(raw.ask) : undefined,
      timestamp: ts,
      volume24h:
        raw.volume_24h !== undefined
          ? Number(raw.volume_24h)
          : rawValue.volume !== undefined
            ? Number(rawValue.volume)
            : undefined,
      volumeType:
        rawValue.volume_type === 'exchange' ||
        rawValue.volume_type === 'tick' ||
        rawValue.volume_type === 'unavailable'
          ? rawValue.volume_type
          : raw.volume_24h !== undefined
            ? 'exchange'
            : rawValue.volume !== undefined
              ? 'exchange'
              : 'unavailable',
      volumeAvailable:
        rawValue.volume_available ??
        (raw.volume_24h !== undefined || rawValue.volume !== undefined),
      change24h,
      change24hPercent,
      high24h: raw.high_24h !== undefined ? Number(raw.high_24h) : undefined,
      low24h: raw.low_24h !== undefined ? Number(raw.low_24h) : undefined
    }

    this.latestQuotes.set(cleanSymbol, quote)
    return quote
  }

  private async requestDayOpen(symbol: string): Promise<void> {
    const clean = symbol.trim().toUpperCase()
    if (!this.client || this.dayOpenPending.has(clean)) return

    const cached = this.dayOpenCache.get(clean)
    if (cached && Date.now() - cached.cachedAt < 30 * 60 * 1000) {
      return
    }

    this.dayOpenPending.add(clean)
    try {
      const res = await this.client.market.getCandles(clean, {
        timeframe: '1d',
        limit: 1
      })
      if (res && Array.isArray(res.candles) && res.candles.length > 0) {
        const lastCandle = res.candles[res.candles.length - 1]
        const open = Number(lastCandle.open)
        if (!isNaN(open) && open > 0) {
          this.dayOpenCache.set(clean, { open, cachedAt: Date.now() })
          const existing = this.latestQuotes.get(clean)
          if (existing) {
            const change24h = existing.price - open
            const change24hPercent = ((existing.price - open) / open) * 100
            const updated: PriceQuote = {
              ...existing,
              change24h,
              change24hPercent
            }
            this.latestQuotes.set(clean, updated)
            this.broadcast(IPC_CHANNELS.MARKET_ON_PRICE_UPDATE, updated)
          }
        }
      }
    } catch {
      // keep silent on error
    } finally {
      this.dayOpenPending.delete(clean)
    }
  }

  private preloadMajorDayOpens(): void {
    const majors = [
      'EURUSD',
      'BTCUSDT',
      'XAUUSD',
      'USDJPY',
      'GBPUSD',
      'AUDUSD',
      'USDCAD',
      'USDCHF',
      'NZDUSD',
      'ETHUSDT',
      'US30'
    ]
    for (const sym of majors) {
      void this.requestDayOpen(sym)
    }
  }

  // --- Public APIs called by IPC handlers ---

  public async getPrice(symbol: string): Promise<PriceQuote | null> {
    if (!this.client) return null
    try {
      const raw = await this.client.market.getPrice(symbol)
      const quote = this.normalizeMarketPrice(raw)
      if (quote) this.broadcast(IPC_CHANNELS.MARKET_ON_PRICE_UPDATE, quote)
      return quote
    } catch (err) {
      console.warn('[PiaProvider] market.getPrice failed:', this.formatProviderError(err))
      return null
    }
  }

  public async getSession(symbol: string): Promise<MarketSessionData | null> {
    if (!this.client) return null
    try {
      const raw = (await this.client.market.getSession(symbol)) as Record<string, unknown>
      return {
        ...raw,
        symbol,
        status: typeof raw.status === 'string' ? raw.status : undefined,
        exchange: typeof raw.exchange === 'string' ? raw.exchange : undefined,
        sessionOpen:
          typeof raw.session_open === 'boolean'
            ? raw.session_open
            : typeof raw.sessionOpen === 'boolean'
              ? raw.sessionOpen
              : undefined,
        openedAt: typeof raw.opened_at === 'string' ? raw.opened_at : undefined,
        closesAt: typeof raw.closes_at === 'string' ? raw.closes_at : undefined,
        timestamp: Date.now()
      }
    } catch (err) {
      console.warn('[PiaProvider] market.getSession failed:', this.formatProviderError(err))
      return null
    }
  }

  public async getDataQuality(): Promise<MarketDataQualityData | null> {
    if (!this.client) return null
    try {
      const raw = (await this.client.market.getDataQuality()) as Record<string, unknown>
      return {
        ...raw,
        symbol: typeof raw.symbol === 'string' ? raw.symbol : undefined,
        status: typeof raw.status === 'string' ? raw.status : undefined,
        freshnessMs: Number(raw.freshness_ms ?? raw.freshnessMs ?? 0),
        source: typeof raw.source === 'string' ? raw.source : undefined,
        timestamp: Date.now()
      }
    } catch (err) {
      console.warn('[PiaProvider] market.getDataQuality failed:', this.formatProviderError(err))
      return null
    }
  }

  private async getMarketList<T extends ProviderAlertData | MarketSpikeData>(
    method: 'getSpikes' | 'getAlerts' | 'getSmartAlerts'
  ): Promise<T[]> {
    if (!this.client) return []
    try {
      const raw = (await this.client.market[method]()) as unknown
      const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object'
          ? ((raw as Record<string, unknown>).items as unknown[] | undefined) || []
          : []
      return list.filter((item): item is T => Boolean(item && typeof item === 'object'))
    } catch (err) {
      console.warn(`[PiaProvider] market.${method} failed:`, this.formatProviderError(err))
      return []
    }
  }

  public async getSpikes(): Promise<MarketSpikeData[]> {
    return this.getMarketList<MarketSpikeData>('getSpikes')
  }

  public async getAlerts(): Promise<ProviderAlertData[]> {
    return this.getMarketList<ProviderAlertData>('getAlerts')
  }

  public async getSmartAlerts(): Promise<ProviderAlertData[]> {
    return this.getMarketList<ProviderAlertData>('getSmartAlerts')
  }

  public getRateLimitInfo(): RateLimitStatus {
    return {}
  }

  /**
   * Refreshes the discovered symbol catalog using live SDK discovery.
   */
  public async refreshSymbolsCatalog(force = false): Promise<void> {
    if (!this.client) return
    if (this.symbolsRefreshPromise) return this.symbolsRefreshPromise
    if (
      !force &&
      this.discoveredSymbols.size > 0 &&
      Date.now() - this.symbolsRefreshedAt < SYMBOL_CATALOG_TTL_MS
    ) {
      return
    }

    const client = this.client
    const refresh = async (): Promise<void> => {
      // 1. Fetch live multi-asset snapshot & symbol catalog via SDK
      try {
        const pageSize = 500
        const firstPage = await client.market.getSymbols({ limit: pageSize, offset: 0 })
        const allItems = [...(Array.isArray(firstPage.items) ? firstPage.items : [])]
        for (
          let offset = allItems.length;
          offset < (firstPage.total ?? allItems.length);
          offset += pageSize
        ) {
          const page = await client.market.getSymbols({ limit: pageSize, offset })
          if (!Array.isArray(page.items) || page.items.length === 0) break
          allItems.push(...page.items)
        }
        const availableCount = firstPage.total ?? allItems.length
        if (this.loggedSymbolCount !== availableCount) {
          console.log(`Available symbols: ${availableCount}`)
          this.loggedSymbolCount = availableCount
        }
        for (const s of allItems) {
          if (!s.symbol) continue
          const category = mapPiaAssetTypeToCategory(s.asset_type || 'crypto', s.symbol)
          const precision = getSymbolPrecision(s.symbol, category)
          this.discoveredSymbols.set(s.symbol, {
            symbol: s.symbol,
            name: s.name || s.symbol,
            category,
            pricePrecision: s.price_precision ?? precision.pricePrecision,
            volumePrecision: precision.volumePrecision,
            exchange: s.exchange,
            providerSymbol: s.source,
            capabilities: capabilitiesForSymbol(s.symbol, category),
            minMove: s.tick_size ?? precision.minMove
          })
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log('client.market.getSymbols note:', msg)
      }

      // 2. Fetch all tracked assets & snapshot prices from SDK
      try {
        const pricesRes = await client.market.getPrices()
        if (pricesRes && Array.isArray(pricesRes.items)) {
          for (const item of pricesRes.items) {
            if (!item.symbol) continue
            const price = Number(item.price)
            if (!isNaN(price) && price > 0) {
              // The quote is used only to derive provider-supplied symbol precision.
            }
            const category = mapPiaAssetTypeToCategory(item.asset_type || '', item.symbol)
            const session = (item as unknown as { session?: { exchange?: string } }).session
            const exchange = session?.exchange || ''
            const displayName = exchange ? `${item.symbol} · ${exchange}` : item.symbol

            const precision = getSymbolPrecision(item.symbol, category, price)
            const existing = this.discoveredSymbols.get(item.symbol)
            this.discoveredSymbols.set(item.symbol, {
              symbol: item.symbol,
              name:
                existing?.name && existing.name !== existing.symbol ? existing.name : displayName,
              category,
              pricePrecision: precision.pricePrecision,
              volumePrecision: precision.volumePrecision,
              capabilities: capabilitiesForSymbol(item.symbol, category),
              minMove: precision.minMove
            })
          }
        }
      } catch (err: unknown) {
        console.warn('Failed to refresh symbols from getPrices:', err)
      }

      if (this.client === client) {
        this.symbolsRefreshedAt = Date.now()
      }
    }

    this.symbolsRefreshPromise = refresh().finally(() => {
      this.symbolsRefreshPromise = null
    })
    return this.symbolsRefreshPromise
  }

  public async getSymbols(): Promise<SymbolInfo[]> {
    if (this.client) await this.refreshSymbolsCatalog()
    return Array.from(this.discoveredSymbols.values())
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState
  }

  public async getPrices(symbols?: string[]): Promise<PriceQuote[]> {
    if (!this.client) return []

    try {
      const res = await this.client.market.getPrices()
      if (!res || !Array.isArray(res.items)) return []

      // Dynamically discover any assets returned by the provider
      for (const item of res.items) {
        if (!item.symbol) continue
        const price = Number(item.price)
        if (!isNaN(price) && price > 0) {
          // The quote is used only to derive provider-supplied symbol precision.
        }
        if (!this.discoveredSymbols.has(item.symbol)) {
          const category = mapPiaAssetTypeToCategory(item.asset_type || '', item.symbol)
          const session = (item as unknown as { session?: { exchange?: string } }).session
          const exchange = session?.exchange || ''
          const displayName = exchange ? `${item.symbol} · ${exchange}` : item.symbol
          const precision = getSymbolPrecision(item.symbol, category, price)
          this.discoveredSymbols.set(item.symbol, {
            symbol: item.symbol,
            name: displayName,
            category,
            pricePrecision: precision.pricePrecision,
            volumePrecision: precision.volumePrecision,
            capabilities: capabilitiesForSymbol(item.symbol, category),
            minMove: precision.minMove
          })
        }
      }

      let quotes = res.items
        .map((item) => this.normalizeMarketPrice(item))
        .filter((item): item is PriceQuote => item !== null)

      if (symbols && symbols.length > 0) {
        const set = new Set(symbols)
        quotes = quotes.filter((q) => set.has(q.symbol))
      }

      return quotes
    } catch (err) {
      console.warn('getPrices unavailable:', this.formatProviderError(err))
      return []
    }
  }

  public async getCandles(params: {
    symbol: string
    timeframe: Timeframe
    from?: number
    to?: number
    limit?: number
  }): Promise<CandleBar[]> {
    if (!this.client) return []

    const cleanSymbol = params.symbol.trim().toUpperCase()
    const cacheKey = `${cleanSymbol}:${params.timeframe}:${params.limit || 500}:${params.to || 'latest'}`
    const cached = this.candleCache.get(cacheKey)
    // ponytail: memory cache 120s for active candles (instant 0ms chart switches). Live ticks update via WebSocket.
    const ttl = params.to ? 600_000 : 120_000
    if (cached && Date.now() - cached.cachedAt < ttl) {
      return cached.bars.map((b) => ({ ...b }))
    }

    try {
      if (!TIMEFRAMES.includes(params.timeframe)) {
        throw new Error(`Unsupported candle timeframe: ${params.timeframe}`)
      }

      let res: unknown
      try {
        // The runtime API accepts the canonical intervals; published SDK typings lag for 30m/1w.
        const timeframe = params.timeframe as NonNullable<
          Parameters<typeof this.client.market.getCandles>[1]
        >['timeframe']
        res = await this.client.market.getCandles(cleanSymbol, {
          timeframe,
          limit: params.limit,
          since: params.from,
          until: params.to,
          timeoutMs: 8000,
          maxRetries: 1
        } as any)
      } catch (sdkErr) {
        if (params.timeframe === '15m') {
          try {
            const fiveMinBars = await this.getCandles({
              symbol: cleanSymbol,
              timeframe: '5m',
              from: params.from,
              to: params.to,
              limit: Math.min((params.limit ?? 500) * 3, 1500)
            })
            const m15Bars = this.aggregate15mBars(fiveMinBars)
            if (m15Bars.length > 0) {
              this.candleCache.set(cacheKey, { bars: m15Bars, cachedAt: Date.now() })
              return m15Bars
            }
          } catch {}
        }
        if (params.timeframe === '1w') {
          const dailyBars = await this.getCandles({
            symbol: cleanSymbol,
            timeframe: '1d',
            from: params.from,
            to: params.to,
            limit: Math.min((params.limit ?? 500) * 7, 2000)
          })
          const weeklyBars = this.aggregateWeeklyBars(dailyBars)
          if (weeklyBars.length > 0) {
            this.candleCache.set(cacheKey, { bars: weeklyBars, cachedAt: Date.now() })
          }
          return weeklyBars
        }
        throw sdkErr
      }

      const payload = (res || {}) as unknown as Record<string, unknown>
      const rawRows = Array.isArray(payload.candles)
        ? payload.candles
        : Array.isArray(payload.items)
          ? payload.items
          : Array.isArray(payload.data)
            ? payload.data
            : []
      if (rawRows.length === 0) {
        if (params.timeframe === '15m') {
          try {
            const fiveMinBars = await this.getCandles({
              symbol: cleanSymbol,
              timeframe: '5m',
              from: params.from,
              to: params.to,
              limit: Math.min((params.limit ?? 500) * 3, 1500)
            })
            const m15Bars = this.aggregate15mBars(fiveMinBars)
            if (m15Bars.length > 0) {
              this.candleCache.set(cacheKey, { bars: m15Bars, cachedAt: Date.now() })
              return m15Bars
            }
          } catch {}
        }
        if (params.timeframe === '1w') {
          const dailyBars = await this.getCandles({
            symbol: params.symbol,
            timeframe: '1d',
            from: params.from,
            to: params.to,
            limit: Math.min((params.limit ?? 500) * 7, 2000)
          })
          const weeklyBars = this.aggregateWeeklyBars(dailyBars)
          if (weeklyBars.length > 0) {
            this.candleCache.set(cacheKey, { bars: weeklyBars, cachedAt: Date.now() })
          }
          return weeklyBars
        }
        return []
      }
      const rows = rawRows as Candle[]

      // Strict normalization & sorting
      const bars: CandleBar[] = []
      for (const r of rows) {
        let ts = Number(r.time ?? 0)
        if (ts < 1e11) ts *= 1000
        const open = Number(r.open)
        const high = Number(r.high)
        const low = Number(r.low)
        const close = Number(r.close)
        const volume = r.volume !== undefined ? Number(r.volume) : undefined

        if (ts > 0 && !isNaN(open) && !isNaN(high) && !isNaN(low) && !isNaN(close)) {
          bars.push({
            timestamp: ts,
            open,
            high: Math.max(high, open, close),
            low: Math.min(low, open, close),
            close,
            volume: volume !== undefined && !isNaN(volume) ? volume : undefined
          })
        }
      }

      bars.sort((a, b) => a.timestamp - b.timestamp)
      if (bars.length > 0) {
        this.candleCache.set(cacheKey, { bars, cachedAt: Date.now() })
        if (this.candleCache.size > 150) {
          const firstKey = this.candleCache.keys().next().value
          if (firstKey) this.candleCache.delete(firstKey)
        }
      }
      return bars
    } catch (err) {
      // Do not swallow failures as empty data: CandleEngine retries on thrown
      // errors, and an empty array would be misread as "symbol has no history".
      console.warn(`getCandles failed for ${params.symbol} [${params.timeframe}]:`, this.formatProviderError(err))
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  private aggregateWeeklyBars(dailyBars: CandleBar[]): CandleBar[] {
    const sorted = [...dailyBars].sort((a, b) => a.timestamp - b.timestamp)
    const weeklyMap = new Map<number, CandleBar>()
    for (const b of sorted) {
      const d = new Date(b.timestamp)
      const day = d.getUTCDay()
      const diff = (day + 6) % 7
      d.setUTCDate(d.getUTCDate() - diff)
      d.setUTCHours(0, 0, 0, 0)
      const weekStart = d.getTime()
      const existing = weeklyMap.get(weekStart)
      if (!existing) {
        weeklyMap.set(weekStart, {
          timestamp: weekStart,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume
        })
      } else {
        existing.high = Math.max(existing.high, b.high)
        existing.low = Math.min(existing.low, b.low)
        existing.close = b.close
        if (b.volume !== undefined) {
          existing.volume = (existing.volume ?? 0) + b.volume
        }
      }
    }
    return Array.from(weeklyMap.values()).sort((a, b) => a.timestamp - b.timestamp)
  }

  // ponytail: 15m synthesis from 5m bars when backend 15m feed has latency/timeout issues on high-frequency pairs like XAUUSD.
  private aggregate15mBars(fiveMinBars: CandleBar[]): CandleBar[] {
    const sorted = [...fiveMinBars].sort((a, b) => a.timestamp - b.timestamp)
    const m15Map = new Map<number, CandleBar>()
    const FIFTEEN_MIN_MS = 15 * 60 * 1000
    for (const b of sorted) {
      const bucket = Math.floor(b.timestamp / FIFTEEN_MIN_MS) * FIFTEEN_MIN_MS
      const existing = m15Map.get(bucket)
      if (!existing) {
        m15Map.set(bucket, {
          timestamp: bucket,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume
        })
      } else {
        existing.high = Math.max(existing.high, b.high)
        existing.low = Math.min(existing.low, b.low)
        existing.close = b.close
        if (b.volume !== undefined) {
          existing.volume = (existing.volume ?? 0) + b.volume
        }
      }
    }
    return Array.from(m15Map.values()).sort((a, b) => a.timestamp - b.timestamp)
  }

  public async uploadSnapshot(params: {
    image: string
    symbol?: string
    timeframe?: string
  }): Promise<{ id: string; url: string } | null> {
    if (!this.client) return null
    try {
      const res = await (this.client as any).transport.request(
        '/api/v1/charts/snapshot',
        'POST',
        params
      )
      return res?.data || res
    } catch (err) {
      console.error('[PiaProvider] uploadSnapshot failed:', err)
      return null
    }
  }

  public subscribePrice(symbol: string): boolean {
    const clean = symbol?.trim().toUpperCase()
    if (!clean) return false
    const current = this.subscriptionCounts.get(clean) || 0
    this.subscriptionCounts.set(clean, current + 1)
    void this.requestDayOpen(clean)

    if (this.client) {
      const state = this.client.realtime.getState()
      if (state === 'AUTHENTICATED' || state === 'CONNECTING' || state === 'AUTHENTICATING') {
        if (current === 0) {
          this.client.realtime.subscribe(clean)
        }
      } else if (state === 'DISCONNECTED') {
        this.client.realtime.connect()
      }
    }

    // Re-broadcast connection status to ensure late-mounting components receive current state
    if (this.connectionState.status !== 'disconnected') {
      this.broadcast(IPC_CHANNELS.MARKET_ON_CONNECTION_STATE, this.connectionState)
    }

    return true
  }

  public unsubscribePrice(symbol: string): boolean {
    const clean = symbol?.trim().toUpperCase()
    if (!clean) return false
    const current = this.subscriptionCounts.get(clean) || 0
    if (current <= 1) {
      this.subscriptionCounts.delete(clean)
      if (this.client) {
        this.client.realtime.unsubscribe(clean)
      }
    } else {
      this.subscriptionCounts.set(clean, current - 1)
    }
    return true
  }

  public async getCalendar(params?: {
    from?: string
    to?: string
    country?: string
    impact?: string
    limit?: number
  }): Promise<EconomicEvent[]> {
    if (!this.client) return []

    try {
      const res = await this.client.economic.getCalendar({
        impact: params?.impact,
        limit: params?.limit
      })
      const response = res as unknown as {
        events?: Array<Record<string, unknown>>
        items?: Array<Record<string, unknown>>
      }
      const rawList = Array.isArray(response.events)
        ? response.events
        : Array.isArray(response.items)
          ? response.items
          : []
      if (rawList.length === 0) return []
      return rawList.map((item, idx) => {
        const parsed = parseCalendarTimestamp(item)
        return {
          id: typeof item.id === 'string' ? item.id : `econ-${idx}`,
          title:
            typeof item.event === 'string'
              ? item.event
              : typeof item.title === 'string'
                ? item.title
                : 'Economic Release',
          country:
            typeof item.country === 'string'
              ? item.country
              : typeof item.currency === 'string'
                ? item.currency
                : 'USD',
          countryCode: typeof item.country === 'string' ? item.country : 'US',
          date: parsed.date,
          time: parsed.time,
          timestamp: parsed.timestamp,
          impact:
            item.impact === 'high' || item.impact === 'medium' || item.impact === 'low'
              ? item.impact
              : 'none',
          actual: this.normalizeEconomicValue(item.actual),
          forecast: this.normalizeEconomicValue(item.forecast),
          previous: this.normalizeEconomicValue(item.previous)
        }
      })
    } catch (err) {
      console.warn('getCalendar unavailable:', this.formatProviderError(err))
      return []
    }
  }

  public async getNews(params?: { category?: string; limit?: number }): Promise<NewsArticle[]> {
    if (!this.client) {
      if (params?.category && params.category !== 'all') {
        return DEFAULT_MARKET_NEWS.filter(
          (n) => n.category?.toLowerCase() === params.category?.toLowerCase()
        )
      }
      return DEFAULT_MARKET_NEWS
    }

    try {
      const res = await this.client.news.getNews({
        category: params?.category === 'all' ? undefined : params?.category,
        limit: params?.limit
      })
      if (!res || !Array.isArray(res.items) || res.items.length === 0) {
        if (params?.category && params.category !== 'all') {
          return DEFAULT_MARKET_NEWS.filter(
            (n) => n.category?.toLowerCase() === params.category?.toLowerCase()
          )
        }
        return DEFAULT_MARKET_NEWS
      }
      return res.items.map((item: any, idx: number) => ({
        id: item.id || `news-${idx}`,
        title: item.title || item.original_title || 'Market Update',
        summary: item.summary || item.content || '',
        url: item.url || item.original_url || 'https://wign.dev',
        source: item.source_name || item.source || 'Financial Wire',
        publishedAt: item.published_at ? new Date(item.published_at).getTime() : Date.now(),
        category: item.category,
        imageUrl:
          item.media_url ||
          item.image_url ||
          item.imageUrl ||
          item.image ||
          item.thumbnail ||
          item.urlToImage ||
          resolveNewsImage(item.title, item.summary, item.category, idx)
      }))
    } catch (err) {
      console.warn('getNews unavailable:', this.formatProviderError(err))
      return DEFAULT_MARKET_NEWS
    }
  }

  public async getLatestNews(): Promise<NewsArticle[]> {
    if (!this.client) return []
    try {
      const response = (await this.client.news.getLatest()) as Record<string, unknown>
      const items = Array.isArray(response.items)
        ? response.items
        : Array.isArray(response.articles)
          ? response.articles
          : []
      return items.map((item, index) => this.normalizeNewsArticle(item, `latest-${index}`))
    } catch (err) {
      console.warn('[PiaProvider] news.getLatest failed:', this.formatProviderError(err))
      return []
    }
  }

  public async getNewsById(id: string): Promise<NewsDetailData | null> {
    if (!this.client) return null
    try {
      const item = (await this.client.news.getById(id)) as Record<string, unknown>
      return {
        ...item,
        id,
        title: typeof item.title === 'string' ? item.title : undefined,
        summary: typeof item.summary === 'string' ? item.summary : undefined,
        content: typeof item.content === 'string' ? item.content : undefined,
        url: typeof item.url === 'string' ? item.url : undefined,
        source: typeof item.source === 'string' ? item.source : undefined,
        publishedAt:
          typeof item.published_at === 'string' ? new Date(item.published_at).getTime() : undefined
      }
    } catch (err) {
      console.warn('[PiaProvider] news.getById failed:', this.formatProviderError(err))
      return null
    }
  }

  public async getSocialFeed(params?: {
    symbol?: string
    limit?: number
  }): Promise<SocialPostItemData[]> {
    if (!this.client) return []
    try {
      const response = await this.client.social.getFeed({
        symbol: params?.symbol,
        limit: params?.limit ?? 25
      })
      const raw = response as any
      const items = Array.isArray(raw.items)
        ? raw.items
        : Array.isArray(raw.posts)
          ? raw.posts
          : Array.isArray(raw.data)
            ? raw.data
            : Array.isArray(raw)
              ? raw
              : []

      if (items.length === 0) {
        return await this.getSocialPosts(params)
      }

      return items.map((item: any, index: number) => {
        const content = item.text || item.content || ''
        const lower = content.toLowerCase()
        const sentiment: SocialPostItemData['sentiment'] =
          item.sentiment ||
          (lower.includes('bull') || lower.includes('breakout') || lower.includes('surge')
            ? 'bullish'
            : lower.includes('bear') || lower.includes('drop') || lower.includes('fall')
              ? 'bearish'
              : 'neutral')

        const timeStr = item.created_at || item.posted_at || item.timestamp
        const timestamp = timeStr ? new Date(timeStr).getTime() : Date.now()
        const author =
          item.author_display_name || item.author_username || item.author || 'MarketWatcher'
        const handle = item.author_username || item.author_handle || item.handle

        return {
          id: item.id || item.event_id || item.post_id || `feed-${index}-${timestamp}`,
          source: item.platform
            ? item.platform === 'twitter'
              ? 'X / Twitter'
              : item.platform
            : 'X / Twitter',
          author,
          handle: handle ? (handle.startsWith('@') ? handle : `@${handle}`) : undefined,
          content,
          sentiment,
          timestamp,
          symbols: item.symbols || (params?.symbol ? [params.symbol] : []),
          likes: item.like_count || item.likes,
          reposts: item.retweet_count || item.reposts,
          mediaUrls: item.media_urls,
          url: item.url
        }
      })
    } catch (err) {
      console.warn(
        '[PiaProvider] social.getFeed fallback to getSocialPosts:',
        this.formatProviderError(err)
      )
      return await this.getSocialPosts(params)
    }
  }

  public async getEnergySeries(seriesId: string): Promise<EnergySeriesData | null> {
    if (!this.client) return null
    try {
      const response = await this.client.energy.getSeries(seriesId)
      return {
        seriesId: response.series_id,
        name: response.name,
        unit: response.unit,
        data: response.data
      }
    } catch (err) {
      console.warn('[PiaProvider] energy.getSeries failed:', this.formatProviderError(err))
      return null
    }
  }

  public async getEconomicMetadata(
    kind: 'indicators' | 'categories' | 'countries'
  ): Promise<EconomicMetadataData> {
    if (!this.client) return { items: [], total: 0 }
    try {
      const response =
        await this.client.economic[
          `get${kind[0].toUpperCase()}${kind.slice(1)}` as
            'getIndicators' | 'getCategories' | 'getCountries'
        ]()
      const items = Array.isArray(response)
        ? response
        : response &&
            typeof response === 'object' &&
            Array.isArray((response as Record<string, unknown>).items)
          ? ((response as Record<string, unknown>).items as ProviderJson[])
          : []
      return { items, total: items.length }
    } catch (err) {
      console.warn(`[PiaProvider] economic.get${kind} failed:`, this.formatProviderError(err))
      return { items: [], total: 0 }
    }
  }

  private normalizeNewsArticle(item: Record<string, unknown>, fallbackId: string): NewsArticle {
    const raw = item as Record<string, any>
    const source =
      typeof raw.source_name === 'string' && raw.source_name.trim()
        ? raw.source_name
        : typeof raw.source === 'string' && raw.source.trim()
          ? raw.source
          : 'PIA News'
    const imageUrl =
      typeof raw.media_url === 'string' && raw.media_url.trim()
        ? raw.media_url
        : typeof raw.image_url === 'string' && raw.image_url.trim()
          ? raw.image_url
          : typeof raw.imageUrl === 'string' && raw.imageUrl.trim()
            ? raw.imageUrl
            : typeof raw.image === 'string' && raw.image.trim()
              ? raw.image
              : typeof raw.thumbnail === 'string' && raw.thumbnail.trim()
                ? raw.thumbnail
                : resolveNewsImage(
                    typeof raw.title === 'string' ? raw.title : '',
                    typeof raw.summary === 'string' ? raw.summary : '',
                    typeof raw.category === 'string' ? raw.category : ''
                  )

    return {
      id: typeof raw.id === 'string' ? raw.id : fallbackId,
      title: typeof raw.title === 'string' ? raw.title : 'Market News',
      summary: typeof raw.summary === 'string' ? raw.summary : '',
      url:
        typeof raw.url === 'string' && raw.url
          ? raw.url
          : typeof raw.original_url === 'string'
            ? raw.original_url
            : '',
      source,
      publishedAt:
        typeof raw.published_at === 'string' ? new Date(raw.published_at).getTime() : Date.now(),
      category: typeof raw.category === 'string' ? raw.category : undefined,
      imageUrl
    }
  }

  public async getTradingHalts(): Promise<TradingHaltItem[]> {
    if (!this.client) return []
    try {
      const response = await this.client.market.getTradingHalts()
      const items = Array.isArray(response)
        ? response
        : (response as { items?: unknown[] })?.items || []
      return items.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const value = item as Record<string, unknown>
        if (typeof value.symbol !== 'string') return []
        return [
          {
            symbol: value.symbol,
            haltTime: String(value.halt_time ?? value.haltTime ?? ''),
            resumeTime: value.resume_time ? String(value.resume_time) : undefined,
            reason: typeof value.reason === 'string' ? value.reason : undefined,
            exchange: typeof value.exchange === 'string' ? value.exchange : undefined
          }
        ]
      })
    } catch (err) {
      console.warn('[PiaProvider] market.getTradingHalts failed:', this.formatProviderError(err))
      return []
    }
  }

  public async getCorporateActions(): Promise<CorporateActionItem[]> {
    if (!this.client) return []
    try {
      const response = await this.client.market.getCorporateActions()
      const items = Array.isArray(response)
        ? response
        : (response as { items?: unknown[] })?.items || []
      return items.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const value = item as Record<string, unknown>
        if (typeof value.symbol !== 'string') return []
        return [
          {
            symbol: value.symbol,
            type: String(value.type ?? 'other'),
            exDate: String(value.ex_date ?? value.exDate ?? ''),
            paymentDate: value.payment_date ? String(value.payment_date) : undefined,
            amount: typeof value.amount === 'number' ? value.amount : undefined,
            details: typeof value.details === 'string' ? value.details : undefined
          }
        ]
      })
    } catch (err) {
      console.warn(
        '[PiaProvider] market.getCorporateActions failed:',
        this.formatProviderError(err)
      )
      return []
    }
  }

  public async getRealizedVolatility(symbol?: string): Promise<VolatilityData | null> {
    if (!this.client) return null
    try {
      const value = (await this.client.market.getRealizedVolatility(symbol)) as Record<
        string,
        unknown
      >
      const read = (...keys: string[]): number | undefined => {
        const raw = keys
          .map((key) => value[key])
          .find((item) => item !== undefined && item !== null)
        return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
      }
      const result: VolatilityData = {
        symbol: typeof value.symbol === 'string' ? value.symbol : symbol,
        realizedVol10d: read('realized_vol_10d', 'realizedVol10d'),
        realizedVol30d: read('realized_vol_30d', 'realizedVol30d'),
        realizedVol90d: read('realized_vol_90d', 'realizedVol90d'),
        timestamp: Date.now()
      }
      return result.realizedVol10d !== undefined ||
        result.realizedVol30d !== undefined ||
        result.realizedVol90d !== undefined
        ? result
        : null
    } catch (err) {
      console.warn(
        '[PiaProvider] market.getRealizedVolatility failed:',
        this.formatProviderError(err)
      )
      return null
    }
  }

  public async getImpliedVolatility(symbol?: string): Promise<VolatilityData | null> {
    if (!this.client) return null
    try {
      const value = (await this.client.market.getImpliedVolatility(symbol)) as Record<
        string,
        unknown
      >
      const read = (...keys: string[]): number | undefined => {
        const raw = keys
          .map((key) => value[key])
          .find((item) => item !== undefined && item !== null)
        return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
      }
      const result: VolatilityData = {
        symbol: typeof value.symbol === 'string' ? value.symbol : symbol,
        impliedVolAtm: read('implied_vol_atm', 'impliedVolAtm', 'atm_volatility'),
        ivRank: read('iv_rank', 'ivRank'),
        ivPercentile: read('iv_percentile', 'ivPercentile'),
        timestamp: Date.now()
      }
      return result.impliedVolAtm !== undefined ||
        result.ivRank !== undefined ||
        result.ivPercentile !== undefined
        ? result
        : null
    } catch (err) {
      console.warn(
        '[PiaProvider] market.getImpliedVolatility failed:',
        this.formatProviderError(err)
      )
      return null
    }
  }

  public async getMacroMap(params?: {
    indicator?: string
    period?: string
  }): Promise<MacroMapResult | null> {
    if (!this.client) return null
    try {
      const legacyIndicator = params?.indicator === 'gdp_growth' ? 'gdp' : params?.indicator
      const response = await this.client.economic.getMacroMap({
        ...params,
        indicator: legacyIndicator
      })
      const liveResponse = response as typeof response & {
        is_live?: boolean
        updated_at?: string
        unavailable_reason?: string
        error_code?: string
      }
      const countryMeta: Record<
        string,
        { flag: string; region: CountryMacroData['region']; subregion: string }
      > = {
        US: { flag: '🇺🇸', region: 'G7', subregion: 'Americas' },
        GB: { flag: '🇬🇧', region: 'G7', subregion: 'Europe' },
        JP: { flag: '🇯🇵', region: 'G7', subregion: 'Asia' },
        CN: { flag: '🇨🇳', region: 'BRICS', subregion: 'Asia' },
        EU: { flag: '🇪🇺', region: 'Europe', subregion: 'Europe' }
      }
      return {
        indicator: response.indicator,
        indicatorName: response.indicator_name,
        unit: response.unit,
        period: response.period,
        minValue: response.min_value,
        maxValue: response.max_value,
        timeline: response.timeline,
        countries: response.countries.map((country) => {
          const meta = countryMeta[country.country_code] ?? {
            flag: '🌐',
            region: 'Unknown' as const,
            subregion: 'Unknown'
          }
          return {
            id: country.country_code,
            name: country.country_name,
            flag: meta.flag,
            region: meta.region,
            subregion: meta.subregion,
            ticker: country.country_code,
            value: country.value,
            prevValue: country.previous_value,
            change: country.change,
            unit: response.unit,
            period: response.period,
            history: {},
            rank: country.rank
          }
        }),
        total: response.total,
        source: response.source ?? undefined,
        updatedAt: liveResponse.updated_at ? Date.parse(liveResponse.updated_at) : undefined,
        unavailableReason: liveResponse.unavailable_reason,
        errorCode: liveResponse.error_code,
        isLive: liveResponse.is_live === true
      }
    } catch (err) {
      console.warn('[PiaProvider] economic.getMacroMap failed:', this.formatProviderError(err))
      return null
    }
  }

  public async getOrderBook(symbol: string): Promise<OrderBookData | null> {
    if (this.client) {
      try {
        const ob = await this.client.market.getOrderBook(symbol)
        if (ob && ob.bids && ob.asks) {
          const spread =
            ob.asks.length > 0 && ob.bids.length > 0 ? ob.asks[0].price - ob.bids[0].price : 0
          const mid = ob.bids.length > 0 ? ob.bids[0].price : 1
          return {
            symbol,
            bids: ob.bids.map((b) => ({ price: b.price, size: b.size })),
            asks: ob.asks.map((a) => ({ price: a.price, size: a.size })),
            spread: Math.max(0, spread),
            spreadPercent: mid > 0 ? (spread / mid) * 100 : 0,
            timestamp: ob.timestamp || Date.now()
          }
        }
      } catch (err) {
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code?: unknown }).code === 'ORDER_BOOK_NOT_SUPPORTED'
        ) {
          throw err
        }
        console.warn(`[PiaProvider] client.market.getOrderBook(${symbol}) failed, unavailable`, err)
      }
    }
    return null
  }

  public async analyzeIntelligence(
    symbol: string,
    query?: string
  ): Promise<IntelligenceAnalyzeResult | null> {
    if (this.client) {
      try {
        const raw = await this.client.intelligence.analyze({ symbol, query })
        const payload = raw as unknown as Record<string, unknown>
        const nested =
          payload.data && typeof payload.data === 'object'
            ? (payload.data as Record<string, unknown>)
            : payload
        const candidateAnalysis =
          nested.analysis ||
          nested.summary ||
          nested.explanation ||
          nested.content ||
          (nested.reason
            ? `${nested.final_signal ? `Signal: ${String(nested.final_signal).toUpperCase()}. ` : ''}${nested.reason}`
            : '') ||
          (typeof nested.data === 'string' ? nested.data : '')
        const analysis = String(candidateAnalysis ?? '')
        if (analysis.trim()) {
          const sentimentValue = String(nested.sentiment ?? '').toLowerCase()
          const sentiment =
            sentimentValue === 'bullish' || sentimentValue === 'bearish'
              ? sentimentValue
              : 'neutral'
          return {
            symbol: String(nested.symbol || symbol),
            sentiment,
            confidence: typeof nested.confidence === 'number' ? nested.confidence : undefined,
            analysis,
            catalysts: Array.isArray(nested.catalysts)
              ? nested.catalysts.filter((item): item is string => typeof item === 'string')
              : [],
            keyLevels: {
              support: Array.isArray((nested.key_levels as any)?.support)
                ? (nested.key_levels as any).support
                : [],
              resistance: Array.isArray((nested.key_levels as any)?.resistance)
                ? (nested.key_levels as any).resistance
                : []
            },
            generatedAt: nested.generated_at
              ? new Date(String(nested.generated_at)).getTime()
              : Date.now()
          }
        }
      } catch (err) {
        console.warn(`[PiaProvider] client.intelligence.analyze(${symbol}) unavailable`, err)
      }
    }
    return null
  }

  public async getMarketInsights(symbol: string): Promise<MarketInsightResult | null> {
    if (this.client) {
      try {
        const raw = await this.client.intelligence.getInsights(symbol)
        const rawValue = raw as unknown as Record<string, unknown>
        const payload = (
          rawValue.data && typeof rawValue.data === 'object' ? rawValue.data : rawValue
        ) as Record<string, unknown>
        const summary = String(
          payload.summary || payload.explanation || payload.headline || payload.analysis || ''
        )
        if (summary.trim()) {
          const rawSentiment = String(payload.sentiment ?? '').toLowerCase()
          const sentiment =
            rawSentiment === 'bullish' || rawSentiment === 'bearish' ? rawSentiment : 'neutral'
          const drivers = Array.isArray(payload.drivers)
            ? payload.drivers
                .map((item: any) =>
                  typeof item === 'string' ? item : item?.name || item?.term || ''
                )
                .filter(Boolean)
            : []
          return {
            symbol: String(payload.symbol || symbol),
            summary,
            sentiment,
            drivers,
            timestamp: payload.timestamp
              ? new Date(String(payload.timestamp)).getTime()
              : Date.now()
          }
        }
      } catch (err) {
        console.warn(
          `[PiaProvider] client.intelligence.getInsights(${symbol}) failed, unavailable`,
          err
        )
      }
    }
    return null
  }

  public async getOptionsChain(symbol: string): Promise<OptionChainData | null> {
    if (this.client) {
      try {
        console.info(
          `[PiaProvider] Fetching options chain for ${symbol} (underlying ${resolveOptionsUnderlying(symbol)})...`
        )
        const res = await this.client.options.getChain(resolveOptionsUnderlying(symbol))
        if (res && res.contracts && res.underlying_price !== undefined) {
          const calls: OptionContractData[] = []
          const puts: OptionContractData[] = []
          for (const c of res.contracts) {
            const item: OptionContractData = {
              strike: c.strike,
              type: c.option_type?.toLowerCase() === 'put' ? 'put' : 'call',
              expiration: c.expiration,
              bid: c.bid,
              ask: c.ask,
              last: c.last,
              volume: c.volume,
              openInterest: c.open_interest,
              impliedVolatility: c.implied_volatility,
              delta: c.delta,
              gamma: c.gamma,
              theta: c.theta,
              vega: c.vega
            }
            if (item.type === 'put') puts.push(item)
            else calls.push(item)
          }
          return {
            symbol,
            underlyingPrice: res.underlying_price,
            expirations: res.expirations || [],
            calls,
            puts,
            timestamp: Date.now()
          }
        }
      } catch (err) {
        console.warn(`[PiaProvider] client.options.getChain(${symbol}) failed, unavailable`, err)
      }
    }
    return null
  }

  public async getOptionsGex(symbol: string): Promise<OptionGexData | null> {
    if (this.client) {
      try {
        const res = await this.client.options.getGex(resolveOptionsUnderlying(symbol))
        if (res) {
          const levels: OptionGexLevel[] = []
          const posMap = new Map<number, number>()
          const negMap = new Map<number, number>()
          res.major_positive_levels?.forEach((l) => posMap.set(l.strike, l.gex))
          res.major_negative_levels?.forEach((l) => negMap.set(l.strike, l.gex))
          const strikes = Array.from(new Set([...posMap.keys(), ...negMap.keys()])).sort(
            (a, b) => a - b
          )
          for (const s of strikes) {
            const cGex = posMap.get(s) ?? 0
            const pGex = negMap.get(s) ?? 0
            levels.push({
              strike: s,
              callGex: cGex,
              putGex: pGex,
              netGex: cGex - pGex
            })
          }
          return {
            symbol,
            netGex: res.net_gex,
            totalCallGex: res.total_call_gex,
            totalPutGex: res.total_put_gex,
            zeroGammaLevel: res.zero_gamma_level,
            callWall: res.major_positive_levels?.[0]?.strike,
            putWall: res.major_negative_levels?.[0]?.strike,
            levels,
            updatedAt: res.updated_at ? new Date(res.updated_at).getTime() : Date.now()
          }
        }
      } catch (err) {
        console.warn(`[PiaProvider] client.options.getGex(${symbol}) failed, unavailable`, err)
      }
    }
    return null
  }

  public async getOptionsSummary(): Promise<OptionSummaryData | null> {
    if (this.client) {
      try {
        const res = await this.client.options.getSummary()
        const payload = (res && typeof res === 'object' ? res : {}) as Record<string, any>
        const rows = Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload.items)
            ? payload.items
            : []
        const source = rows.length > 0 ? rows[0] : payload
        const totalVolume =
          payload.total_volume ??
          payload.totalVolume ??
          rows.reduce(
            (sum: number, row: any) => sum + Number(row.total_volume ?? row.volume ?? 0),
            0
          )
        const totalOpenInterest =
          payload.total_open_interest ??
          payload.totalOpenInterest ??
          rows.reduce(
            (sum: number, row: any) =>
              sum + Number(row.total_open_interest ?? row.open_interest ?? 0),
            0
          )
        const volumeWeightedPcr = rows.reduce(
          (sum: number, row: any) =>
            sum + Number(row.put_call_ratio ?? 0) * Number(row.total_volume ?? row.volume ?? 0),
          0
        )
        const putCallRatio =
          payload.put_call_ratio ??
          payload.putCallRatio ??
          (Number(totalVolume) > 0
            ? volumeWeightedPcr / Number(totalVolume)
            : source.put_call_ratio)
        const active = Array.isArray(source.most_active_symbols)
          ? source.most_active_symbols
          : Array.isArray(source.mostActiveSymbols)
            ? source.mostActiveSymbols
            : rows
        if (
          totalVolume !== undefined ||
          totalOpenInterest !== undefined ||
          putCallRatio !== undefined ||
          active.length > 0
        ) {
          return {
            totalVolume: totalVolume === undefined ? undefined : Number(totalVolume),
            totalOpenInterest:
              totalOpenInterest === undefined ? undefined : Number(totalOpenInterest),
            putCallRatio: putCallRatio === undefined ? undefined : Number(putCallRatio),
            mostActiveSymbols: active.map((s: any) => ({
              symbol: String(s.symbol),
              volume: Number(s.volume ?? s.total_volume ?? 0),
              pcr: s.put_call_ratio !== undefined ? Number(s.put_call_ratio) : undefined
            }))
          }
        }
      } catch (err) {
        console.warn('[PiaProvider] client.options.getSummary() failed, unavailable', err)
      }
    }
    return null
  }

  public async getFearGreed(): Promise<FearGreedResult | null> {
    if (this.client) {
      try {
        const res = await this.client.macro.getFearGreed()
        if (res) {
          const rawRating = res.rating
          const rating: FearGreedResult['rating'] =
            rawRating === 'Extreme Fear' ||
            rawRating === 'Fear' ||
            rawRating === 'Greed' ||
            rawRating === 'Extreme Greed'
              ? rawRating
              : 'Neutral'
          return {
            score: res.score,
            rating,
            timestamp: typeof res.timestamp === 'number' ? res.timestamp : Date.now(),
            previousClose: res.previous_close,
            previous1Week: res.previous_1_week,
            previous1Month: res.previous_1_month,
            previous1Year: res.previous_1_year
          }
        }
      } catch (err) {
        console.warn('[PiaProvider] client.macro.getFearGreed() failed, unavailable', err)
      }
    }
    return null
  }

  public async getFearGreedHistory(): Promise<FearGreedHistoryItem[]> {
    if (this.client) {
      try {
        const res = await this.client.macro.getFearGreedHistory()
        if (res && res.history) {
          return res.history.map((h) => ({
            score: h.score,
            rating: h.rating,
            timestamp:
              typeof h.timestamp === 'number' ? h.timestamp : new Date(h.timestamp).getTime()
          }))
        }
      } catch (err) {
        console.warn('[PiaProvider] client.macro.getFearGreedHistory() failed, unavailable', err)
      }
    }
    return []
  }

  public async getCot(symbol: string): Promise<CotReportResult | null> {
    if (this.client) {
      try {
        const raw = await this.client.macro.getCot(symbol)
        const wrapped = raw as typeof raw & { data?: unknown; items?: unknown[] }
        const payload = wrapped.data && typeof wrapped.data === 'object' ? wrapped.data : raw
        const payloadRecord = payload as typeof raw & { data?: unknown; items?: unknown[] }
        const reports = Array.isArray(payloadRecord.reports)
          ? payloadRecord.reports
          : Array.isArray(payloadRecord.data)
            ? payloadRecord.data
            : Array.isArray(payloadRecord.items)
              ? payloadRecord.items
              : []
        const res = { ...payloadRecord, reports } as typeof raw
        if (reports.length > 0) {
          const positions = res.reports.map((r) => ({
            category: r.market_name || 'All Categories',
            longPositions: r.non_commercial_long,
            shortPositions: r.non_commercial_short,
            netPositions:
              r.non_commercial_long !== undefined && r.non_commercial_short !== undefined
                ? r.non_commercial_long - r.non_commercial_short
                : undefined
          }))
          return {
            symbol,
            marketCode: res.market_code || symbol,
            asOfDate: res.reports[0]?.report_date || new Date().toISOString().split('T')[0],
            positions,
            commercialNet:
              res.reports[0]?.commercial_long !== undefined &&
              res.reports[0]?.commercial_short !== undefined
                ? res.reports[0].commercial_long - res.reports[0].commercial_short
                : undefined,
            nonCommercialNet:
              res.reports[0]?.non_commercial_long !== undefined &&
              res.reports[0]?.non_commercial_short !== undefined
                ? res.reports[0].non_commercial_long - res.reports[0].non_commercial_short
                : undefined
          }
        }
      } catch (err) {
        console.warn(`[PiaProvider] client.macro.getCot(${symbol}) failed, unavailable`, err)
      }
    }
    return null
  }

  public async getCentralBanks(bank?: string): Promise<CentralBankStanceResult[]> {
    const defaultBanks = ['fed', 'ecb', 'boj', 'boe', 'bi', 'rba']
    const banks = bank ? [bank] : defaultBanks
    const results: CentralBankStanceResult[] = []

    if (this.client) {
      for (const b of banks) {
        try {
          const raw = await this.client.macro.getCentralBankStance(b)
          const wrapped = raw as typeof raw & { data?: typeof raw }
          const res = (
            wrapped.data && typeof wrapped.data === 'object' ? wrapped.data : raw
          ) as typeof raw
          if (res) {
            const rawStance = res.stance?.toLowerCase()
            const stance: CentralBankStanceResult['stance'] =
              rawStance === 'hawkish' ? 'Hawkish' : rawStance === 'dovish' ? 'Dovish' : 'Neutral'
            results.push({
              bank: res.name || b.toUpperCase(),
              code: res.bank || b.toUpperCase(),
              rate: res.rate !== undefined ? `${res.rate.toFixed(2)}%` : '',
              stance,
              summary: res.summary || '',
              lastUpdated: res.last_updated ? new Date(res.last_updated).getTime() : Date.now()
            })
          }
        } catch {
          // fall through
        }
      }
    }

    if (results.length > 0) return results
    return []
  }

  public async getYieldCurve(): Promise<YieldCurveResult | null> {
    if (this.client) {
      try {
        const raw = await this.client.fixedIncome.getYieldCurve()
        const wrapped = raw as typeof raw & {
          data?: unknown
          points?: unknown[]
          bonds?: unknown[]
          as_of?: string
        }
        const payload = wrapped.data && typeof wrapped.data === 'object' ? wrapped.data : raw
        const payloadRecord = payload as typeof raw & {
          points?: unknown[]
          bonds?: unknown[]
          as_of?: string
          spreads?: unknown[]
        }
        const pointRows = Array.isArray(payloadRecord.points)
          ? payloadRecord.points
          : Array.isArray(payloadRecord.bonds)
            ? payloadRecord.bonds
            : []
        const normalizeYield = (p: any) => ({
          tenor: p.tenor || p.symbol || p.name,
          yield: Number(p.yield ?? p.yield_value ?? p.value),
          previousYield: p.previous_yield !== undefined ? Number(p.previous_yield) : undefined
        })
        const points = pointRows
          .map(normalizeYield)
          .filter((p) => p.tenor && Number.isFinite(p.yield))
        if (points.length > 0) {
          return {
            date:
              payloadRecord.date || payloadRecord.as_of || new Date().toISOString().split('T')[0],
            points,
            updatedAt: Date.now()
          }
        }
      } catch (err) {
        console.warn('[PiaProvider] client.fixedIncome.getYieldCurve() failed, unavailable', err)
      }
    }
    return null
  }

  public async getFixedIncomeRate(tenor: string): Promise<FixedIncomeRateData | null> {
    if (!this.client) return null
    try {
      const raw = (await this.client.fixedIncome.getRate(tenor)) as Record<string, unknown>
      return {
        ...raw,
        tenor,
        rate: Number(raw.rate ?? raw.yield ?? raw.value),
        timestamp: Date.now()
      }
    } catch (err) {
      console.warn('[PiaProvider] fixedIncome.getRate failed:', this.formatProviderError(err))
      return null
    }
  }

  public async getFixedIncomeHistory(tenor: string): Promise<FixedIncomeHistoryData | null> {
    if (!this.client) return null
    try {
      const raw = (await this.client.fixedIncome.getHistory(tenor)) as Record<string, unknown>
      const values = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.data) ? raw.data : []
      const points = values.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const value = item as Record<string, unknown>
        const date = String(value.date ?? value.timestamp ?? '')
        const numeric = Number(value.value ?? value.rate ?? value.yield)
        return date && Number.isFinite(numeric) ? [{ date, value: numeric }] : []
      })
      return {
        tenor,
        date: raw.date || raw.as_of || new Date().toISOString().split('T')[0],
        points,
        timestamp: Date.now()
      }
    } catch (err) {
      console.warn('[PiaProvider] fixedIncome.getHistory failed:', this.formatProviderError(err))
      return null
    }
  }

  public async getYieldSpreads(): Promise<YieldSpreadResult | null> {
    if (this.client) {
      try {
        const raw = await this.client.fixedIncome.getSpreads()
        const payload = (raw?.data && typeof raw.data === 'object' ? raw.data : raw) as any
        const rows = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.items)
              ? payload.items
              : []
        const valueOf = (short: string, long: string) => {
          const normalized = `${short}${long}`.toLowerCase()
          const row = rows.find((item: any) =>
            String(item?.spread ?? item?.name ?? '')
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '')
              .includes(normalized)
          )
          return row?.value !== undefined ? Number(row.value) : undefined
        }
        const spread2y10y = payload?.spread2y10y ?? payload?.spread_2y_10y ?? valueOf('2y', '10y')
        const spread3m10y = payload?.spread3m10y ?? payload?.spread_3m_10y ?? valueOf('3m', '10y')
        if (spread2y10y !== undefined || spread3m10y !== undefined) {
          return {
            date: new Date().toISOString().split('T')[0],
            spread2Y10Y: Number(spread2y10y),
            spread3M10Y: Number(spread3m10y),
            isInverted: spread2y10y !== undefined ? Number(spread2y10y) < 0 : undefined,
            updatedAt: Date.now()
          }
        }
      } catch (err) {
        console.warn('[PiaProvider] client.fixedIncome.getSpreads() failed, unavailable', err)
      }
    }
    return null
  }

  public async getGeoEvents(): Promise<GeoSignalEventItem[]> {
    if (this.client) {
      try {
        const raw = await this.client.geosignals.getEvents()
        const res = (raw as typeof raw & { data?: typeof raw }).data || raw
        const events = res.events || res.items || []
        if (events.length > 0) {
          return (events as any[]).map((e: any) => {
            let category: GeoSignalEventItem['category'] = 'conflict'
            const catLower = String(e.category || '').toLowerCase()
            if (catLower.includes('sanction')) {
              category = 'sanctions'
            } else if (catLower.includes('trade')) {
              category = 'trade'
            } else if (catLower.includes('supply') || catLower.includes('maritime')) {
              category = 'maritime'
            } else if (catLower.includes('election') || catLower.includes('diplomat')) {
              category = 'diplomatic'
            }
            const rawSev = typeof e.severity === 'string' ? e.severity.toLowerCase() : ''
            const numSev = Number(e.severity ?? e.severity_score ?? 0)
            const severity: GeoSignalEventItem['severity'] =
              rawSev === 'critical' || numSev > 7 || numSev > 0.7
                ? 'critical'
                : rawSev === 'high' || numSev > 5 || numSev > 0.5
                  ? 'high'
                  : rawSev === 'medium' || numSev > 3 || numSev > 0.3
                    ? 'medium'
                    : 'low'
            return {
              id: String(e.id || e.event_id || Math.random().toString()),
              title: String(e.title || ''),
              region: String(e.region || e.country || 'Global'),
              severity,
              category,
              summary: String(e.summary || ''),
              affectedAssets: Array.isArray(e.impacted_assets)
                ? e.impacted_assets
                : Array.isArray(e.affected_assets)
                  ? e.affected_assets
                  : [],
              timestamp: e.published_at
                ? new Date(e.published_at).getTime()
                : e.timestamp
                  ? new Date(e.timestamp).getTime()
                  : Date.now(),
              source: String(e.source || 'Geopolitical Intelligence Bureau')
            }
          })
        }
      } catch (err) {
        console.warn('[PiaProvider] client.geosignals.getEvents() failed, unavailable', err)
      }
    }
    return []
  }

  public async getGeoMap(): Promise<GeoSignalsMapRegion[]> {
    if (this.client) {
      try {
        const raw = await this.client.geosignals.getMap()
        const wrapped = raw as typeof raw & { data?: unknown; items?: unknown[] }
        const payload = wrapped.data && typeof wrapped.data === 'object' ? wrapped.data : raw
        const payloadRecord = payload as typeof raw & {
          layers?: unknown[]
          items?: unknown[]
          data?: unknown
        }
        const layers = Array.isArray(payloadRecord.layers)
          ? payloadRecord.layers
          : Array.isArray(payloadRecord.items)
            ? payloadRecord.items
            : Array.isArray(payloadRecord.data)
              ? payloadRecord.data
              : []
        if (layers.length > 0) {
          return layers.map((l) => {
            const numScore = Number(l.risk_level ?? l.max_severity ?? l.avg_severity ?? 0)
            const normalizedScore = numScore <= 1.0 ? numScore * 10 : numScore
            const riskLevel: GeoSignalsMapRegion['riskLevel'] =
              normalizedScore > 7
                ? 'critical'
                : normalizedScore > 5
                  ? 'high'
                  : normalizedScore > 3
                    ? 'elevated'
                    : 'moderate'
            return {
              region: l.region || l.key || 'Global',
              riskLevel,
              activeHotspots: l.active_conflicts ?? (l.signal_count ? Number(l.signal_count) : 0),
              chokepointStatus: l.chokepoints_status
                ? Object.entries(l.chokepoints_status)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', ')
                : 'Normal maritime flow'
            }
          })
        }
      } catch (err) {
        console.warn('[PiaProvider] client.geosignals.getMap() failed, unavailable', err)
      }
    }
    return []
  }

  public async getGeoAssetImpacts(): Promise<GeoAssetImpactItem[]> {
    if (this.client) {
      try {
        const raw = await this.client.geosignals.getAssetImpacts()
        const wrapped = raw as typeof raw & { data?: unknown; items?: unknown[] }
        const payload = wrapped.data && typeof wrapped.data === 'object' ? wrapped.data : raw
        const payloadRecord = payload as typeof raw & {
          assets?: unknown[]
          items?: unknown[]
          data?: unknown
        }
        const assets = Array.isArray(payloadRecord.assets)
          ? payloadRecord.assets
          : Array.isArray(payloadRecord.items)
            ? payloadRecord.items
            : Array.isArray(payloadRecord.data)
              ? payloadRecord.data
              : []
        if (assets.length > 0) {
          return assets.map((a) => {
            const rawScore = Number(a.risk_score ?? a.max_severity ?? a.avg_severity ?? 0)
            const riskScore = rawScore <= 1.0 ? Math.round(rawScore * 100) : Math.round(rawScore)
            const supplyDisruptionRisk: GeoAssetImpactItem['supplyDisruptionRisk'] =
              riskScore > 65 || (a.affected_supply_pct && a.affected_supply_pct > 15)
                ? 'high'
                : riskScore > 35
                  ? 'medium'
                  : 'low'
            return {
              symbol: a.symbol || a.asset || '',
              riskScore,
              primaryDriver:
                a.primary_risk_driver || a.category || 'Regional tension / Supply chain',
              supplyDisruptionRisk
            }
          })
        }
      } catch (err) {
        console.warn('[PiaProvider] client.geosignals.getAssetImpacts() failed, unavailable', err)
      }
    }
    return []
  }

  public async getEnergyDashboard(): Promise<EnergyDashboardData | null> {
    if (this.client) {
      try {
        const raw = await this.client.energy.getDashboard()
        const wrapped = raw as typeof raw & { data?: unknown; items?: unknown[] }
        const payload = wrapped.data && typeof wrapped.data === 'object' ? wrapped.data : raw
        const payloadRecord = payload as typeof raw & {
          items?: unknown[]
          data?: unknown
          crude_oil?: any
          natural_gas?: any
        }
        const items = Array.isArray(payloadRecord.items)
          ? payloadRecord.items
          : Array.isArray(payloadRecord.data)
            ? payloadRecord.data
            : []
        const find = (terms: string[]) =>
          items.find((x: any) =>
            terms.some((t) =>
              String(x?.series_id || x?.name || '')
                .toLowerCase()
                .includes(t)
            )
          )
        const wti = find(['wti', 'usoil'])
        const brent = find(['brent', 'ukoil'])
        const gas = find(['henry', 'natural gas'])
        const prices = await this.client.market.getPrices()
        const marketItems = Array.isArray(prices?.items) ? prices.items : []
        const marketPrice = (symbols: string[]) =>
          marketItems.find((item: any) => symbols.includes(String(item.symbol).toUpperCase()))
            ?.price
        const wtiPrice =
          payloadRecord.crude_oil?.wti_price ?? wti?.latest_value ?? marketPrice(['USOIL', 'WTI'])
        const brentPrice =
          payloadRecord.crude_oil?.brent_price ??
          brent?.latest_value ??
          marketPrice(['UKOIL', 'BRENT'])
        const storage = payloadRecord.natural_gas?.storage_bcf ?? gas?.latest_value
        const data = {
          ...payloadRecord,
          crude_oil: {
            ...payloadRecord.crude_oil,
            wti_price: wtiPrice,
            brent_price: brentPrice,
            spread:
              payloadRecord.crude_oil?.spread ??
              (wtiPrice !== undefined && brentPrice !== undefined
                ? wtiPrice - brentPrice
                : undefined)
          },
          natural_gas: {
            ...payloadRecord.natural_gas,
            henry_hub_price:
              payloadRecord.natural_gas?.henry_hub_price ??
              marketPrice(['NATGAS', 'NGAS', 'HENRYHUB']),
            storage_bcf: storage
          }
        }
        if (data) {
          return {
            wtiPrice: data.crude_oil?.wti_price,
            brentPrice: data.crude_oil?.brent_price,
            wtiBrentSpread: data.crude_oil?.spread,
            crudeChangePct: data.crude_oil?.weekly_change_pct,
            henryHubPrice: data.natural_gas?.henry_hub_price,
            naturalGasStorageBcf: data.natural_gas?.storage_bcf,
            storageVs5YrAvgPct: data.natural_gas?.storage_change,
            crackSpread321: data.refining_margins?.['321'],
            refiningMarginStatus: undefined,
            updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now()
          }
        }
      } catch (err) {
        console.warn('[PiaProvider] client.energy.getDashboard() failed, unavailable', err)
      }
    }
    return null
  }

  public async getSecFilings(params?: {
    symbol?: string
    formType?: string
    limit?: number
  }): Promise<SecFilingItemData[]> {
    if (this.client) {
      try {
        const raw = await this.client.sec.getFilings({
          symbol: params?.symbol,
          form_type: params?.formType,
          limit: params?.limit ?? 20
        })
        const wrapped = raw as typeof raw & { data?: unknown; filings?: unknown }
        const payload = wrapped.data && typeof wrapped.data === 'object' ? wrapped.data : raw
        const payloadRecord = payload as typeof raw & { data?: unknown; filings?: unknown }
        const items = Array.isArray(payload)
          ? payload
          : Array.isArray(payloadRecord.items)
            ? payloadRecord.items
            : Array.isArray(payloadRecord.filings)
              ? payloadRecord.filings
              : Array.isArray(payloadRecord.data)
                ? payloadRecord.data
                : []
        return items.map((i) => {
          const rawForm = i.form_type
          const formType: SecFilingItemData['formType'] =
            rawForm === '10-K' ||
            rawForm === '10-Q' ||
            rawForm === '8-K' ||
            rawForm === '4' ||
            rawForm === '13F'
              ? rawForm
              : 'OTHER'
          const companyName = i.company_name || i.raw_json?.companyName || i.title || i.ticker || ''
          return {
            id: i.id || i.accession_number,
            symbol: i.symbol || i.ticker,
            companyName,
            formType,
            filedDate: i.filing_date,
            title: i.title || `${rawForm} Filing - ${companyName || i.ticker || ''}`,
            description: i.description || `Form ${rawForm} submitted to SEC EDGAR database.`,
            reportUrl: i.report_url || i.document_url,
            isInsiderTrade: rawForm === '4'
          }
        })
      } catch (err) {
        console.warn('[PiaProvider] client.sec.getFilings() failed, unavailable', err)
      }
    }
    return []
  }

  public async getSecCompany(symbol: string): Promise<SecCompanyData | null> {
    if (!this.client) return null
    try {
      const raw = (await this.client.sec.getCompany(symbol)) as Record<string, unknown>
      return {
        ...raw,
        symbol,
        name:
          typeof raw.name === 'string'
            ? raw.name
            : typeof raw.company_name === 'string'
              ? raw.company_name
              : undefined,
        cik: typeof raw.cik === 'string' ? raw.cik : undefined,
        timestamp: Date.now()
      }
    } catch (err) {
      console.warn('[PiaProvider] sec.getCompany failed:', this.formatProviderError(err))
      return null
    }
  }

  public async createWsTicket(): Promise<WsTicketData | null> {
    if (!this.client) return null
    try {
      const raw = await this.client.ws.createTicket()
      return {
        ticket: raw.ticket,
        expiresIn: raw.expires_in,
        wsUrl: raw.ws_url
      }
    } catch (err) {
      console.warn('[PiaProvider] ws.createTicket failed:', this.formatProviderError(err))
      return null
    }
  }

  public async getSocialPosts(params?: {
    symbol?: string
    limit?: number
  }): Promise<SocialPostItemData[]> {
    if (this.client) {
      try {
        const res = await this.client.social.getPosts({
          symbol: params?.symbol,
          limit: params?.limit ?? 25
        })
        if (res && res.items) {
          return res.items.map((p, idx) => {
            const lower = p.text.toLowerCase()
            const sentiment: SocialPostItemData['sentiment'] =
              lower.includes('bull') || lower.includes('breakout')
                ? 'bullish'
                : lower.includes('bear') || lower.includes('drop')
                  ? 'bearish'
                  : 'neutral'
            return {
              id: `soc-${idx}-${Date.now()}`,
              source: p.platform || 'Twitter / X',
              author: p.author_display_name || p.author_username || 'MarketWatcher',
              handle: p.author_username ? `@${p.author_username}` : undefined,
              content: p.text,
              sentiment,
              timestamp: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
              likes: p.like_count,
              reposts: p.retweet_count,
              symbols: params?.symbol ? [params.symbol] : [],
              mediaUrls: p.media_urls && p.media_urls.length > 0 ? p.media_urls : undefined,
              url: p.url
            }
          })
        }
      } catch (err) {
        console.warn('[PiaProvider] client.social.getPosts() failed, unavailable', err)
      }
    }
    return []
  }
}
