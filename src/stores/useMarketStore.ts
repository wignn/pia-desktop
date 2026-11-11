/**
 * PIA Terminal - Market Store (Zustand)
 * Manages active symbol, timeframe, streaming quotes, and connection health.
 */

import { create } from 'zustand'
import { TIMEFRAMES } from '@shared/types'
import type { ConnectionState, PriceQuote, SymbolInfo, Timeframe } from '@shared/types'
import { dispatchCandleTick } from '../services/candle-engine'
import { useAlertsStore } from './useAlertsStore'
import { usePaperTradingStore } from './usePaperTradingStore'
import type { KLineData } from 'klinecharts'

function isOlderQuote(quote: PriceQuote, previous?: PriceQuote): boolean {
  return Boolean(previous && !previous.timestampEstimated &&
    (quote.timestampEstimated || quote.timestamp < previous.timestamp))
}

interface MarketState {
  symbol: string | null
  timeframe: Timeframe
  symbols: SymbolInfo[]
  prices: Record<string, PriceQuote>
  connectionState: ConnectionState
  selectedBar: KLineData | null
  latestBar: KLineData | null
  isLoadingCandles: boolean

  // Actions
  setSymbol: (symbol: string | null) => void
  setTimeframe: (timeframe: Timeframe) => void
  setSymbolAndTimeframe: (symbol: string | null, timeframe: Timeframe) => void
  setSelectedBar: (bar: KLineData | null) => void
  setLatestBar: (bar: KLineData | null) => void
  setIsLoadingCandles: (isLoading: boolean) => void
  fetchSymbols: () => Promise<void>
  refreshActivePrice: () => Promise<void>
  subscribeToMarketEvents: () => () => void
}

const loadInitialSymbol = (): string => {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('pia_last_symbol')
      if (saved && saved.trim()) return saved.trim().toUpperCase()
    }
  } catch {
    // ignore
  }
  return 'XAUUSD'
}

const loadInitialTimeframe = (): Timeframe => {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('pia_last_timeframe')
      if (saved && TIMEFRAMES.includes(saved as Timeframe)) return saved as Timeframe
    }
  } catch {
    // ignore
  }
  return '15m'
}

export const useMarketStore = create<MarketState>((set, get) => ({
  symbol: loadInitialSymbol(),
  timeframe: loadInitialTimeframe(),
  symbols: [],
  prices: {},
  connectionState: { status: 'connecting' },
  selectedBar: null,
  latestBar: null,
  isLoadingCandles: false,

  setSymbol: (newSymbol: string | null) => {
    const cleanSymbol = newSymbol?.trim().toUpperCase() || null
    const oldSymbol = get().symbol
    if (oldSymbol === cleanSymbol) return
    if (!cleanSymbol) {
      if (oldSymbol) void window.api.market.unsubscribePrice(oldSymbol)
      set({ symbol: null, selectedBar: null, latestBar: null, isLoadingCandles: false })
      return
    }

    try {
      localStorage.setItem('pia_last_symbol', cleanSymbol)
    } catch {
      // ignore
    }

    // Switch subscription in main process only for valid provider symbols.
    if (oldSymbol) void window.api.market.unsubscribePrice(oldSymbol)
    void window.api.market.subscribePrice(cleanSymbol)

    set({ symbol: cleanSymbol, selectedBar: null, latestBar: null, isLoadingCandles: true })
  },

  setTimeframe: (newTimeframe: Timeframe) => {
    if (get().timeframe === newTimeframe) return

    try {
      localStorage.setItem('pia_last_timeframe', newTimeframe)
    } catch {
      // ignore
    }

    set({ timeframe: newTimeframe, selectedBar: null, latestBar: null, isLoadingCandles: true })
  },

  setSymbolAndTimeframe: (newSymbol: string | null, newTimeframe: Timeframe) => {
    const cleanSymbol = newSymbol?.trim().toUpperCase() || null
    const oldSymbol = get().symbol
    const isSymbolChanged = oldSymbol !== cleanSymbol
    const isTimeframeChanged = get().timeframe !== newTimeframe

    if (!isSymbolChanged && !isTimeframeChanged) return

    try {
      if (cleanSymbol) localStorage.setItem('pia_last_symbol', cleanSymbol)
      localStorage.setItem('pia_last_timeframe', newTimeframe)
    } catch {
      // ignore
    }

    if (isSymbolChanged && typeof window !== 'undefined' && window.api?.market) {
      if (oldSymbol) void window.api.market.unsubscribePrice(oldSymbol)
      if (cleanSymbol) void window.api.market.subscribePrice(cleanSymbol)
    }

    set({
      symbol: cleanSymbol,
      timeframe: newTimeframe,
      selectedBar: null,
      latestBar: null,
      isLoadingCandles: true
    })
  },

  setSelectedBar: (bar: KLineData | null) => {
    set({ selectedBar: bar })
  },

  setLatestBar: (bar: KLineData | null) => {
    set({ latestBar: bar })
  },

  setIsLoadingCandles: (isLoading: boolean) => {
    set({ isLoadingCandles: isLoading })
  },

  fetchSymbols: async () => {
    try {
      const [symbols, pricesList] = await Promise.all([
        window.api.market.getSymbols(),
        window.api.market.getPrices()
      ])

      const priceMap: Record<string, PriceQuote> = {}
      for (const p of pricesList) {
        priceMap[p.symbol] = p
      }

      set((state) => ({
        symbols,
        symbol:
          state.symbol && symbols.some((item) => item.symbol === state.symbol)
            ? state.symbol
            : symbols[0]?.symbol || null,
        prices: { ...priceMap, ...state.prices }
      }))

      if (
        (symbols.length > 0 || pricesList.length > 0) &&
        get().connectionState.status === 'connecting'
      ) {
        set({
          connectionState: {
            status: 'connected',
            latencyMs: 35,
            lastHeartbeat: Date.now()
          }
        })
      }

      // Re-fetch symbols if more were discovered during getPrices
      if (symbols.length < 50) {
        const updatedSymbols = await window.api.market.getSymbols()
        if (updatedSymbols.length > symbols.length) {
          set({ symbols: updatedSymbols })
        }
      }
    } catch (err) {
      console.error('Failed to fetch initial symbols and prices:', err)
    }
  },

  refreshActivePrice: async () => {
    const symbol = get().symbol
    if (!symbol) return
    try {
      const quote = await window.api.market.getPrice(symbol)
      if (quote) {
        set((state) => isOlderQuote(quote, state.prices[quote.symbol])
          ? state : { prices: { ...state.prices, [quote.symbol]: quote } })
      }
    } catch (err) {
      console.warn(`[MarketStore] Failed to refresh ${symbol}:`, err)
    }
  },

  subscribeToMarketEvents: () => {
    const cleanupConn = window.api.market.onConnectionState((state: ConnectionState) => {
      set({ connectionState: state })
    })

    let frameId: number | null = null
    let pendingPrices: Record<string, PriceQuote> = {}

    const flushPrices = (): void => {
      frameId = null
      if (Object.keys(pendingPrices).length === 0) return

      const updates = pendingPrices
      pendingPrices = {}
      set((state) => ({ prices: { ...state.prices, ...updates } }))
    }

    const schedulePriceFlush = (): void => {
      if (document.hidden || frameId !== null) return
      frameId = requestAnimationFrame(flushPrices)
    }

    // Publish visual quote state once per frame. Candle, alert, and position
    // evaluation below still receives every tick synchronously.
    const cleanupPrices = window.api.market.onPriceUpdate((quote: PriceQuote) => {
      const previous = pendingPrices[quote.symbol] ?? get().prices[quote.symbol]
      if (!Number.isFinite(quote.price) || quote.price <= 0 || !Number.isFinite(quote.timestamp) ||
        isOlderQuote(quote, previous)) return
      if (get().connectionState.status !== 'connected') {
        set({
          connectionState: {
            status: 'connected',
            latencyMs: get().connectionState.latencyMs ?? 35,
            lastHeartbeat: Date.now()
          }
        })
      }

      pendingPrices[quote.symbol] = quote
      schedulePriceFlush()

      dispatchCandleTick(quote)
      if (quote.timestampEstimated) return
      useAlertsStore.getState().checkPriceAlerts(quote)
      usePaperTradingStore.getState().checkPositionsSLTP(quote)
    })

    let disposed = false
    let fallbackInFlight = false
    let lastRecoveryAt = 0
    let lastReconnectAt = 0
    let sessionSymbol = ''
    let sessionCheckedAt = 0
    let sessionOpen: boolean | undefined
    const fallbackTimer = setInterval(async () => {
      const { symbol, connectionState, prices } = get()
      const now = Date.now()
      if (!symbol || document.hidden || fallbackInFlight || now - lastRecoveryAt < 5000) return
      const quote = pendingPrices[symbol] ?? prices[symbol]
      const isStale = !quote || quote.timestampEstimated || now - quote.timestamp > 5000

      if (connectionState.status !== 'connected' || isStale) {
        fallbackInFlight = true
        lastRecoveryAt = now
        let needsReconnect = false
        let streamBeforeRefresh: PriceQuote | undefined
        try {
          if (sessionSymbol !== symbol || now - sessionCheckedAt >= 60000) {
            const session = await window.api.market.getSession(symbol)
            sessionSymbol = symbol
            sessionCheckedAt = now
            sessionOpen = session?.sessionOpen
          }
          if (disposed || get().symbol !== symbol || sessionOpen === false) return
          const refreshed = await window.api.market.getPrice(symbol)
          needsReconnect = !refreshed || Boolean(quote && !quote.timestampEstimated && !refreshed.timestampEstimated &&
            refreshed.timestamp > quote.timestamp && (refreshed.price !== quote.price || refreshed.bid !== quote.bid || refreshed.ask !== quote.ask))
          if (disposed) return
          streamBeforeRefresh = pendingPrices[symbol] ?? get().prices[symbol]
          if (refreshed) {
            const previous = pendingPrices[symbol] ?? get().prices[symbol]
            if (!isOlderQuote(refreshed, previous)) {
              delete pendingPrices[symbol]
              set((state) => ({ prices: { ...state.prices, [refreshed.symbol]: refreshed } }))
            }
          }
        } catch (err) {
          streamBeforeRefresh = pendingPrices[symbol] ?? get().prices[symbol]
          needsReconnect = true
          console.warn(`[MarketStore] Fallback price refresh failed for ${symbol}:`, err)
        } finally {
          fallbackInFlight = false
          const streamAdvanced = streamBeforeRefresh && !streamBeforeRefresh.timestampEstimated && streamBeforeRefresh !== quote
          if (!disposed && get().symbol === symbol && sessionOpen !== false && needsReconnect && !streamAdvanced &&
            Date.now() - lastReconnectAt >= 30000) {
            lastReconnectAt = Date.now()
            void window.api.market.reconnect?.().catch((err) => {
              console.warn('[MarketStore] Feed recovery failed:', err)
            })
          }
        }
      }
    }, 1000)

    const handleVisibilityChange = (): void => {
      if (!document.hidden) {
        schedulePriceFlush()
        const currentConn = get().connectionState.status
        if (currentConn === 'disconnected' || currentConn === 'error') {
          if (window.api?.market?.reconnect) {
            void window.api.market.reconnect()
          }
        }
      }
    }
    const handleOnline = (): void => {
      if (window.api?.market?.reconnect) {
        void window.api.market.reconnect()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    // Subscribe only when the provider has supplied an active symbol and listeners are active.
    const activeSymbol = get().symbol
    if (activeSymbol) void window.api.market.subscribePrice(activeSymbol)

    return () => {
      disposed = true
      cleanupPrices()
      cleanupConn()
      clearInterval(fallbackTimer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      if (frameId !== null) cancelAnimationFrame(frameId)
      frameId = null
      pendingPrices = {}
      const currentSymbol = get().symbol
      if (currentSymbol) void window.api.market.unsubscribePrice(currentSymbol)
    }
  }
}))
