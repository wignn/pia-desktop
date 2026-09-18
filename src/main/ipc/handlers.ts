/**
 * PIA Terminal - IPC Request Handlers with Strict Zod Validation & Frame Security
 */

import { ipcMain, shell, type BrowserWindow } from 'electron'
import {
  IPC_CHANNELS,
  GetCandlesSchema,
  GetPricesSchema,
  SymbolSubscriptionSchema,
  SaveApiKeySchema,
  DrawingItemSchema,
  GetDrawingsSchema,
  DeleteDrawingSchema,
  ClearDrawingsSchema,
  SaveIndicatorsSchema,
  WatchlistGroupSchema,
  DeleteWatchlistSchema,
  GetCalendarSchema,
  GetNewsSchema,
  OpenExternalLinkSchema,
  PriceAlertSchema,
  DeleteAlertSchema,
  PaperAccountSchema,
  OrderBookInputSchema,
  IntelligenceAnalyzeInputSchema,
  IntelligenceInsightsInputSchema,
  OptionsChainInputSchema,
  OptionsGexInputSchema,
  MacroCotInputSchema,
  MacroCentralBanksInputSchema,
  SecFilingsInputSchema,
  SocialPostsInputSchema,
  MacroMapInputSchema,
  VolatilityInputSchema,
  UploadSnapshotInputSchema,
  SaveLayoutSchema,
  GetLayoutSchema,
  FixedIncomeTenorSchema,
  SecCompanySchema,
  DeleteLayoutSchema,
  MarketSymbolSchema,
  EnergySeriesSchema,
  NewsIdSchema
} from '@shared/contracts'
import type { CredentialManager } from '../services/credentials'
import type { DatabaseService } from '../services/database'
import type { PiaProvider } from '../services/pia-provider'
import type { ChartLayoutData } from '@shared/types'

export function registerIpcHandlers(
  getWindow: () => BrowserWindow | null,
  credManager: CredentialManager,
  dbService: DatabaseService,
  piaProvider: PiaProvider
): void {
  // Security helper to verify sender frame origin
  const verifySender = (event: Electron.IpcMainInvokeEvent): boolean => {
    const win = getWindow()
    if (!win || win.isDestroyed()) return false
    // Ensure the message came from the primary window frame
    return event.senderFrame === win.webContents.mainFrame
  }

  // --- Market & Candle Handlers ---

  ipcMain.handle(IPC_CHANNELS.MARKET_GET_SYMBOLS, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getSymbols()
  })

  ipcMain.handle(IPC_CHANNELS.MARKET_GET_CANDLES, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const params = GetCandlesSchema.parse(rawParams)
    return await piaProvider.getCandles(params)
  })

  ipcMain.handle(IPC_CHANNELS.MARKET_GET_PRICES, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const params = GetPricesSchema.parse(rawParams || {})
    return await piaProvider.getPrices(params.symbols)
  })

  ipcMain.handle(IPC_CHANNELS.MARKET_GET_PRICE, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { symbol } = MarketSymbolSchema.parse(rawParams)
    return await piaProvider.getPrice(symbol)
  })

  ipcMain.handle(IPC_CHANNELS.MARKET_GET_SESSION, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { symbol } = MarketSymbolSchema.parse(rawParams)
    return await piaProvider.getSession(symbol)
  })

  ipcMain.handle(IPC_CHANNELS.MARKET_GET_DATA_QUALITY, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getDataQuality()
  })

  ipcMain.handle(IPC_CHANNELS.MARKET_GET_SPIKES, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getSpikes()
  })

  ipcMain.handle(IPC_CHANNELS.MARKET_GET_ALERTS, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getAlerts()
  })

  ipcMain.handle(IPC_CHANNELS.MARKET_GET_SMART_ALERTS, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getSmartAlerts()
  })

  ipcMain.handle(IPC_CHANNELS.MARKET_GET_TRADING_HALTS, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getTradingHalts()
  })

  ipcMain.handle(IPC_CHANNELS.MARKET_GET_CORPORATE_ACTIONS, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getCorporateActions()
  })

  ipcMain.handle(IPC_CHANNELS.MARKET_GET_VOLATILITY, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { symbol, kind } = VolatilityInputSchema.parse(rawParams || {})
    if (kind === 'realized') return await piaProvider.getRealizedVolatility(symbol)
    if (kind === 'implied') return await piaProvider.getImpliedVolatility(symbol)
    const [realized, implied] = await Promise.all([
      piaProvider.getRealizedVolatility(symbol),
      piaProvider.getImpliedVolatility(symbol)
    ])
    return realized || implied ? { ...realized, ...implied, symbol } : null
  })

  ipcMain.handle(IPC_CHANNELS.MARKET_SUBSCRIBE_PRICE, (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { symbol } = SymbolSubscriptionSchema.parse(rawParams)
    return piaProvider.subscribePrice(symbol)
  })

  ipcMain.handle(IPC_CHANNELS.MARKET_UNSUBSCRIBE_PRICE, (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { symbol } = SymbolSubscriptionSchema.parse(rawParams)
    return piaProvider.unsubscribePrice(symbol)
  })

  ipcMain.handle(IPC_CHANNELS.MARKET_UPLOAD_SNAPSHOT, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const params = UploadSnapshotInputSchema.parse(rawParams)
    return await piaProvider.uploadSnapshot(params)
  })

  // --- Drawings Handlers ---

  ipcMain.handle(IPC_CHANNELS.DRAWINGS_GET, (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const params = GetDrawingsSchema.parse(rawParams)
    return dbService.getDrawings(params.symbol, params.timeframe)
  })

  ipcMain.handle(IPC_CHANNELS.DRAWINGS_SAVE, (event, rawDrawing) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const drawing = DrawingItemSchema.parse(rawDrawing)
    return dbService.saveDrawing(drawing)
  })

  ipcMain.handle(IPC_CHANNELS.DRAWINGS_DELETE, (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { id } = DeleteDrawingSchema.parse(rawParams)
    return dbService.deleteDrawing(id)
  })

  ipcMain.handle(IPC_CHANNELS.DRAWINGS_CLEAR, (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { symbol } = ClearDrawingsSchema.parse(rawParams || {})
    return dbService.clearDrawings(symbol)
  })

  // --- Chart Layouts Handlers ---

  ipcMain.handle(IPC_CHANNELS.LAYOUTS_GET_ALL, (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return dbService.getLayouts()
  })

  ipcMain.handle(IPC_CHANNELS.LAYOUTS_GET, (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { id } = GetLayoutSchema.parse(rawParams)
    return dbService.getLayout(id)
  })

  ipcMain.handle(IPC_CHANNELS.LAYOUTS_SAVE, (event, rawLayout) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const layout = SaveLayoutSchema.parse(rawLayout)
    const now = Date.now()
    const layoutData: ChartLayoutData = {
      id: layout.id,
      name: layout.name,
      symbol: layout.symbol,
      timeframe: layout.timeframe,
      chartType: layout.chartType,
      indicators: layout.indicators,
      activePanel: layout.activePanel,
      isFavorite: layout.isFavorite ?? false,
      description: layout.description,
      createdAt: layout.createdAt ?? now,
      updatedAt: layout.updatedAt ?? now
    }
    return dbService.saveLayout(layoutData)
  })

  ipcMain.handle(IPC_CHANNELS.LAYOUTS_DELETE, (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { id } = DeleteLayoutSchema.parse(rawParams)
    return dbService.deleteLayout(id)
  })

  // --- Indicators Handlers ---

  ipcMain.handle(IPC_CHANNELS.CHART_GET_INDICATORS, (event, symbol: string) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return dbService.getIndicators(symbol)
  })

  ipcMain.handle(IPC_CHANNELS.CHART_SAVE_INDICATORS, (event, rawData) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const data = SaveIndicatorsSchema.parse(rawData)
    return dbService.saveIndicators(data.symbol, data.indicators)
  })

  // --- Watchlist Handlers ---

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_GET_ALL, (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return dbService.getWatchlists()
  })

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_SAVE, (event, rawWatchlist) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const watchlist = WatchlistGroupSchema.parse(rawWatchlist)
    return dbService.saveWatchlist(watchlist)
  })

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_DELETE, (event, rawInput) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { id } = DeleteWatchlistSchema.parse(rawInput)
    return dbService.deleteWatchlist(id)
  })

  // --- Alerts Handlers ---

  ipcMain.handle(IPC_CHANNELS.ALERTS_GET, (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return dbService.getAlerts()
  })

  ipcMain.handle(IPC_CHANNELS.ALERTS_SAVE, (event, rawAlert) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const alert = PriceAlertSchema.parse(rawAlert)
    return dbService.saveAlert(alert)
  })

  ipcMain.handle(IPC_CHANNELS.ALERTS_DELETE, (event, rawInput) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { id } = DeleteAlertSchema.parse(rawInput)
    return dbService.deleteAlert(id)
  })

  // --- Paper Trading Handlers ---

  ipcMain.handle(IPC_CHANNELS.PAPER_GET_ACCOUNT, (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return dbService.getPaperAccount()
  })

  ipcMain.handle(IPC_CHANNELS.PAPER_SAVE_ACCOUNT, (event, rawAccount) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const account = PaperAccountSchema.parse(rawAccount)
    return dbService.savePaperAccount(account)
  })

  // --- Calendar & News Handlers ---

  ipcMain.handle(IPC_CHANNELS.CALENDAR_GET, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const params = GetCalendarSchema.parse(rawParams || {})
    return await piaProvider.getCalendar(params)
  })

  ipcMain.handle(IPC_CHANNELS.NEWS_GET, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const params = GetNewsSchema.parse(rawParams || {})
    return await piaProvider.getNews(params)
  })

  // --- Credentials & Settings Handlers ---

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_CREDENTIALS, (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return credManager.getStatus()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE_API_KEY, (event, rawInput) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const input = SaveApiKeySchema.parse(rawInput)
    const success = credManager.saveCredentials(input.apiKey, input.baseUrl, input.wsUrl)
    if (success) {
      piaProvider.initializeClient()
    }
    return success
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_CLEAR_API_KEY, (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const success = credManager.clearCredentials()
    if (success) {
      piaProvider.initializeClient()
    }
    return success
  })

  // --- Order Book & Microstructure ---

  ipcMain.handle(IPC_CHANNELS.ORDERBOOK_GET, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { symbol } = OrderBookInputSchema.parse(rawParams)
    return await piaProvider.getOrderBook(symbol)
  })

  // --- Intelligence & AI Analysis ---

  ipcMain.handle(IPC_CHANNELS.INTELLIGENCE_ANALYZE, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const params = IntelligenceAnalyzeInputSchema.parse(rawParams)
    return await piaProvider.analyzeIntelligence(params.symbol, params.query)
  })

  ipcMain.handle(IPC_CHANNELS.INTELLIGENCE_GET_INSIGHTS, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { symbol } = IntelligenceInsightsInputSchema.parse(rawParams)
    return await piaProvider.getMarketInsights(symbol)
  })

  // --- Options & Derivatives ---

  ipcMain.handle(IPC_CHANNELS.OPTIONS_GET_CHAIN, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { symbol } = OptionsChainInputSchema.parse(rawParams)
    return await piaProvider.getOptionsChain(symbol)
  })

  ipcMain.handle(IPC_CHANNELS.OPTIONS_GET_GEX, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { symbol } = OptionsGexInputSchema.parse(rawParams)
    return await piaProvider.getOptionsGex(symbol)
  })

  ipcMain.handle(IPC_CHANNELS.OPTIONS_GET_SUMMARY, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getOptionsSummary()
  })

  // --- Macro & Central Bank Economics ---

  ipcMain.handle(IPC_CHANNELS.MACRO_GET_FEAR_GREED, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getFearGreed()
  })

  ipcMain.handle(IPC_CHANNELS.MACRO_GET_FEAR_GREED_HISTORY, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getFearGreedHistory()
  })

  ipcMain.handle(IPC_CHANNELS.MACRO_GET_COT, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { symbol } = MacroCotInputSchema.parse(rawParams)
    return await piaProvider.getCot(symbol)
  })

  ipcMain.handle(IPC_CHANNELS.MACRO_GET_CENTRAL_BANKS, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { bank } = MacroCentralBanksInputSchema.parse(rawParams || {})
    return await piaProvider.getCentralBanks(bank)
  })

  ipcMain.handle(IPC_CHANNELS.MACRO_GET_MAP, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const params = MacroMapInputSchema.parse(rawParams || {})
    return await piaProvider.getMacroMap(params)
  })

  // --- Fixed Income & Sovereign Rates ---

  ipcMain.handle(IPC_CHANNELS.FIXED_INCOME_GET_YIELD_CURVE, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getYieldCurve()
  })

  ipcMain.handle(IPC_CHANNELS.FIXED_INCOME_GET_SPREADS, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getYieldSpreads()
  })

  ipcMain.handle(IPC_CHANNELS.FIXED_INCOME_GET_RATE, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { tenor } = FixedIncomeTenorSchema.parse(rawParams)
    return await piaProvider.getFixedIncomeRate(tenor)
  })

  ipcMain.handle(IPC_CHANNELS.FIXED_INCOME_GET_HISTORY, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { tenor } = FixedIncomeTenorSchema.parse(rawParams)
    return await piaProvider.getFixedIncomeHistory(tenor)
  })

  // --- Geopolitical Signals ---

  ipcMain.handle(IPC_CHANNELS.GEOSIGNALS_GET_EVENTS, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getGeoEvents()
  })

  ipcMain.handle(IPC_CHANNELS.GEOSIGNALS_GET_MAP, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getGeoMap()
  })

  ipcMain.handle(IPC_CHANNELS.GEOSIGNALS_GET_ASSET_IMPACTS, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getGeoAssetImpacts()
  })

  // --- Energy Markets ---

  ipcMain.handle(IPC_CHANNELS.ENERGY_GET_SERIES, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { seriesId } = EnergySeriesSchema.parse(rawParams)
    return await piaProvider.getEnergySeries(seriesId)
  })

  ipcMain.handle(IPC_CHANNELS.ENERGY_GET_DASHBOARD, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getEnergyDashboard()
  })

  ipcMain.handle(IPC_CHANNELS.SOCIAL_GET_FEED, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const params = SocialPostsInputSchema.parse(rawParams || {})
    return await piaProvider.getSocialFeed(params)
  })

  ipcMain.handle(IPC_CHANNELS.NEWS_GET_LATEST, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getLatestNews()
  })

  ipcMain.handle(IPC_CHANNELS.NEWS_GET_BY_ID, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { id } = NewsIdSchema.parse(rawParams)
    return await piaProvider.getNewsById(id)
  })

  ipcMain.handle(IPC_CHANNELS.ECONOMIC_GET_INDICATORS, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getEconomicMetadata('indicators')
  })

  ipcMain.handle(IPC_CHANNELS.ECONOMIC_GET_CATEGORIES, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getEconomicMetadata('categories')
  })

  ipcMain.handle(IPC_CHANNELS.ECONOMIC_GET_COUNTRIES, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.getEconomicMetadata('countries')
  })

  // --- SEC EDGAR Filings ---

  ipcMain.handle(IPC_CHANNELS.SEC_GET_FILINGS, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const params = SecFilingsInputSchema.parse(rawParams || {})
    return await piaProvider.getSecFilings(params)
  })

  ipcMain.handle(IPC_CHANNELS.SEC_GET_COMPANY, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { symbol } = SecCompanySchema.parse(rawParams)
    return await piaProvider.getSecCompany(symbol)
  })

  ipcMain.handle(IPC_CHANNELS.WS_CREATE_TICKET, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return await piaProvider.createWsTicket()
  })

  // --- Social Intelligence Feed ---

  ipcMain.handle(IPC_CHANNELS.SOCIAL_GET_POSTS, async (event, rawParams) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const params = SocialPostsInputSchema.parse(rawParams || {})
    return await piaProvider.getSocialPosts(params)
  })

  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_RATE_LIMIT, async (event) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    return piaProvider.getRateLimitInfo()
  })

  // --- Safe External Link Handler ---

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, async (event, rawInput) => {
    if (!verifySender(event)) throw new Error('Unauthorized IPC sender')
    const { url } = OpenExternalLinkSchema.parse(rawInput)
    await shell.openExternal(url)
    return true
  })
}
