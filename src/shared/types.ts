/**
 * PIA Terminal - Shared Domain Type Definitions
 * Shared between Main, Preload, and Renderer processes.
 */

export type AssetCategory = 'crypto' | 'forex' | 'metals' | 'commodities' | 'indices' | 'stocks'

export interface MarketCapabilities {
  quote: boolean
  candles: boolean
  trades: boolean
  orderBook: boolean
  options: boolean
  gex: boolean
}

export interface SymbolInfo {
  symbol: string
  name: string
  category: AssetCategory
  exchange?: string
  providerSymbol?: string
  capabilities: MarketCapabilities
  baseAsset?: string
  quoteAsset?: string
  pricePrecision: number
  volumePrecision: number
  minMove: number
}

export const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

/**
 * Normalized candlestick bar.
 * Timestamps are guaranteed to be UTC milliseconds.
 */
export interface CandleBar {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
  turnover?: number
}

/**
 * Realtime price quote / tick update.
 */
export interface PriceQuote {
  symbol: string
  price: number
  bid?: number
  ask?: number
  timestamp: number
  volume24h?: number
  volumeType?: 'exchange' | 'tick' | 'unavailable'
  volumeAvailable?: boolean
  change24h?: number
  change24hPercent?: number
  high24h?: number
  low24h?: number
}

export type ConnectionStatus =
  'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface ConnectionState {
  status: ConnectionStatus
  latencyMs?: number
  lastHeartbeat?: number
  error?: string
}

/**
 * Domain coordinate point for drawings.
 * Guaranteed to be invariant across zoom, pan, and window resize.
 */
export interface DomainPoint {
  timestamp: number
  value: number
}

export interface DrawingStyle {
  color?: string
  lineWidth?: number
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  fillColor?: string
  fillOpacity?: number
  fontSize?: number
  fontColor?: string
  text?: string
}

export interface DrawingItem {
  id: string
  type: string
  symbol: string
  timeframe?: string
  points: DomainPoint[]
  style: DrawingStyle
  lock?: boolean
  visible?: boolean
  createdAt: number
  updatedAt: number
}

export interface IndicatorConfig {
  id: string
  name: string // e.g. 'EMA', 'SMA', 'BOLL', 'RSI', 'MACD', 'VOL'
  paneId: string // 'candle_pane' or unique pane id
  calcParams: (number | string)[]
  visible: boolean
  styles?: Record<string, unknown>
}

export interface WatchlistGroup {
  id: string
  name: string
  symbols: string[]
}

export type EconomicImpact = 'high' | 'medium' | 'low' | 'none'

export interface EconomicEvent {
  id: string
  title: string
  country: string
  countryCode?: string
  date: string
  time: string
  timestamp?: number
  impact: EconomicImpact
  actual?: string | number | null
  forecast?: string | number | null
  previous?: string | number | null
  unit?: string
}

export interface NewsArticle {
  id: string
  title: string
  summary: string
  url: string
  source: string
  publishedAt: number
  category?: string
  imageUrl?: string
}

export interface PriceAlert {
  id: string
  symbol: string
  targetPrice: number
  direction: 'above' | 'below' | 'cross'
  triggered: boolean
  createdAt: number
  triggeredAt?: number
  note?: string
}

export interface PaperPosition {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  entryPrice: number
  size: number
  timestamp: number
  stopLoss?: number
  takeProfit?: number
}

export interface PaperAccount {
  balance: number
  initialBalance: number
  currency: string
  positions: PaperPosition[]
  updatedAt: number
}

export interface CredentialStatus {
  hasApiKey: boolean
  isSecureStorage: boolean
  baseUrl: string
  wsUrl: string
}

export interface OrderBookLevel {
  price: number
  size: number
  total?: number
}

export interface OrderBookData {
  symbol: string
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  spread: number
  spreadPercent: number
  timestamp: number
}

export interface KeyLevels {
  support: number[]
  resistance: number[]
}

export interface IntelligenceAnalyzeResult {
  symbol: string
  sentiment: 'bullish' | 'bearish' | 'neutral'
  confidence?: number
  analysis: string
  catalysts: string[]
  keyLevels: KeyLevels
  generatedAt: number
}

export interface MarketInsightResult {
  symbol: string
  summary: string
  sentiment: 'bullish' | 'bearish' | 'neutral'
  drivers: string[]
  timestamp: number
}

export interface OptionContractData {
  strike: number
  type: 'call' | 'put'
  expiration: string
  bid?: number
  ask?: number
  last?: number
  volume?: number
  openInterest?: number
  impliedVolatility?: number
  delta?: number
  gamma?: number
  theta?: number
  vega?: number
}

export interface OptionChainData {
  symbol: string
  underlyingPrice: number
  expirations: string[]
  calls: OptionContractData[]
  puts: OptionContractData[]
  timestamp: number
}

export interface OptionGexLevel {
  strike: number
  callGex?: number
  putGex?: number
  netGex?: number
}

export interface OptionGexData {
  symbol: string
  netGex?: number
  totalCallGex?: number
  totalPutGex?: number
  zeroGammaLevel?: number
  callWall?: number
  putWall?: number
  levels: OptionGexLevel[]
  updatedAt: number
}

export interface OptionSummaryData {
  totalVolume?: number
  totalOpenInterest?: number
  putCallRatio?: number
  mostActiveSymbols: Array<{ symbol: string; volume?: number; pcr?: number }>
}

export interface FearGreedResult {
  score: number
  rating: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
  timestamp: number
  previousClose?: number
  previous1Week?: number
  previous1Month?: number
  previous1Year?: number
}

export interface FearGreedHistoryItem {
  score: number
  rating: string
  timestamp: number
}

export interface CotPositionItem {
  category: string
  longPositions?: number
  shortPositions?: number
  netPositions?: number
  changeLong?: number
  changeShort?: number
}

export interface CotReportResult {
  symbol: string
  marketCode: string
  asOfDate: string
  positions: CotPositionItem[]
  commercialNet?: number
  nonCommercialNet?: number
}

export interface CentralBankStanceResult {
  bank: string
  code: string
  rate: string
  stance: 'Hawkish' | 'Dovish' | 'Neutral'
  nextMeetingDate?: string
  summary: string
  lastUpdated: number
}

export interface YieldPoint {
  tenor: string
  yield: number
  previousYield?: number
}

export interface YieldCurveResult {
  date: string
  points: YieldPoint[]
  updatedAt: number
}

export interface YieldSpreadResult {
  date: string
  spread2Y10Y?: number
  spread3M10Y?: number
  isInverted?: boolean
  updatedAt: number
}

export interface GeoSignalEventItem {
  id: string
  title: string
  region: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: 'conflict' | 'sanctions' | 'maritime' | 'diplomatic' | 'trade'
  summary: string
  affectedAssets: string[]
  timestamp: number
  source?: string
}

export interface GeoSignalsMapRegion {
  region: string
  riskLevel: 'critical' | 'high' | 'elevated' | 'moderate' | 'low'
  activeHotspots: number
  chokepointStatus: string
}

export interface GeoAssetImpactItem {
  symbol: string
  riskScore: number
  primaryDriver: string
  supplyDisruptionRisk: 'high' | 'medium' | 'low'
}

export interface EnergyDashboardData {
  wtiPrice?: number
  brentPrice?: number
  wtiBrentSpread?: number
  crudeChangePct?: number
  henryHubPrice?: number
  naturalGasStorageBcf?: number
  storageVs5YrAvgPct?: number
  crackSpread321?: number
  refiningMarginStatus?: 'expanding' | 'compressing' | 'stable'
  updatedAt: number
}

export interface SecFilingItemData {
  id: string
  symbol: string
  companyName: string
  formType: '10-K' | '10-Q' | '8-K' | '4' | '13F' | 'OTHER'
  filedDate: string
  title: string
  description: string
  reportUrl?: string
  isInsiderTrade?: boolean
}

export interface SocialPostItemData {
  id: string
  source: string
  author: string
  handle?: string
  avatarUrl?: string
  content: string
  sentiment: 'bullish' | 'bearish' | 'neutral'
  timestamp: number
  likes?: number
  reposts?: number
  symbols: string[]
  mediaUrls?: string[]
  url?: string
}

export type ChartType = 'candle_solid' | 'candle_stroke' | 'line' | 'area'

export interface ChartLayoutData {
  id: string
  name: string
  symbol: string
  timeframe: Timeframe
  chartType: ChartType
  indicators: IndicatorConfig[]
  activePanel?: string
  isFavorite?: boolean
  description?: string
  createdAt: number
  updatedAt: number
}

export interface TerminalTabItem {
  id: string
  title: string
  type: 'chart' | 'hub' | 'macromaps' | 'controlpanel'
  layoutId?: string
  symbol: string
  timeframe: Timeframe
  customName?: string
  macroMetric?: MacroMetricType
}

export type MacroMetricType =
  'inflation' | 'interest_rate' | 'gdp_growth' | 'unemployment' | 'debt_to_gdp'

export interface CountryMacroData {
  id: string // ISO2 code e.g. 'US'
  name: string
  flag: string
  region: 'G20' | 'G7' | 'BRICS' | 'Europe' | 'Americas' | 'Asia' | 'Africa' | 'Oceania' | 'Unknown'
  subregion?: string
  ticker: string // e.g. 'USIRYY'
  value?: number
  prevValue?: number
  change?: number
  unit: string // e.g. '%'
  period: string // e.g. 'Jul 2026'
  history: Record<number, number> // year -> value
  rank?: number
}

export interface MacroMapResult {
  indicator: string
  indicatorName: string
  unit: string
  period: string
  minValue?: number | null
  maxValue?: number | null
  timeline?: string[]
  countries: CountryMacroData[]
  total: number
  source?: string
  updatedAt?: number
  unavailableReason?: string
  errorCode?: string
  isLive: boolean
}

export interface TradingHaltItem {
  symbol: string
  haltTime: string
  resumeTime?: string
  reason?: string
  exchange?: string
}

export interface CorporateActionItem {
  symbol: string
  type: 'dividend' | 'split' | 'earnings' | 'spinoff' | string
  exDate: string
  paymentDate?: string
  amount?: number
  details?: string
}

export interface VolatilityData {
  symbol?: string
  realizedVol10d?: number
  realizedVol30d?: number
  realizedVol90d?: number
  impliedVolAtm?: number
  ivRank?: number
  ivPercentile?: number
  timestamp?: number
}

export type ProviderJson = Record<string, unknown>

export interface MarketSessionData extends ProviderJson {
  symbol: string
  status?: string
  exchange?: string
  sessionOpen?: boolean
  openedAt?: string
  closesAt?: string
  timestamp: number
}

export interface MarketDataQualityData extends ProviderJson {
  symbol?: string
  status?: string
  freshnessMs?: number
  source?: string
  timestamp: number
}

export interface MarketSpikeData extends ProviderJson {
  symbol?: string
  price?: number
  changePercent?: number
  direction?: string
  timestamp: number
}

export interface ProviderAlertData extends ProviderJson {
  id?: string
  symbol?: string
  type?: string
  message?: string
  triggeredAt?: number
  status?: string
}

export interface NewsDetailData extends ProviderJson {
  id: string
  title?: string
  summary?: string
  content?: string
  url?: string
  source?: string
  publishedAt?: number
}

export interface EnergySeriesData {
  seriesId: string
  name: string
  unit: string
  data: Array<{ date: string; value: number }>
}

export interface EconomicMetadataData extends ProviderJson {
  items: ProviderJson[]
  total: number
}

export interface RateLimitStatus {
  limit?: number
  remaining?: number
  resetSeconds?: number
  dailyLimit?: number
  dailyRemaining?: number
}

export interface FixedIncomeRateData extends ProviderJson {
  tenor: string
  rate?: number
  timestamp: number
}

export interface FixedIncomeHistoryData extends ProviderJson {
  tenor: string
  points: Array<{ date: string; value: number }>
  timestamp: number
}

export interface SecCompanyData extends ProviderJson {
  symbol: string
  name?: string
  cik?: string
  timestamp: number
}

export interface WsTicketData {
  ticket: string
  expiresIn?: number
  wsUrl?: string
}
