/**
 * PIA Terminal - IPC Validation Schemas & Communication Contracts
 * Strict Zod runtime validation ensures safe cross-process data boundary.
 */

import { z } from 'zod'
import type {
  CandleBar,
  PriceQuote,
  ConnectionState,
  DrawingItem,
  IndicatorConfig,
  WatchlistGroup,
  EconomicEvent,
  NewsArticle,
  CredentialStatus,
  SymbolInfo,
  PriceAlert,
  PaperAccount,
  OrderBookData,
  IntelligenceAnalyzeResult,
  MarketInsightResult,
  OptionChainData,
  OptionGexData,
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
  SecCompanyData,
  SocialPostItemData,
  ChartLayoutData,
  MacroMapResult,
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
  FixedIncomeRateData,
  FixedIncomeHistoryData,
  WsTicketData
} from './types'

// Channel constant definitions
export const IPC_CHANNELS = {
  // Market & Candlesticks
  MARKET_GET_SYMBOLS: 'market:get-symbols',
  MARKET_GET_CANDLES: 'market:get-candles',
  MARKET_GET_PRICES: 'market:get-prices',
  MARKET_GET_PRICE: 'market:get-price',
  MARKET_GET_SESSION: 'market:get-session',
  MARKET_GET_DATA_QUALITY: 'market:get-data-quality',
  MARKET_GET_SPIKES: 'market:get-spikes',
  MARKET_GET_ALERTS: 'market:get-alerts',
  MARKET_GET_SMART_ALERTS: 'market:get-smart-alerts',
  MARKET_GET_TRADING_HALTS: 'market:get-trading-halts',
  MARKET_GET_CORPORATE_ACTIONS: 'market:get-corporate-actions',
  MARKET_GET_VOLATILITY: 'market:get-volatility',
  MARKET_SUBSCRIBE_PRICE: 'market:subscribe-price',
  MARKET_UNSUBSCRIBE_PRICE: 'market:unsubscribe-price',
  MARKET_ON_PRICE_UPDATE: 'market:on-price-update',
  MARKET_ON_CONNECTION_STATE: 'market:on-connection-state',

  // Order Book & Microstructure
  ORDERBOOK_GET: 'orderbook:get',

  // Intelligence & AI Analysis
  INTELLIGENCE_ANALYZE: 'intelligence:analyze',
  INTELLIGENCE_GET_INSIGHTS: 'intelligence:get-insights',

  // Options & Derivatives
  OPTIONS_GET_CHAIN: 'options:get-chain',
  OPTIONS_GET_GEX: 'options:get-gex',
  OPTIONS_GET_SUMMARY: 'options:get-summary',

  // Macro & Central Bank Economics
  MACRO_GET_FEAR_GREED: 'macro:get-fear-greed',
  MACRO_GET_FEAR_GREED_HISTORY: 'macro:get-fear-greed-history',
  MACRO_GET_COT: 'macro:get-cot',
  MACRO_GET_CENTRAL_BANKS: 'macro:get-central-banks',
  MACRO_GET_MAP: 'macro:get-map',

  // Fixed Income & Sovereign Rates
  FIXED_INCOME_GET_YIELD_CURVE: 'fixed-income:get-yield-curve',
  FIXED_INCOME_GET_SPREADS: 'fixed-income:get-spreads',
  FIXED_INCOME_GET_RATE: 'fixed-income:get-rate',
  FIXED_INCOME_GET_HISTORY: 'fixed-income:get-history',

  // Geopolitical Signals
  GEOSIGNALS_GET_EVENTS: 'geosignals:get-events',
  GEOSIGNALS_GET_MAP: 'geosignals:get-map',
  GEOSIGNALS_GET_ASSET_IMPACTS: 'geosignals:get-asset-impacts',

  // Energy Markets
  ENERGY_GET_DASHBOARD: 'energy:get-dashboard',
  ENERGY_GET_SERIES: 'energy:get-series',

  // SEC EDGAR Filings
  SEC_GET_FILINGS: 'sec:get-filings',
  SEC_GET_COMPANY: 'sec:get-company',

  // WebSocket authentication
  WS_CREATE_TICKET: 'ws:create-ticket',

  // Social Intelligence Feed
  SOCIAL_GET_POSTS: 'social:get-posts',
  SOCIAL_GET_FEED: 'social:get-feed',

  // Chart Layouts
  LAYOUTS_GET_ALL: 'layouts:get-all',
  LAYOUTS_GET: 'layouts:get',
  LAYOUTS_SAVE: 'layouts:save',
  LAYOUTS_DELETE: 'layouts:delete',

  // Drawings & Annotations
  DRAWINGS_GET: 'drawings:get',
  DRAWINGS_SAVE: 'drawings:save',
  DRAWINGS_DELETE: 'drawings:delete',
  DRAWINGS_CLEAR: 'drawings:clear',

  // Indicators & Chart Settings
  CHART_GET_INDICATORS: 'chart:get-indicators',
  CHART_SAVE_INDICATORS: 'chart:save-indicators',

  // Watchlists
  WATCHLIST_GET_ALL: 'watchlist:get-all',
  WATCHLIST_SAVE: 'watchlist:save',

  // Economic Calendar & News
  CALENDAR_GET: 'calendar:get',
  NEWS_GET: 'news:get',
  NEWS_GET_LATEST: 'news:get-latest',
  NEWS_GET_BY_ID: 'news:get-by-id',

  // Economic Metadata
  ECONOMIC_GET_INDICATORS: 'economic:get-indicators',
  ECONOMIC_GET_CATEGORIES: 'economic:get-categories',
  ECONOMIC_GET_COUNTRIES: 'economic:get-countries',

  // SDK telemetry
  SYSTEM_GET_RATE_LIMIT: 'system:get-rate-limit',

  // Alerts
  ALERTS_GET: 'alerts:get',
  ALERTS_SAVE: 'alerts:save',
  ALERTS_DELETE: 'alerts:delete',

  // Paper Trading
  PAPER_GET_ACCOUNT: 'paper:get-account',
  PAPER_SAVE_ACCOUNT: 'paper:save-account',

  // Credentials & Settings
  SETTINGS_GET_CREDENTIALS: 'settings:get-credentials',
  SETTINGS_SAVE_API_KEY: 'settings:save-api-key',
  SETTINGS_CLEAR_API_KEY: 'settings:clear-api-key',

  // System & Utilities
  SYSTEM_OPEN_EXTERNAL: 'system:open-external'
} as const

// Zod validation schemas for incoming IPC requests

export const GetCandlesSchema = z.object({
  symbol: z.string().min(1).max(32),
  timeframe: z.enum(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M']),
  from: z.number().int().positive().optional(),
  to: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(2000).optional().default(500)
})
export type GetCandlesInput = z.infer<typeof GetCandlesSchema>

export const GetPricesSchema = z.object({
  symbols: z.array(z.string().min(1).max(32)).optional()
})
export type GetPricesInput = z.infer<typeof GetPricesSchema>

export const MarketSymbolSchema = z.object({ symbol: z.string().trim().min(1).max(32) })
export type MarketSymbolInput = z.infer<typeof MarketSymbolSchema>

export const EnergySeriesSchema = z.object({
  seriesId: z.string().min(1).max(128)
})
export type EnergySeriesInput = z.infer<typeof EnergySeriesSchema>

export const NewsIdSchema = z.object({ id: z.string().min(1).max(256) })
export type NewsIdInput = z.infer<typeof NewsIdSchema>

export const FixedIncomeTenorSchema = z.object({ tenor: z.string().min(1).max(16) })
export type FixedIncomeTenorInput = z.infer<typeof FixedIncomeTenorSchema>

export const SecCompanySchema = z.object({ symbol: z.string().min(1).max(32) })
export type SecCompanyInput = z.infer<typeof SecCompanySchema>

export const SymbolSubscriptionSchema = z.object({
  symbol: z.string().trim().min(1).max(32)
})
export type SymbolSubscriptionInput = z.infer<typeof SymbolSubscriptionSchema>

export const SaveApiKeySchema = z.object({
  apiKey: z.string().min(1).max(256),
  baseUrl: z.string().url().optional(),
  wsUrl: z.string().url().optional()
})
export type SaveApiKeyInput = z.infer<typeof SaveApiKeySchema>

export const DomainPointSchema = z.object({
  timestamp: z.number().positive(),
  value: z.number()
})

export const DrawingStyleSchema = z.object({
  color: z.string().optional(),
  lineWidth: z.number().optional(),
  lineStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
  fillColor: z.string().optional(),
  fillOpacity: z.number().optional(),
  fontSize: z.number().optional(),
  fontColor: z.string().optional(),
  text: z.string().optional()
})

export const DrawingItemSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  symbol: z.string().min(1),
  timeframe: z.string().optional(),
  points: z.array(DomainPointSchema),
  style: DrawingStyleSchema,
  lock: z.boolean().optional(),
  visible: z.boolean().optional(),
  createdAt: z.number().default(() => Date.now()),
  updatedAt: z.number().default(() => Date.now())
})

export const GetDrawingsSchema = z.object({
  symbol: z.string().min(1),
  timeframe: z.string().optional()
})

export const DeleteDrawingSchema = z.object({
  id: z.string().min(1)
})

export const ClearDrawingsSchema = z.object({
  symbol: z.string().optional()
})

export const IndicatorConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  paneId: z.string().min(1),
  calcParams: z.array(z.union([z.number(), z.string()])),
  visible: z.boolean(),
  styles: z.record(z.string(), z.unknown()).optional()
})

export const SaveIndicatorsSchema = z.object({
  symbol: z.string().min(1),
  indicators: z.array(IndicatorConfigSchema)
})

export const WatchlistGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(64),
  symbols: z.array(z.string().min(1).max(32))
})

export const GetCalendarSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  country: z.string().optional(),
  impact: z.enum(['high', 'medium', 'low', 'none', 'all']).optional(),
  limit: z.number().int().min(1).max(200).optional().default(50)
})
export type GetCalendarInput = z.infer<typeof GetCalendarSchema>

export const GetNewsSchema = z.object({
  category: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(20)
})
export type GetNewsInput = z.infer<typeof GetNewsSchema>

export const OpenExternalLinkSchema = z.object({
  url: z
    .string()
    .url()
    .refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
      message: 'Only http and https protocols are permitted for external links'
    })
})

export const PriceAlertSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  targetPrice: z.number().positive(),
  direction: z.enum(['above', 'below', 'cross']),
  triggered: z.boolean().default(false),
  createdAt: z.number().default(() => Date.now()),
  triggeredAt: z.number().optional(),
  note: z.string().optional()
})
export type PriceAlertInput = z.infer<typeof PriceAlertSchema>

export const DeleteAlertSchema = z.object({
  id: z.string().min(1)
})

export const PaperPositionSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  entryPrice: z.number().positive(),
  size: z.number().positive(),
  timestamp: z.number(),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional()
})

export const PaperAccountSchema = z.object({
  balance: z.number(),
  initialBalance: z.number(),
  currency: z.string().default('USD'),
  positions: z.array(PaperPositionSchema),
  updatedAt: z.number()
})
export type PaperAccountInput = z.infer<typeof PaperAccountSchema>

// Schemas for New Analytics & Intelligence APIs

export const OrderBookInputSchema = z.object({
  symbol: z.string().trim().min(1).max(32)
})
export type OrderBookInput = z.infer<typeof OrderBookInputSchema>

export const IntelligenceAnalyzeInputSchema = z.object({
  symbol: z.string().min(1).max(32),
  query: z.string().optional()
})
export type IntelligenceAnalyzeInput = z.infer<typeof IntelligenceAnalyzeInputSchema>

export const IntelligenceInsightsInputSchema = z.object({
  symbol: z.string().min(1).max(32)
})
export type IntelligenceInsightsInput = z.infer<typeof IntelligenceInsightsInputSchema>

export const OptionsChainInputSchema = z.object({
  symbol: z.string().trim().min(1).max(32)
})
export type OptionsChainInput = z.infer<typeof OptionsChainInputSchema>

export const OptionsGexInputSchema = z.object({
  symbol: z.string().trim().min(1).max(32)
})
export type OptionsGexInput = z.infer<typeof OptionsGexInputSchema>

export const MacroCotInputSchema = z.object({
  symbol: z.string().min(1).max(32)
})
export type MacroCotInput = z.infer<typeof MacroCotInputSchema>

export const MacroCentralBanksInputSchema = z.object({
  bank: z.string().optional()
})
export type MacroCentralBanksInput = z.infer<typeof MacroCentralBanksInputSchema>

export const MacroMapInputSchema = z.object({
  indicator: z.string().optional(),
  period: z.string().optional()
})
export type MacroMapInput = z.infer<typeof MacroMapInputSchema>

export const VolatilityInputSchema = z.object({
  symbol: z.string().min(1).max(32).optional(),
  kind: z.enum(['realized', 'implied', 'both']).default('both')
})
export type VolatilityInput = z.infer<typeof VolatilityInputSchema>

export const SecFilingsInputSchema = z.object({
  symbol: z.string().optional(),
  formType: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional()
})
export type SecFilingsInput = z.infer<typeof SecFilingsInputSchema>

export const SocialPostsInputSchema = z.object({
  symbol: z.string().optional(),
  sentiment: z.enum(['all', 'bullish', 'bearish', 'neutral']).optional(),
  limit: z.number().int().min(1).max(100).optional()
})
export type SocialPostsInput = z.infer<typeof SocialPostsInputSchema>

export const GetLayoutSchema = z.object({
  id: z.string().min(1)
})
export type GetLayoutInput = z.infer<typeof GetLayoutSchema>

export const DeleteLayoutSchema = z.object({
  id: z.string().min(1)
})
export type DeleteLayoutInput = z.infer<typeof DeleteLayoutSchema>

export const SaveLayoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  symbol: z.string().min(1).max(32),
  timeframe: z.enum(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M']),
  chartType: z.enum(['candle_solid', 'candle_stroke', 'line', 'area']),
  indicators: z.array(IndicatorConfigSchema),
  activePanel: z.string().optional(),
  isFavorite: z.boolean().optional(),
  description: z.string().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional()
})
export type SaveLayoutInput = z.infer<typeof SaveLayoutSchema>

/**
 * Strongly typed interface exposed to Renderer via preload window.api
 */
export interface TerminalAPI {
  market: {
    getSymbols: () => Promise<SymbolInfo[]>
    getCandles: (params: GetCandlesInput) => Promise<CandleBar[]>
    getPrices: (params?: GetPricesInput) => Promise<PriceQuote[]>
    getPrice: (symbol: string) => Promise<PriceQuote | null>
    getSession: (symbol: string) => Promise<MarketSessionData | null>
    getDataQuality: () => Promise<MarketDataQualityData | null>
    getSpikes: () => Promise<MarketSpikeData[]>
    getAlerts: () => Promise<ProviderAlertData[]>
    getSmartAlerts: () => Promise<ProviderAlertData[]>
    subscribePrice: (symbol: string) => Promise<boolean>
    unsubscribePrice: (symbol: string) => Promise<boolean>
    onPriceUpdate: (callback: (quote: PriceQuote) => void) => () => void
    onConnectionState: (callback: (state: ConnectionState) => void) => () => void
    getTradingHalts: () => Promise<TradingHaltItem[]>
    getCorporateActions: () => Promise<CorporateActionItem[]>
    getRealizedVolatility: (symbol?: string) => Promise<VolatilityData | null>
    getImpliedVolatility: (symbol?: string) => Promise<VolatilityData | null>
  }
  orderbook: {
    get: (symbol: string) => Promise<OrderBookData | null>
  }
  intelligence: {
    analyze: (params: IntelligenceAnalyzeInput) => Promise<IntelligenceAnalyzeResult | null>
    getInsights: (symbol: string) => Promise<MarketInsightResult | null>
  }
  options: {
    getChain: (symbol: string) => Promise<OptionChainData | null>
    getGex: (symbol: string) => Promise<OptionGexData | null>
    getSummary: () => Promise<OptionSummaryData | null>
  }
  macro: {
    getFearGreed: () => Promise<FearGreedResult | null>
    getFearGreedHistory: () => Promise<FearGreedHistoryItem[]>
    getCot: (symbol: string) => Promise<CotReportResult | null>
    getCentralBanks: (bank?: string) => Promise<CentralBankStanceResult[]>
    getMap: (params?: MacroMapInput) => Promise<MacroMapResult | null>
  }
  fixedIncome: {
    getYieldCurve: () => Promise<YieldCurveResult | null>
    getSpreads: () => Promise<YieldSpreadResult | null>
    getRate: (tenor: string) => Promise<FixedIncomeRateData | null>
    getHistory: (tenor: string) => Promise<FixedIncomeHistoryData | null>
  }
  geosignals: {
    getEvents: () => Promise<GeoSignalEventItem[]>
    getMap: () => Promise<GeoSignalsMapRegion[]>
    getAssetImpacts: () => Promise<GeoAssetImpactItem[]>
  }
  energy: {
    getDashboard: () => Promise<EnergyDashboardData | null>
    getSeries: (seriesId: string) => Promise<EnergySeriesData | null>
  }
  sec: {
    getFilings: (params?: SecFilingsInput) => Promise<SecFilingItemData[]>
    getCompany: (symbol: string) => Promise<SecCompanyData | null>
  }
  social: {
    getPosts: (params?: SocialPostsInput) => Promise<SocialPostItemData[]>
    getFeed: (params?: SocialPostsInput) => Promise<SocialPostItemData[]>
  }
  drawings: {
    get: (params: { symbol: string; timeframe?: string }) => Promise<DrawingItem[]>
    save: (drawing: DrawingItem) => Promise<boolean>
    delete: (id: string) => Promise<boolean>
    clear: (params?: { symbol?: string }) => Promise<boolean>
  }
  layouts: {
    getAll: () => Promise<ChartLayoutData[]>
    get: (id: string) => Promise<ChartLayoutData | null>
    save: (layout: ChartLayoutData) => Promise<boolean>
    delete: (id: string) => Promise<boolean>
  }
  indicators: {
    get: (symbol: string) => Promise<IndicatorConfig[]>
    save: (symbol: string, indicators: IndicatorConfig[]) => Promise<boolean>
  }
  watchlist: {
    getAll: () => Promise<WatchlistGroup[]>
    save: (watchlist: WatchlistGroup) => Promise<boolean>
  }
  calendar: {
    get: (params?: GetCalendarInput) => Promise<EconomicEvent[]>
  }
  news: {
    get: (params?: GetNewsInput) => Promise<NewsArticle[]>
    getLatest: () => Promise<NewsArticle[]>
    getById: (id: string) => Promise<NewsDetailData | null>
  }
  economic: {
    getIndicators: () => Promise<EconomicMetadataData>
    getCategories: () => Promise<EconomicMetadataData>
    getCountries: () => Promise<EconomicMetadataData>
  }
  alerts: {
    getAll: () => Promise<PriceAlert[]>
    save: (alert: PriceAlert) => Promise<boolean>
    delete: (id: string) => Promise<boolean>
  }
  paper: {
    getAccount: () => Promise<PaperAccount>
    saveAccount: (account: PaperAccount) => Promise<boolean>
  }
  settings: {
    getCredentials: () => Promise<CredentialStatus>
    saveApiKey: (input: SaveApiKeyInput) => Promise<boolean>
    clearApiKey: () => Promise<boolean>
  }
  system: {
    openExternal: (url: string) => Promise<boolean>
    getRateLimit: () => Promise<RateLimitStatus>
  }
  ws: {
    createTicket: () => Promise<WsTicketData | null>
  }
}
