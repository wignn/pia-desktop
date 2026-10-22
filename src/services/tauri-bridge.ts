/**
 * PIA Terminal - Tauri Bridge
 * Connects the webview frontend to PiaProvider, DatabaseService (SQLite via sql.js + Tauri FS persistence),
 * and native Tauri plugins, implementing the full TerminalAPI contract.
 */

import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { CredentialManager } from './credentials'
import { DatabaseService } from './database'
import { PiaProvider } from './pia-provider'
import { AiMcpEngine } from './ai-mcp-engine'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type {
  TerminalAPI,
  GetCandlesInput,
  GetPricesInput,
  SaveApiKeyInput,
  UploadSnapshotInput,
  IntelligenceAnalyzeInput,
  MacroMapInput,
  SecFilingsInput,
  SocialPostsInput,
  GetCalendarInput,
  GetNewsInput
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

import {
  checkForAppUpdates,
  downloadUpdatePackage,
  applyDownloadedUpdate,
  installDownloadedUpdate
} from './auto-updater'

export async function createTauriApi(): Promise<TerminalAPI> {
  const credManager = new CredentialManager()
  await credManager.initialize()

  const dbService = new DatabaseService()
  await dbService.initialize()

  const piaProvider = new PiaProvider(credManager)

  let currentUpdaterStatus: UpdaterStatus = {
    state: 'idle',
    currentVersion: '3.0.5'
  }
  const updaterListeners = new Set<(status: UpdaterStatus) => void>()
  const notifyUpdaterListeners = (s: UpdaterStatus): void => {
    updaterListeners.forEach((fn) => {
      try {
        fn(s)
      } catch (e) {
        console.error('[tauri-bridge] updater listener error:', e)
      }
    })
  }

  const api: TerminalAPI = {
    market: {
      getSymbols: () => piaProvider.getSymbols(),
      getCandles: (params: GetCandlesInput) => piaProvider.getCandles(params),
      getPrices: (params?: GetPricesInput) => piaProvider.getPrices(params?.symbols),
      getPrice: (symbol: string) => piaProvider.getPrice(symbol),
      getSession: (symbol: string) => piaProvider.getSession(symbol),
      getDataQuality: () => piaProvider.getDataQuality(),
      getSpikes: () => piaProvider.getSpikes(),
      getAlerts: () => piaProvider.getAlerts(),
      getSmartAlerts: () => piaProvider.getSmartAlerts(),
      reconnect: () => Promise.resolve(piaProvider.reconnectRealtime('user-bridge')),
      subscribePrice: (symbol: string) => Promise.resolve(piaProvider.subscribePrice(symbol)),
      unsubscribePrice: (symbol: string) =>
        Promise.resolve(piaProvider.unsubscribePrice(symbol)),
      onPriceUpdate: (callback: (quote: PriceQuote) => void) =>
        piaProvider.on(IPC_CHANNELS.MARKET_ON_PRICE_UPDATE, callback),
      onConnectionState: (callback: (state: ConnectionState) => void) =>
        piaProvider.on(IPC_CHANNELS.MARKET_ON_CONNECTION_STATE, callback),
      getTradingHalts: () => piaProvider.getTradingHalts(),
      getCorporateActions: () => piaProvider.getCorporateActions(),
      getRealizedVolatility: (symbol?: string) => piaProvider.getRealizedVolatility(symbol),
      getImpliedVolatility: (symbol?: string) => piaProvider.getImpliedVolatility(symbol),
      uploadSnapshot: (params: UploadSnapshotInput) => piaProvider.uploadSnapshot(params)
    },

    orderbook: {
      get: (symbol: string) => piaProvider.getOrderBook(symbol)
    },

    intelligence: {
      analyze: (params: IntelligenceAnalyzeInput) =>
        piaProvider.analyzeIntelligence(params.symbol, params.query),
      getInsights: (symbol: string) => piaProvider.getMarketInsights(symbol)
    },

    options: {
      getChain: (symbol: string) => piaProvider.getOptionsChain(symbol),
      getGex: (symbol: string) => piaProvider.getOptionsGex(symbol),
      getSummary: () => piaProvider.getOptionsSummary()
    },

    macro: {
      getFearGreed: () => piaProvider.getFearGreed(),
      getFearGreedHistory: () => piaProvider.getFearGreedHistory(),
      getCot: (symbol: string) => piaProvider.getCot(symbol),
      getCentralBanks: (bank?: string) => piaProvider.getCentralBanks(bank),
      getMap: (params?: MacroMapInput) => piaProvider.getMacroMap(params)
    },

    fixedIncome: {
      getYieldCurve: () => piaProvider.getYieldCurve(),
      getSpreads: () => piaProvider.getYieldSpreads(),
      getRate: (tenor: string) => piaProvider.getFixedIncomeRate(tenor),
      getHistory: (tenor: string) => piaProvider.getFixedIncomeHistory(tenor)
    },

    geosignals: {
      getEvents: () => piaProvider.getGeoEvents(),
      getMap: () => piaProvider.getGeoMap(),
      getAssetImpacts: () => piaProvider.getGeoAssetImpacts()
    },

    energy: {
      getDashboard: () => piaProvider.getEnergyDashboard(),
      getSeries: (seriesId: string) => piaProvider.getEnergySeries(seriesId)
    },

    sec: {
      getFilings: (params?: SecFilingsInput) => piaProvider.getSecFilings(params),
      getCompany: (symbol: string) => piaProvider.getSecCompany(symbol)
    },

    social: {
      getPosts: (params?: SocialPostsInput) => piaProvider.getSocialPosts(params),
      getFeed: (params?: SocialPostsInput) => piaProvider.getSocialFeed(params)
    },

    drawings: {
      get: (params: { symbol: string; timeframe?: string }) =>
        Promise.resolve(dbService.getDrawings(params.symbol, params.timeframe)),
      save: (drawing: DrawingItem) => Promise.resolve(dbService.saveDrawing(drawing)),
      delete: (id: string) => Promise.resolve(dbService.deleteDrawing(id)),
      clear: (params?: { symbol?: string }) =>
        Promise.resolve(dbService.clearDrawings(params?.symbol))
    },

    layouts: {
      getAll: () => Promise.resolve(dbService.getLayouts()),
      get: (id: string) => Promise.resolve(dbService.getLayout(id)),
      save: (layout: ChartLayoutData) => Promise.resolve(dbService.saveLayout(layout)),
      delete: (id: string) => Promise.resolve(dbService.deleteLayout(id))
    },

    indicators: {
      get: (symbol: string) => Promise.resolve(dbService.getIndicators(symbol)),
      save: (symbol: string, indicators: IndicatorConfig[]) =>
        Promise.resolve(dbService.saveIndicators(symbol, indicators))
    },

    watchlist: {
      getAll: () => Promise.resolve(dbService.getWatchlists()),
      save: (watchlist: WatchlistGroup) => Promise.resolve(dbService.saveWatchlist(watchlist)),
      delete: (id: string) => Promise.resolve(dbService.deleteWatchlist(id))
    },

    calendar: {
      get: (params?: GetCalendarInput) => piaProvider.getCalendar(params)
    },

    news: {
      get: (params?: GetNewsInput) => piaProvider.getNews(params),
      getLatest: () => piaProvider.getLatestNews(),
      getById: (id: string) => piaProvider.getNewsById(id)
    },

    economic: {
      getIndicators: () => piaProvider.getEconomicMetadata('indicators'),
      getCategories: () => piaProvider.getEconomicMetadata('categories'),
      getCountries: () => piaProvider.getEconomicMetadata('countries')
    },

    alerts: {
      getAll: () => Promise.resolve(dbService.getAlerts()),
      save: (alert: PriceAlert) => Promise.resolve(dbService.saveAlert(alert)),
      delete: (id: string) => Promise.resolve(dbService.deleteAlert(id))
    },

    paper: {
      getAccount: () => Promise.resolve(dbService.getPaperAccount()),
      saveAccount: (account: PaperAccount) => Promise.resolve(dbService.savePaperAccount(account))
    },

    settings: {
      getCredentials: async () => {
        const status = credManager.getStatus()
        let profile = dbService.getUserProfile()

        // Fallback 1: Restore from localStorage if SQLite is empty
        if ((!profile?.name || !profile?.avatarUrl) && typeof localStorage !== 'undefined') {
          try {
            const raw = localStorage.getItem('pia_user_profile')
            if (raw) {
              const parsed = JSON.parse(raw)
              if (parsed?.name || parsed?.avatarUrl) {
                profile = { ...profile, ...parsed }
                dbService.saveUserProfile(parsed)
              }
            }
          } catch {}
        }

        if (profile) {
          status.name = profile.name || status.name
          status.email = profile.email || status.email
          status.avatarUrl = profile.avatarUrl || status.avatarUrl
          status.plan = profile.plan || 'enterprise'
        }

        // Fallback 2: Sync live profile from backend if missing name or avatar
        const key = credManager.getApiKey()
        if (status.isLoggedIn && key && (!status.name || !status.avatarUrl)) {
          const baseUrl = credManager.getBaseUrl()
          try {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 3500)
            const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
              headers: { 'x-api-key': key },
              signal: controller.signal
            })
            clearTimeout(timer)
            if (res.ok) {
              const data = await res.json()
              if (data?.user) {
                const u = data.user
                status.name = u.name || status.name
                status.email = u.email || status.email
                status.avatarUrl = u.avatar_url || status.avatarUrl
                status.plan = u.plan || 'enterprise'

                const toSave = {
                  id: u.id,
                  email: status.email,
                  name: status.name,
                  avatarUrl: status.avatarUrl,
                  plan: status.plan
                }
                dbService.saveUserProfile(toSave)
                void credManager.saveUserMetadata(toSave)
                if (typeof localStorage !== 'undefined') {
                  localStorage.setItem('pia_user_profile', JSON.stringify(toSave))
                }
              }
            }
          } catch (e) {
            console.warn('[tauri-bridge] Failed to sync profile from /api/v1/auth/me:', e)
          }
        }
        return status
      },
      loginWithGoogle: async () => {
        const nonceBytes = crypto.getRandomValues(new Uint8Array(32))
        const nonce = Array.from(nonceBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
        const baseUrl = credManager.getBaseUrl()
        const startResponse = await fetch(`${baseUrl}/api/v1/auth/oauth/google/desktop-url`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nonce })
        })
        const startPayload = (await startResponse.json().catch(() => ({}))) as {
          url?: string
          state?: string
          error?: string
          message?: string
        }
        if (!startResponse.ok) {
          const detail = startPayload.message || startPayload.error
          throw new Error(
            startResponse.status === 401 || startResponse.status === 403
              ? 'Google login is not enabled on the API server (HTTP 401/403). Check deployment and public-route authentication.'
              : `Google login initialization failed (${startResponse.status})${detail ? `: ${detail}` : ''}`
          )
        }
        const start = startPayload
        if (!start.url || !start.state) throw new Error('Google login initialization returned invalid data')
        const authUrl = new URL(start.url)
        if (
          authUrl.origin !== 'https://accounts.google.com' ||
          authUrl.pathname !== '/o/oauth2/v2/auth' ||
          authUrl.searchParams.get('state') !== start.state ||
          authUrl.searchParams.get('redirect_uri') !== 'https://api-engine.wign.dev/api/v1/auth/oauth/google/desktop-callback'
        ) {
          throw new Error('Google login returned an unexpected authorization URL')
        }
        const redirectUri = 'http://127.0.0.1:43827/oauth/callback'
        const browserAuthUrl = new URL(authUrl)
        browserAuthUrl.searchParams.set('redirect_uri', redirectUri)
        const callback = await invoke<{ code: string; state: string }>('google_oauth_callback', {
          url: browserAuthUrl.toString(),
          expectedState: start.state
        })
        if (!callback.code || callback.state !== start.state) throw new Error('Google login was not completed')
        const finishResponse = await fetch(`${baseUrl}/api/v1/auth/oauth/google/desktop-callback`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            code: callback.code,
            state: callback.state,
            nonce,
            redirect_uri: redirectUri
          })
        })
        if (!finishResponse.ok) throw new Error(`Google login failed (${finishResponse.status})`)
        const finish = (await finishResponse.json()) as {
          desktop_credential?: string
          user?: { id?: string; email?: string; name?: string; avatar_url?: string; plan?: string }
        }
        if (!finish.desktop_credential) throw new Error('Google login did not return a credential')
        const userMeta = finish.user
          ? {
              id: finish.user.id,
              email: finish.user.email,
              name: finish.user.name,
              avatarUrl: finish.user.avatar_url,
              plan: finish.user.plan || 'enterprise'
            }
          : undefined

        if (!(await credManager.saveDesktopCredential(finish.desktop_credential, userMeta))) {
          throw new Error('Could not securely save desktop login')
        }
        if (userMeta) {
          dbService.saveUserProfile(userMeta)
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('pia_user_profile', JSON.stringify(userMeta))
          }
        }
        piaProvider.initializeClient()
        return true
      },
      logout: async () => {
        const ok = await credManager.clearCredentials()
        dbService.clearUserProfile()
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('pia_user_profile')
        }
        piaProvider.initializeClient()
        return ok
      },
      saveApiKey: async (input: SaveApiKeyInput) => {
        const ok = await credManager.saveCredentials(input.apiKey, input.baseUrl, input.wsUrl)
        piaProvider.initializeClient()
        return ok
      },
      clearApiKey: async () => {
        const ok = await credManager.clearCredentials()
        dbService.clearUserProfile()
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('pia_user_profile')
        }
        piaProvider.initializeClient()
        return ok
      }
    },

    system: {
      openExternal: async (url: string) => {
        try {
          await openUrl(url)
          return true
        } catch {
          window.open(url, '_blank')
          return true
        }
      },
      getRateLimit: () => Promise.resolve(piaProvider.getRateLimitInfo()),
      closeApp: async () => {
        try {
          if (typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)) {
            await invoke('close_app')
            return true
          }
        } catch {}
        return false
      }
    },

    ai: {
      getTools: () => Promise.resolve(AiMcpEngine.getMcpTools()),
      executeTool: (name: string, args: Record<string, any>) => AiMcpEngine.executeTool(name, args),
      executeFullAnalysis: (symbol: string, applyToChart = true) => AiMcpEngine.executeFullChartAnalysis(symbol, applyToChart),
      clearDrawings: (symbol: string) => AiMcpEngine.clearDrawings(symbol)
    },

    ws: {
      createTicket: () => piaProvider.createWsTicket()
    },

    updater: {
      check: async () => {
        currentUpdaterStatus = { ...currentUpdaterStatus, state: 'checking' }
        notifyUpdaterListeners(currentUpdaterStatus)
        const res = await checkForAppUpdates()
        if (res.state === 'available') {
          currentUpdaterStatus = {
            state: 'available',
            currentVersion: res.currentVersion || '3.0.5',
            availableVersion: res.availableVersion,
            progressPercent: 0
          }
          notifyUpdaterListeners(currentUpdaterStatus)

          // Auto-start download in background with live progress updates
          currentUpdaterStatus = {
            ...currentUpdaterStatus,
            state: 'downloading',
            progressPercent: 1
          }
          notifyUpdaterListeners(currentUpdaterStatus)

          void downloadUpdatePackage((percent) => {
            currentUpdaterStatus = {
              ...currentUpdaterStatus,
              state: 'downloading',
              progressPercent: percent
            }
            notifyUpdaterListeners(currentUpdaterStatus)
          }).then((ok) => {
            if (ok) {
              currentUpdaterStatus = {
                ...currentUpdaterStatus,
                state: 'downloaded',
                progressPercent: 100
              }
              notifyUpdaterListeners(currentUpdaterStatus)
            } else {
              currentUpdaterStatus = {
                ...currentUpdaterStatus,
                state: 'error',
                error: 'Update download failed or timed out. Please retry.'
              }
              notifyUpdaterListeners(currentUpdaterStatus)
            }
          })
        } else if (res.state === 'up-to-date') {
          currentUpdaterStatus = {
            state: 'not-available',
            currentVersion: res.currentVersion || '3.0.5'
          }
        } else {
          currentUpdaterStatus = {
            state: 'error',
            currentVersion: '3.0.5',
            error: res.error
          }
        }
        notifyUpdaterListeners(currentUpdaterStatus)
        return currentUpdaterStatus
      },
      getStatus: () => Promise.resolve(currentUpdaterStatus),
      install: async () => {
        if (currentUpdaterStatus.state === 'downloaded') {
          const applied = await applyDownloadedUpdate()
          if (!applied) {
            currentUpdaterStatus = {
              ...currentUpdaterStatus,
              state: 'error',
              error: 'Failed to apply update installer'
            }
            notifyUpdaterListeners(currentUpdaterStatus)
            return false
          }
          return true
        }

        currentUpdaterStatus = { ...currentUpdaterStatus, state: 'downloading', progressPercent: 0 }
        notifyUpdaterListeners(currentUpdaterStatus)
        const ok = await installDownloadedUpdate((percent) => {
          currentUpdaterStatus = {
            ...currentUpdaterStatus,
            state: 'downloading',
            progressPercent: percent
          }
          notifyUpdaterListeners(currentUpdaterStatus)
        })
        if (ok) {
          currentUpdaterStatus = {
            ...currentUpdaterStatus,
            state: 'downloaded',
            progressPercent: 100
          }
          notifyUpdaterListeners(currentUpdaterStatus)
          return true
        } else {
          currentUpdaterStatus = {
            ...currentUpdaterStatus,
            state: 'error',
            error: 'Failed to install update'
          }
          notifyUpdaterListeners(currentUpdaterStatus)
          return false
        }
      },
      onStatus: (callback) => {
        updaterListeners.add(callback)
        callback(currentUpdaterStatus)
        return () => {
          updaterListeners.delete(callback)
        }
      }
    }
  }

  return api
}
