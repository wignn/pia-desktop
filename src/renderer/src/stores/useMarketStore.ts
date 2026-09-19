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
  setSelectedBar: (bar: KLineData | null) => void
  setLatestBar: (bar: KLineData | null) => void
  setIsLoadingCandles: (isLoading: boolean) => void
  fetchSymbols: () => Promise<void>
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
      const symbols = await window.api.market.getSymbols()
      set((state) => ({
        symbols,
        symbol:
          state.symbol && symbols.some((item) => item.symbol === state.symbol)
            ? state.symbol
            : symbols[0]?.symbol || null
      }))

      // Fetch initial price snapshot
      const pricesList = await window.api.market.getPrices()
      const priceMap: Record<string, PriceQuote> = {}
      for (const p of pricesList) {
        priceMap[p.symbol] = p
      }
      set({ prices: priceMap })

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
      useAlertsStore.getState().checkPriceAlerts(quote)
      usePaperTradingStore.getState().checkPositionsSLTP(quote)
    })

    const handleVisibilityChange = (): void => {
      if (!document.hidden) schedulePriceFlush()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Subscribe only when the provider has supplied an active symbol and listeners are active.
    const activeSymbol = get().symbol
    if (activeSymbol) void window.api.market.subscribePrice(activeSymbol)

    return () => {
      cleanupPrices()
      cleanupConn()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (frameId !== null) cancelAnimationFrame(frameId)
      frameId = null
      pendingPrices = {}
      const currentSymbol = get().symbol
      if (currentSymbol) void window.api.market.unsubscribePrice(currentSymbol)
    }
  }
}))
