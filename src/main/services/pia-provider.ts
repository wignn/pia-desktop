/**
 * PIA Terminal - PiaProvider Service
 * Coordinates @piaa/sdk REST and Realtime streaming data, subscription reference counting,
 * heartbeat monitoring, and timestamp normalization.
 */

import { PiaClient } from '@piaa/sdk'
import type { MarketPrice, Candle } from '@piaa/sdk'
import type { BrowserWindow } from 'electron'
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
  capabilitiesForSymbol
} from '@shared/market-utils'
import type { CredentialManager } from './credentials'

export class PiaProvider {
  private client: PiaClient | null = null
  private subscriptionCounts = new Map<string, number>()
  private getWindow: () => BrowserWindow | null
  private credManager: CredentialManager
  private connectionState: ConnectionState = { status: 'disconnected' }
  private lastLatencyCheck = 0
  private discoveredSymbols = new Map<string, SymbolInfo>()
  private realtimeErrorDetail: string | null = null

  constructor(credManager: CredentialManager, getWindow: () => BrowserWindow | null) {
    this.credManager = credManager
    this.getWindow = getWindow
    this.initializeClient()
  }

  public initializeClient(): void {
    const apiKey = this.credManager.getApiKey()
    const baseUrl = this.credManager.getBaseUrl()
    const wsUrl = this.credManager.getWsUrl()

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
        debug: false
      })

      this.setupRealtimeListeners()
      this.lastLatencyCheck = Date.now()
      this.client.realtime.connect()
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

  private setupRealtimeListeners(): void {
    if (!this.client) return

    const rt = this.client.realtime

    rt.on('connect', () => {
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

    rt.on('disconnect', () => {
      this.setConnectionState({ status: 'disconnected' })
    })

    rt.on('raw', (payload: unknown) => {
      const candidate = this.extractRealtimeError(payload)
      if (candidate) this.realtimeErrorDetail = candidate
    })

    rt.on('error', (err: unknown) => {
      const msg =
        this.formatProviderError(err) || this.realtimeErrorDetail || 'Realtime connection error'
      this.realtimeErrorDetail = null
      this.setConnectionState({ status: 'error', error: msg })
    })

    rt.on('tick', (tick: MarketPrice) => {
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

  private broadcast(channel: string, data: unknown): void {
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }

  private formatProviderError(error: unknown): string {
    if (error instanceof Error && error.message) {
      const cause = (error as Error & { causeError?: unknown }).causeError
      if (cause)
        return `${error.message.replace('[object Object]', '').trim()}: ${this.formatProviderError(cause)}`
      if (!error.message.includes('[object Object]')) return error.message
    }
    if (typeof error === 'string') return error
    if (error && typeof error === 'object') {
      const value = error as Record<string, unknown>
      for (const key of ['message', 'detail', 'error', 'reason']) {
        if (typeof value[key] === 'string' && value[key]) return value[key] as string
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
    }
    const price = Number(raw.price)
    if (isNaN(price) || price <= 0) return null

    let ts = Number(raw.timestamp || Date.now())
    if (ts < 1e11) ts *= 1000

    return {
      symbol: raw.symbol,
      price,
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
        rawValue.volume_type === 'exchange' || rawValue.volume_type === 'tick' || rawValue.volume_type === 'unavailable'
          ? rawValue.volume_type
          : raw.volume_24h !== undefined
            ? 'exchange'
            : rawValue.volume !== undefined
              ? 'exchange'
              : 'unavailable',
      volumeAvailable:
        rawValue.volume_available ?? (raw.volume_24h !== undefined || rawValue.volume !== undefined),
      change24h:
        raw.change_24h_pct !== undefined ? (price * Number(raw.change_24h_pct)) / 100 : undefined,
      change24hPercent: raw.change_24h_pct !== undefined ? Number(raw.change_24h_pct) : undefined,
      high24h: raw.high_24h !== undefined ? Number(raw.high_24h) : undefined,
      low24h: raw.low_24h !== undefined ? Number(raw.low_24h) : undefined
    }
  }

  // --- Public APIs called by IPC handlers ---

  public async getPrice(symbol: string): Promise<PriceQuote | null> {
    if (!this.client) return null
    try {
      const raw = await this.client.market.getPrice(symbol)
      return this.normalizeMarketPrice(raw)
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
    return this.client?.getRateLimitInfo() || {}
  }

  /**
   * Refreshes the discovered symbol catalog using live SDK discovery.
   */
  public async refreshSymbolsCatalog(): Promise<void> {
    if (!this.client) return

    // 1. Fetch live multi-asset snapshot & symbol catalog via SDK
    try {
      const pageSize = 500
      const firstPage = await this.client.market.getSymbols({ limit: pageSize, offset: 0 })
      const allItems = [...(Array.isArray(firstPage.items) ? firstPage.items : [])]
      for (let offset = allItems.length; offset < (firstPage.total ?? allItems.length); offset += pageSize) {
        const page = await this.client.market.getSymbols({ limit: pageSize, offset })
        if (!Array.isArray(page.items) || page.items.length === 0) break
        allItems.push(...page.items)
      }
      console.log(`Available symbols: ${firstPage?.total ?? allItems.length}`)
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
      const pricesRes = await this.client.market.getPrices()
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
            name: existing?.name && existing.name !== existing.symbol ? existing.name : displayName,
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

    try {
      const tf = ['1m', '5m', '15m', '1h', '4h', '1d'].includes(params.timeframe)
        ? (params.timeframe as '1m' | '5m' | '15m' | '1h' | '4h' | '1d')
        : '1m'

      const res = await this.client.market.getCandles(params.symbol, {
        timeframe: tf,
        limit: params.limit,
        since: params.from,
        until: params.to
      })

      if (!res || !Array.isArray(res.candles) || res.candles.length === 0) return []

      // Strict normalization & sorting
      const bars: CandleBar[] = []
      for (const r of res.candles as Candle[]) {
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
      return bars
    } catch (err) {
      console.warn('getCandles unavailable:', this.formatProviderError(err))
      return []
    }
  }

  public subscribePrice(symbol: string): boolean {
    const clean = symbol?.trim().toUpperCase()
    if (!clean) return false
    const current = this.subscriptionCounts.get(clean) || 0
    this.subscriptionCounts.set(clean, current + 1)

    if (current === 0 && this.client) {
      const state = this.client.realtime.getState()
      if (state === 'AUTHENTICATED' || state === 'CONNECTING') {
        this.client.realtime.subscribe(clean)
      }
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
      return rawList.map((item, idx) => ({
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
        date: typeof item.date === 'string' ? item.date : new Date().toISOString().split('T')[0],
        time: typeof item.time === 'string' ? item.time : '12:30',
        timestamp: Date.now(),
        impact:
          item.impact === 'high' || item.impact === 'medium' || item.impact === 'low'
            ? item.impact
            : 'none',
        actual: this.normalizeEconomicValue(item.actual),
        forecast: this.normalizeEconomicValue(item.forecast),
        previous: this.normalizeEconomicValue(item.previous)
      }))
    } catch (err) {
      console.warn('getCalendar unavailable:', this.formatProviderError(err))
      return []
    }
  }

  public async getNews(params?: { category?: string; limit?: number }): Promise<NewsArticle[]> {
    if (!this.client) return []

    try {
      const res = await this.client.news.getNews({
        category: params?.category,
        limit: params?.limit
      })
      if (!res || !Array.isArray(res.items) || res.items.length === 0) return []
      return res.items.map((item, idx) => ({
        id: item.id || `news-${idx}`,
        title: item.title || 'Market Update',
        summary: item.summary || '',
        url: item.url || 'https://wign.dev',
        source: item.source || 'Financial Wire',
        publishedAt: item.published_at ? new Date(item.published_at).getTime() : Date.now()
      }))
    } catch (err) {
      console.warn('getNews unavailable:', this.formatProviderError(err))
      return []
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
      const items = Array.isArray(response.posts) ? response.posts : []
      return items.map((item, index) => ({
        id: item.id || `feed-${index}-${item.posted_at}`,
        source: 'Social Feed',
        author: item.author || 'MarketWatcher',
        handle: item.author_handle ? `@${item.author_handle}` : undefined,
        content: item.content,
        sentiment: item.sentiment || 'neutral',
        timestamp: item.posted_at ? new Date(item.posted_at).getTime() : Date.now(),
        symbols: item.symbols || (params?.symbol ? [params.symbol] : []),
        mediaUrls: item.media_urls,
        url: undefined
      }))
    } catch (err) {
      console.warn('[PiaProvider] social.getFeed failed:', this.formatProviderError(err))
      return []
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
    return {
      id: typeof item.id === 'string' ? item.id : fallbackId,
      title: typeof item.title === 'string' ? item.title : 'Market News',
      summary: typeof item.summary === 'string' ? item.summary : '',
      url: typeof item.url === 'string' ? item.url : '',
      source: typeof item.source === 'string' ? item.source : 'PIA News',
      publishedAt:
        typeof item.published_at === 'string' ? new Date(item.published_at).getTime() : Date.now()
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
      const indicator = params?.indicator === 'gdp_growth' ? 'gdp' : params?.indicator
      const response = await this.client.economic.getMacroMap({ ...params, indicator })
      const liveResponse = response as typeof response & {
        is_live?: boolean
        updated_at?: string
        unavailable_reason?: string
        error_code?: string
      }
      const countryMeta: Record<string, { flag: string; region: CountryMacroData['region']; subregion: string }> = {
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
        source: response.source,
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
        const res = await this.client.intelligence.analyze({ symbol, query })
        if (res && res.analysis) {
          const sentiment =
            res.sentiment === 'bullish' || res.sentiment === 'bearish' ? res.sentiment : 'neutral'
          return {
            symbol: res.symbol || symbol,
            sentiment,
            confidence: res.confidence,
            analysis: res.analysis,
            catalysts: res.catalysts || [],
            keyLevels: {
              support: res.key_levels?.support || [],
              resistance: res.key_levels?.resistance || []
            },
            generatedAt: res.generated_at ? new Date(res.generated_at).getTime() : Date.now()
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
        const res = await this.client.intelligence.getInsights(symbol)
        if (res && res.summary) {
          const sentiment =
            res.sentiment === 'bullish' || res.sentiment === 'bearish' ? res.sentiment : 'neutral'
          return {
            symbol: res.symbol || symbol,
            summary: res.summary,
            sentiment,
            drivers: res.drivers || [],
            timestamp: res.timestamp ? new Date(res.timestamp).getTime() : Date.now()
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
        const res = await this.client.options.getChain(symbol)
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
        const res = await this.client.options.getGex(symbol)
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
        if (res) {
          return {
            totalVolume: res.total_volume,
            totalOpenInterest: res.total_open_interest,
            putCallRatio: res.put_call_ratio,
            mostActiveSymbols: (res.most_active_symbols || []).map((s) => ({
              symbol: s.symbol,
              volume: s.volume
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
          const res = (wrapped.data && typeof wrapped.data === 'object' ? wrapped.data : raw) as typeof raw
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
        const wrapped = raw as typeof raw & { data?: unknown; bonds?: unknown[]; as_of?: string }
        const payload = wrapped.data && typeof wrapped.data === 'object' ? wrapped.data : raw
        const payloadRecord = payload as typeof raw & { points?: unknown[]; bonds?: unknown[]; as_of?: string }
        const pointRows = Array.isArray(payloadRecord.points)
          ? payloadRecord.points
          : Array.isArray(payloadRecord.bonds)
            ? payloadRecord.bonds
            : []
        const res = { ...payloadRecord, points: pointRows, date: payloadRecord.date || payloadRecord.as_of } as typeof raw
        if (res && res.points) {
          return {
            date: res.date || new Date().toISOString().split('T')[0],
            points: res.points.map((p) => ({
              tenor: p.tenor,
              yield: p.yield,
              previousYield: undefined
            })),
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
        const wrapped = raw as typeof raw & { data?: unknown; items?: unknown[] }
        const payload = wrapped.data && typeof wrapped.data === 'object' ? wrapped.data : raw
        const rows = Array.isArray(payload) ? payload : Array.isArray((payload as any)?.data) ? (payload as any).data : Array.isArray((payload as any)?.items) ? (payload as any).items : []
        const findSpread = (short: string, long: string) => {
          const row = rows.find((item: any) => String(item?.spread || '').toUpperCase().includes(`${short}-${long}`))
          return row ? Number(row.value) : undefined
        }
        const spread2y10y = (payload as any)?.spread2y10y ?? (payload as any)?.spread_2y_10y ?? findSpread('2Y', '10Y')
        const spread3m10y = (payload as any)?.spread3m10y ?? (payload as any)?.spread_3m_10y ?? findSpread('3M', '10Y')
        if (spread2y10y !== undefined || spread3m10y !== undefined) {
          return {
            date: new Date().toISOString().split('T')[0],
            spread2Y10Y: spread2y10y,
            spread3M10Y: spread3m10y,
            isInverted: spread2y10y !== undefined ? spread2y10y < 0 : undefined,
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
          return events.map((e) => {
            let category: GeoSignalEventItem['category'] = 'conflict'
            if (e.category === 'sanction') {
              category = 'sanctions'
            } else if (e.category === 'trade') {
              category = 'trade'
            } else if (e.category === 'supply_chain') {
              category = 'maritime'
            } else if (e.category === 'election') {
              category = 'diplomatic'
            }
            return {
              id: e.id,
              title: e.title,
              region: e.region,
              severity: e.severity,
              category,
              summary: e.summary,
              affectedAssets: e.impacted_assets || [],
              timestamp: e.published_at ? new Date(e.published_at).getTime() : Date.now(),
              source: 'Geopolitical Intelligence Bureau'
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
        const payloadRecord = payload as typeof raw & { layers?: unknown[]; items?: unknown[]; data?: unknown }
        const layers = Array.isArray(payloadRecord.layers) ? payloadRecord.layers : Array.isArray(payloadRecord.items) ? payloadRecord.items : Array.isArray(payloadRecord.data) ? payloadRecord.data : []
        if (layers.length > 0) {
          return layers.map((l) => {
            const riskLevel: GeoSignalsMapRegion['riskLevel'] =
              l.risk_level > 7
                ? 'critical'
                : l.risk_level > 5
                  ? 'high'
                  : l.risk_level > 3
                    ? 'elevated'
                    : 'moderate'
            return {
              region: l.region,
              riskLevel,
              activeHotspots: l.active_conflicts,
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
        const payloadRecord = payload as typeof raw & { assets?: unknown[]; items?: unknown[]; data?: unknown }
        const assets = Array.isArray(payloadRecord.assets) ? payloadRecord.assets : Array.isArray(payloadRecord.items) ? payloadRecord.items : Array.isArray(payloadRecord.data) ? payloadRecord.data : []
        if (assets.length > 0) {
          return assets.map((a) => {
            const supplyDisruptionRisk: GeoAssetImpactItem['supplyDisruptionRisk'] =
              a.affected_supply_pct && a.affected_supply_pct > 15 ? 'high' : 'medium'
            return {
              symbol: a.symbol,
              riskScore: a.risk_score,
              primaryDriver: a.primary_risk_driver,
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
        const payloadRecord = payload as typeof raw & { items?: unknown[]; data?: unknown }
        const items = Array.isArray(payloadRecord.items)
          ? payloadRecord.items
          : Array.isArray(payloadRecord.data)
            ? payloadRecord.data
            : []
        const find = (terms: string[]) => items.find((x: any) => terms.some((t) => String(x?.series_id || x?.name || '').toLowerCase().includes(t)))
        const wti = find(['wti'])
        const brent = find(['brent'])
        const gas = find(['henry', 'natural gas'])
        const data = { ...payloadRecord, crude_oil: { ...payloadRecord.crude_oil, wti_price: payloadRecord.crude_oil?.wti_price ?? wti?.latest_value, brent_price: payloadRecord.crude_oil?.brent_price ?? brent?.latest_value }, natural_gas: { ...payloadRecord.natural_gas, henry_hub_price: payloadRecord.natural_gas?.henry_hub_price ?? gas?.latest_value } }
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
            rawForm === '10-K' || rawForm === '10-Q' || rawForm === '8-K' || rawForm === '4' || rawForm === '13F'
              ? rawForm
              : 'OTHER'
          return {
            id: i.id || i.accession_number,
            symbol: i.symbol || i.ticker,
            companyName: i.company_name || i.title,
            formType,
            filedDate: i.filing_date,
            title: `${rawForm} Filing - ${i.company_name || i.ticker || ''}`,
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
