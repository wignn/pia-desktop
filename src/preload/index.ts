/**
 * PIA Terminal - Preload Script
 * Securely exposes typed TerminalAPI through contextBridge without leaking raw ipcRenderer.
 */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type {
  TerminalAPI,
  SaveApiKeyInput,
  GetCandlesInput,
  GetPricesInput
} from '@shared/contracts'
import type {
  PriceQuote,
  ConnectionState,
  DrawingItem,
  IndicatorConfig,
  WatchlistGroup,
  PriceAlert,
  PaperAccount,
  ChartLayoutData,
  UpdaterStatus
} from '@shared/types'

const terminalApi: TerminalAPI = {
  market: {
    getSymbols: () => ipcRenderer.invoke(IPC_CHANNELS.MARKET_GET_SYMBOLS),
    getCandles: (params: GetCandlesInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.MARKET_GET_CANDLES, params),
    getPrices: (params?: GetPricesInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.MARKET_GET_PRICES, params),
    getPrice: (symbol: string) => ipcRenderer.invoke(IPC_CHANNELS.MARKET_GET_PRICE, { symbol }),
    getSession: (symbol: string) => ipcRenderer.invoke(IPC_CHANNELS.MARKET_GET_SESSION, { symbol }),
    getDataQuality: () => ipcRenderer.invoke(IPC_CHANNELS.MARKET_GET_DATA_QUALITY),
    getSpikes: () => ipcRenderer.invoke(IPC_CHANNELS.MARKET_GET_SPIKES),
    getAlerts: () => ipcRenderer.invoke(IPC_CHANNELS.MARKET_GET_ALERTS),
    getSmartAlerts: () => ipcRenderer.invoke(IPC_CHANNELS.MARKET_GET_SMART_ALERTS),
    subscribePrice: (symbol: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MARKET_SUBSCRIBE_PRICE, { symbol }),
    unsubscribePrice: (symbol: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MARKET_UNSUBSCRIBE_PRICE, { symbol }),
    onPriceUpdate: (callback: (quote: PriceQuote) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, quote: PriceQuote): void => {
        callback(quote)
      }
      ipcRenderer.on(IPC_CHANNELS.MARKET_ON_PRICE_UPDATE, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MARKET_ON_PRICE_UPDATE, handler)
      }
    },
    onConnectionState: (callback: (state: ConnectionState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: ConnectionState): void => {
        callback(state)
      }
      ipcRenderer.on(IPC_CHANNELS.MARKET_ON_CONNECTION_STATE, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MARKET_ON_CONNECTION_STATE, handler)
      }
    },
    getTradingHalts: () => ipcRenderer.invoke(IPC_CHANNELS.MARKET_GET_TRADING_HALTS),
    getCorporateActions: () => ipcRenderer.invoke(IPC_CHANNELS.MARKET_GET_CORPORATE_ACTIONS),
    getRealizedVolatility: (symbol?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MARKET_GET_VOLATILITY, { symbol, kind: 'realized' }),
    getImpliedVolatility: (symbol?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MARKET_GET_VOLATILITY, { symbol, kind: 'implied' }),
    uploadSnapshot: (params: { image: string; symbol?: string; timeframe?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.MARKET_UPLOAD_SNAPSHOT, params)
  },

  orderbook: {
    get: (symbol: string) => ipcRenderer.invoke(IPC_CHANNELS.ORDERBOOK_GET, { symbol })
  },

  intelligence: {
    analyze: (params) => ipcRenderer.invoke(IPC_CHANNELS.INTELLIGENCE_ANALYZE, params),
    getInsights: (symbol: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.INTELLIGENCE_GET_INSIGHTS, { symbol })
  },

  options: {
    getChain: (symbol: string) => ipcRenderer.invoke(IPC_CHANNELS.OPTIONS_GET_CHAIN, { symbol }),
    getGex: (symbol: string) => ipcRenderer.invoke(IPC_CHANNELS.OPTIONS_GET_GEX, { symbol }),
    getSummary: () => ipcRenderer.invoke(IPC_CHANNELS.OPTIONS_GET_SUMMARY)
  },

  macro: {
    getFearGreed: () => ipcRenderer.invoke(IPC_CHANNELS.MACRO_GET_FEAR_GREED),
    getFearGreedHistory: () => ipcRenderer.invoke(IPC_CHANNELS.MACRO_GET_FEAR_GREED_HISTORY),
    getCot: (symbol: string) => ipcRenderer.invoke(IPC_CHANNELS.MACRO_GET_COT, { symbol }),
    getCentralBanks: (bank?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MACRO_GET_CENTRAL_BANKS, { bank }),
    getMap: (params) => ipcRenderer.invoke(IPC_CHANNELS.MACRO_GET_MAP, params)
  },

  fixedIncome: {
    getYieldCurve: () => ipcRenderer.invoke(IPC_CHANNELS.FIXED_INCOME_GET_YIELD_CURVE),
    getSpreads: () => ipcRenderer.invoke(IPC_CHANNELS.FIXED_INCOME_GET_SPREADS),
    getRate: (tenor: string) => ipcRenderer.invoke(IPC_CHANNELS.FIXED_INCOME_GET_RATE, { tenor }),
    getHistory: (tenor: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FIXED_INCOME_GET_HISTORY, { tenor })
  },

  geosignals: {
    getEvents: () => ipcRenderer.invoke(IPC_CHANNELS.GEOSIGNALS_GET_EVENTS),
    getMap: () => ipcRenderer.invoke(IPC_CHANNELS.GEOSIGNALS_GET_MAP),
    getAssetImpacts: () => ipcRenderer.invoke(IPC_CHANNELS.GEOSIGNALS_GET_ASSET_IMPACTS)
  },

  energy: {
    getDashboard: () => ipcRenderer.invoke(IPC_CHANNELS.ENERGY_GET_DASHBOARD),
    getSeries: (seriesId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ENERGY_GET_SERIES, { seriesId })
  },

  sec: {
    getFilings: (params) => ipcRenderer.invoke(IPC_CHANNELS.SEC_GET_FILINGS, params),
    getCompany: (symbol: string) => ipcRenderer.invoke(IPC_CHANNELS.SEC_GET_COMPANY, { symbol })
  },

  social: {
    getPosts: (params) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_GET_POSTS, params),
    getFeed: (params) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_GET_FEED, params)
  },

  drawings: {
    get: (params: { symbol: string; timeframe?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.DRAWINGS_GET, params),
    save: (drawing: DrawingItem) => ipcRenderer.invoke(IPC_CHANNELS.DRAWINGS_SAVE, drawing),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DRAWINGS_DELETE, { id }),
    clear: (params: { symbol?: string } = {}) =>
      ipcRenderer.invoke(IPC_CHANNELS.DRAWINGS_CLEAR, params)
  },

  layouts: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.LAYOUTS_GET_ALL),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LAYOUTS_GET, { id }),
    save: (layout: ChartLayoutData) => ipcRenderer.invoke(IPC_CHANNELS.LAYOUTS_SAVE, layout),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LAYOUTS_DELETE, { id })
  },

  indicators: {
    get: (symbol: string) => ipcRenderer.invoke(IPC_CHANNELS.CHART_GET_INDICATORS, symbol),
    save: (symbol: string, indicators: IndicatorConfig[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHART_SAVE_INDICATORS, { symbol, indicators })
  },

  watchlist: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.WATCHLIST_GET_ALL),
    save: (watchlist: WatchlistGroup) => ipcRenderer.invoke(IPC_CHANNELS.WATCHLIST_SAVE, watchlist),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WATCHLIST_DELETE, { id })
  },

  calendar: {
    get: (params) => ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_GET, params)
  },

  news: {
    get: (params) => ipcRenderer.invoke(IPC_CHANNELS.NEWS_GET, params),
    getLatest: () => ipcRenderer.invoke(IPC_CHANNELS.NEWS_GET_LATEST),
    getById: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.NEWS_GET_BY_ID, { id })
  },

  economic: {
    getIndicators: () => ipcRenderer.invoke(IPC_CHANNELS.ECONOMIC_GET_INDICATORS),
    getCategories: () => ipcRenderer.invoke(IPC_CHANNELS.ECONOMIC_GET_CATEGORIES),
    getCountries: () => ipcRenderer.invoke(IPC_CHANNELS.ECONOMIC_GET_COUNTRIES)
  },

  alerts: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.ALERTS_GET),
    save: (alert: PriceAlert) => ipcRenderer.invoke(IPC_CHANNELS.ALERTS_SAVE, alert),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ALERTS_DELETE, { id })
  },

  paper: {
    getAccount: () => ipcRenderer.invoke(IPC_CHANNELS.PAPER_GET_ACCOUNT),
    saveAccount: (account: PaperAccount) =>
      ipcRenderer.invoke(IPC_CHANNELS.PAPER_SAVE_ACCOUNT, account)
  },

  settings: {
    getCredentials: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_CREDENTIALS),
    saveApiKey: (input: SaveApiKeyInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE_API_KEY, input),
    clearApiKey: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CLEAR_API_KEY)
  },

  system: {
    openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, { url }),
    getRateLimit: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_RATE_LIMIT)
  },

  ws: {
    createTicket: () => ipcRenderer.invoke(IPC_CHANNELS.WS_CREATE_TICKET)
  },

  updater: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_CHECK),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_GET_STATUS),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_INSTALL),
    onStatus: (callback: (status: UpdaterStatus) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdaterStatus): void => {
        callback(status)
      }
      ipcRenderer.on(IPC_CHANNELS.UPDATER_ON_STATUS, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_ON_STATUS, handler)
      }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', terminalApi)
  } catch (error) {
    console.error('Failed to expose contextBridge API:', error)
  }
} else {
  // Fallback for non-isolated environments
  // @ts-ignore (define in dts)
  window.api = terminalApi
}
