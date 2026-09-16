/**
 * PIA Terminal - Market Store (Zustand)
 * Manages active symbol, timeframe, streaming quotes, and connection health.
 */

import { create } from 'zustand'
import type { ConnectionState, PriceQuote, SymbolInfo, Timeframe } from '@shared/types'
import { candleEngine } from '../services/candle-engine'
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
  isLoadingCandles: boolean

  // Actions
  setSymbol: (symbol: string | null) => void
  setTimeframe: (timeframe: Timeframe) => void
  setSelectedBar: (bar: KLineData | null) => void
  fetchSymbols: () => Promise<void>
  subscribeToMarketEvents: () => () => void
}

export const useMarketStore = create<MarketState>((set, get) => ({
  symbol: null,
  timeframe: '1h',
  symbols: [],
  prices: {},
  connectionState: { status: 'connecting' },
  selectedBar: null,
  isLoadingCandles: false,

  setSymbol: (newSymbol: string | null) => {
    const cleanSymbol = newSymbol?.trim().toUpperCase() || null
    const oldSymbol = get().symbol
    if (oldSymbol === cleanSymbol) return
    if (!cleanSymbol) {
      if (oldSymbol) void window.api.market.unsubscribePrice(oldSymbol)
      set({ symbol: null })
      return
    }
    // Switch subscription in main process only for valid provider symbols.
    if (oldSymbol) void window.api.market.unsubscribePrice(oldSymbol)
    void window.api.market.subscribePrice(cleanSymbol)

    set({ symbol: cleanSymbol, isLoadingCandles: true })

    candleEngine.setSymbolAndTimeframe(cleanSymbol, get().timeframe).finally(() => {
      set({ isLoadingCandles: false })
    })
  },

  setTimeframe: (newTimeframe: Timeframe) => {
    if (get().timeframe === newTimeframe) return

    set({ timeframe: newTimeframe, isLoadingCandles: true })

    const activeSymbol = get().symbol
    if (!activeSymbol) {
      set({ isLoadingCandles: false })
      return
    }

    candleEngine.setSymbolAndTimeframe(activeSymbol, newTimeframe).finally(() => {
      set({ isLoadingCandles: false })
    })
  },

  setSelectedBar: (bar: KLineData | null) => {
    set({ selectedBar: bar })
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
    // Subscribe only when the provider has supplied an active symbol.
    const activeSymbol = get().symbol
    if (activeSymbol) void window.api.market.subscribePrice(activeSymbol)

    // Subscribe to realtime price ticks
    const cleanupPrices = window.api.market.onPriceUpdate((quote: PriceQuote) => {
      set((state) => ({
        prices: {
          ...state.prices,
          [quote.symbol]: quote
        }
      }))

      // Feed into candle engine
      candleEngine.handleTick(quote)

      // Evaluate price alerts
      useAlertsStore.getState().checkPriceAlerts(quote)

      // Evaluate paper trading SL/TP triggers
      usePaperTradingStore.getState().checkPositionsSLTP(quote)
    })

    // Subscribe to connection state changes
    const cleanupConn = window.api.market.onConnectionState((state: ConnectionState) => {
      set({ connectionState: state })
    })

    return () => {
      cleanupPrices()
      cleanupConn()
      const activeSymbol = get().symbol
      if (activeSymbol) void window.api.market.unsubscribePrice(activeSymbol)
    }
  }
}))
