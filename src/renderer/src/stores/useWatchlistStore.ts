/**
 * PIA Terminal - Watchlist Store (Zustand)
 * Manages custom user watchlists with local SQLite persistence via IPC.
 */

import { create } from 'zustand'
import type { WatchlistGroup } from '@shared/types'

interface WatchlistState {
  watchlists: WatchlistGroup[]
  activeListId: string

  // Actions
  loadWatchlists: () => Promise<void>
  addSymbolToActiveList: (symbol: string) => Promise<void>
  removeSymbolFromActiveList: (symbol: string) => Promise<void>
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  watchlists: [
    {
      id: 'wl-default',
      name: 'Major Markets',
      symbols: []
    }
  ],
  activeListId: 'wl-default',

  loadWatchlists: async () => {
    try {
      const lists = await window.api.watchlist.getAll()
      if (lists && lists.length > 0) {
        set({
          watchlists: lists,
          activeListId: lists[0].id
        })
      }
    } catch (err) {
      console.error('Failed to load watchlists from SQLite:', err)
    }
  },

  addSymbolToActiveList: async (symbol: string) => {
    const { watchlists, activeListId } = get()
    const active = watchlists.find((w) => w.id === activeListId)
    if (!active || active.symbols.includes(symbol)) return

    const updated: WatchlistGroup = {
      ...active,
      symbols: [...active.symbols, symbol]
    }

    set({
      watchlists: watchlists.map((w) => (w.id === activeListId ? updated : w))
    })

    try {
      await window.api.watchlist.save(updated)
    } catch (err) {
      console.error('Failed to persist watchlist update:', err)
    }
  },

  removeSymbolFromActiveList: async (symbol: string) => {
    const { watchlists, activeListId } = get()
    const active = watchlists.find((w) => w.id === activeListId)
    if (!active) return

    const updated: WatchlistGroup = {
      ...active,
      symbols: active.symbols.filter((s) => s !== symbol)
    }

    set({
      watchlists: watchlists.map((w) => (w.id === activeListId ? updated : w))
    })

    try {
      await window.api.watchlist.save(updated)
    } catch (err) {
      console.error('Failed to persist watchlist removal:', err)
    }
  }
}))
