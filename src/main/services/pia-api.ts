import { EventEmitter } from 'node:events'

export interface PiaApiOptions {
  apiKey: string
  baseUrl: string
  wsUrl: string
}

type Json = Record<string, any>

class PiaRealtime extends EventEmitter {
  private socket: any = null
  private state = 'DISCONNECTED'
  private subscriptions: string[] = []
  constructor(private readonly wsUrl: string, private readonly apiKey: string) { super() }
  getState(): string { return this.state }
  connect(): void {
    if (this.socket || typeof (globalThis as any).WebSocket !== 'function') return
    const Ws = (globalThis as any).WebSocket
    this.state = 'CONNECTING'
    this.socket = new Ws(this.wsUrl)
    this.socket.onopen = () => this.socket.send(JSON.stringify({ action: 'auth', api_key: this.apiKey }))
    this.socket.onmessage = (event: any) => {
      let payload: any
      try { payload = JSON.parse(String(event.data)) } catch { return }
      this.emit('raw', payload)
      if (payload?.event === 'authenticated' || payload?.type === 'authenticated' || payload?.status === 'authenticated') {
        this.state = 'AUTHENTICATED'; this.emit('connect')
        if (this.subscriptions.length) this.sendSubscribe(this.subscriptions)
        return
      }
      const tick = payload?.data?.symbol ? payload.data : payload?.data || payload
      if (tick?.symbol && tick?.price !== undefined) this.emit('tick', tick)
    }
    this.socket.onerror = (error: any) => this.emit('error', error)
    this.socket.onclose = () => { this.state = 'DISCONNECTED'; this.socket = null; this.emit('disconnect') }
  }
  disconnect(): void { try { this.socket?.close() } catch {} this.socket = null; this.state = 'DISCONNECTED' }
  subscribe(symbols: string | string[]): void {
    this.subscriptions = [...new Set([...this.subscriptions, ...(Array.isArray(symbols) ? symbols : [symbols])])]
    if (this.state === 'AUTHENTICATED') this.sendSubscribe(Array.isArray(symbols) ? symbols : [symbols])
  }
  unsubscribe(symbol: string): void {
    this.subscriptions = this.subscriptions.filter((item) => item !== symbol)
    if (this.state === 'AUTHENTICATED') this.socket?.send(JSON.stringify({ action: 'unsubscribe', symbols: [symbol] }))
  }
  private sendSubscribe(symbols: string[]): void { this.socket?.send(JSON.stringify({ action: 'subscribe', symbols })) }
}

class ApiResource {
  constructor(protected readonly api: PiaApiClient) {}
  protected get(path: string, params?: Json): Promise<any> { return this.api.request(path, 'GET', undefined, params) }
  protected post(path: string, body: Json): Promise<any> { return this.api.request(path, 'POST', body) }
}

class MarketApi extends ApiResource {
  getSymbols = (params?: Json) => this.get('/api/v1/market/symbols', params)
  getPrices = () => this.get('/api/v1/market/prices')
  getPrice = (symbol: string) => this.get(`/api/v1/market/prices/${encodeURIComponent(symbol)}`)
  getSession = (symbol: string) => this.get(`/api/v1/market/session/${encodeURIComponent(symbol)}`)
  getDataQuality = () => this.get('/api/v1/market/data-quality')
  getSpikes = () => this.get('/api/v1/market/spikes')
  getAlerts = () => this.get('/api/v1/market/alerts')
  getSmartAlerts = () => this.get('/api/v1/market/smart-alerts')
  getTradingHalts = () => this.get('/api/v1/market/trading-halts')
  getCorporateActions = () => this.get('/api/v1/market/corporate-actions')
  getRealizedVolatility = (symbol?: string) => this.get('/api/v1/market/realized-volatility', symbol ? { symbol } : undefined)
  getImpliedVolatility = (symbol?: string) => this.get('/api/v1/market/implied-volatility', symbol ? { symbol } : undefined)
  getCandles = (symbol: string, params?: Json) => this.get(`/api/v1/market/history/${encodeURIComponent(symbol)}`, { resolution: params?.timeframe || params?.resolution || '1m', limit: params?.limit || 1000, before: params?.before })
  getOrderBook = (symbol: string) => this.get(`/api/v1/market/orderbook/${encodeURIComponent(symbol)}`)
}

class EconomicApi extends ApiResource {
  getCalendar = (params?: Json) => this.get('/api/v1/economic/calendar', params)
  getMacroMap = (params?: Json) => this.get('/api/v1/economic/map', params)
  getIndicators = () => this.get('/api/v1/economic/indicators')
  getCategories = () => this.get('/api/v1/economic/categories')
  getCountries = () => this.get('/api/v1/economic/countries')
}

class NewsApi extends ApiResource {
  getNews = (params?: Json) => this.get('/api/v1/news', params)
  getLatest = () => this.get('/api/v1/news/latest')
  getById = (id: string) => this.get(`/api/v1/news/${encodeURIComponent(id)}`)
}

class SocialApi extends ApiResource {
  getFeed = (params?: Json) => this.get('/api/v1/social/feed', params)
  getPosts = (params?: Json) => this.get('/api/v1/social/posts', params)
}

class OptionsApi extends ApiResource {
  getChain = (symbol: string) => this.get('/api/v1/options/chain', { symbol })
  getGex = (symbol: string) => this.get('/api/v1/options/gex', { symbol })
  getSummary = () => this.get('/api/v1/options/summary')
}

class MacroApi extends ApiResource {
  getFearGreed = () => this.get('/api/v1/fear-greed')
  getFearGreedHistory = () => this.get('/api/v1/fear-greed/history')
  getCot = (symbol: string) => this.get(`/api/v1/cot/symbol/${encodeURIComponent(symbol)}`)
  getCentralBankStance = (bank: string) => this.get(`/api/v1/central-banks/${encodeURIComponent(bank)}/stance`)
}

class FixedIncomeApi extends ApiResource {
  getYieldCurve = () => this.get('/api/v1/fixed-income/yield-curve', { country: 'US' })
  getSpreads = () => this.get('/api/v1/fixed-income/spreads', { country: 'US' })
  getRate = (tenor: string) => this.get(`/api/v1/fixed-income/rates/${encodeURIComponent(tenor)}`)
  getHistory = (tenor: string) => this.get(`/api/v1/rates/history/${encodeURIComponent(tenor)}`, { country: 'US' })
}

class GeoApi extends ApiResource {
  getEvents = () => this.get('/api/v1/geosignals')
  getMap = () => this.get('/api/v1/geosignals/map')
  getAssetImpacts = () => this.get('/api/v1/geosignals/assets')
}

class EnergyApi extends ApiResource {
  getDashboard = () => this.get('/api/v1/energy/dashboard')
  getSeries = (id: string) => this.get('/api/v1/energy/series', { id })
}

class SecApi extends ApiResource {
  getFilings = (params?: Json) => this.get('/api/v1/sec/filings', params)
  getCompany = (symbol: string) => this.get(`/api/v1/sec/companies/${encodeURIComponent(symbol)}`)
}

class IntelligenceApi extends ApiResource {
  analyze = (body: Json) => this.post('/api/v1/intelligence/analyze', body)
  getInsights = (symbol: string) => this.get(`/api/v1/market/insights/${encodeURIComponent(symbol)}`)
}

export class PiaApiClient {
  readonly market: MarketApi
  readonly economic: EconomicApi
  readonly news: NewsApi
  readonly social: SocialApi
  readonly options: OptionsApi
  readonly macro: MacroApi
  readonly fixedIncome: FixedIncomeApi
  readonly geosignals: GeoApi
  readonly energy: EnergyApi
  readonly sec: SecApi
  readonly intelligence: IntelligenceApi
  readonly realtime: PiaRealtime
  constructor(private readonly config: PiaApiOptions) {
    this.market = new MarketApi(this); this.economic = new EconomicApi(this); this.news = new NewsApi(this)
    this.social = new SocialApi(this); this.options = new OptionsApi(this); this.macro = new MacroApi(this)
    this.fixedIncome = new FixedIncomeApi(this); this.geosignals = new GeoApi(this); this.energy = new EnergyApi(this)
    this.sec = new SecApi(this); this.intelligence = new IntelligenceApi(this)
    this.realtime = new PiaRealtime(config.wsUrl, config.apiKey)
  }
  async request(path: string, method: string, body?: Json, params?: Json): Promise<any> {
    const url = new URL(path, this.config.baseUrl.endsWith('/') ? this.config.baseUrl : `${this.config.baseUrl}/`)
    if (params) for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
    const response = await fetch(url, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}`, 'x-api-key': this.config.apiKey, 'User-Agent': 'PIA-Desktop' },
      body: method === 'GET' ? undefined : JSON.stringify(body || {})
    })
    const text = await response.text()
    let payload: any = null
    try { payload = text ? JSON.parse(text) : null } catch { payload = text }
    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error || `HTTP ${response.status}`) as Error & { statusCode?: number; endpoint?: string; code?: string }
      error.statusCode = response.status; error.endpoint = path; error.code = payload?.code
      throw error
    }
    return payload
  }
}
