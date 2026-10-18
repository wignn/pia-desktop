/**
 * PIA Terminal - Watchlist Store (Zustand)
 * Manages custom user watchlists with local SQLite persistence via IPC.
 */

import { create } from 'zustand'
import type { WatchlistGroup } from '@shared/types'
import { resolveActiveWatchlistId, canDeleteWatchlist } from '../utils/watchlist-helpers'

const ACTIVE_WATCHLIST_STORAGE_KEY = 'pia_active_watchlist_id'

interface WatchlistState {
  watchlists: WatchlistGroup[]
  activeListId: string

  // Actions
  loadWatchlists: () => Promise<void>
  setActiveListId: (id: string) => void
  createWatchlist: (name: string) => Promise<WatchlistGroup | null>
  deleteWatchlist: (id: string) => Promise<boolean>
  renameWatchlist: (id: string, newName: string) => Promise<boolean>
  addSymbolToActiveList: (symbol: string) => Promise<void>
  removeSymbolFromActiveList: (symbol: string) => Promise<void>
}

const getPersistedActiveListId = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_WATCHLIST_STORAGE_KEY)
  } catch {
    return null
  }
}

const persistActiveListId = (id: string): void => {
  try {
    localStorage.setItem(ACTIVE_WATCHLIST_STORAGE_KEY, id)
  } catch {
    // Ignore in non-browser/restricted environments
  }
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  watchlists: [
    {
      id: 'wl-default',
      name: 'Major Markets',
      symbols: []
    }
  ],
  activeListId: getPersistedActiveListId() || 'wl-default',

  loadWatchlists: async () => {
    try {
      const lists = await window.api.watchlist.getAll()
      if (lists && lists.length > 0) {
        const persisted = getPersistedActiveListId()
        const resolvedId = resolveActiveWatchlistId(persisted, lists, lists[0].id)
        set({
          watchlists: lists,
          activeListId: resolvedId
        })
        persistActiveListId(resolvedId)
      } else {
        // Initialize default list if database is empty
        const defaultList: WatchlistGroup = {
          id: 'wl-default',
          name: 'Major Markets',
          symbols: []
        }
        await window.api.watchlist.save(defaultList)
        set({
          watchlists: [defaultList],
          activeListId: defaultList.id
        })
        persistActiveListId(defaultList.id)
      }
    } catch (err) {
      console.error('Failed to load watchlists from SQLite:', err)
    }
  },

  setActiveListId: (id: string) => {
    const { watchlists } = get()
    if (watchlists.some((w) => w.id === id)) {
      set({ activeListId: id })
      persistActiveListId(id)
    }
  },

  createWatchlist: async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return null

    const newList: WatchlistGroup = {
      id: `wl-${Date.now()}`,
      name: trimmed,
      symbols: []
    }

    try {
      await window.api.watchlist.save(newList)
      set((state) => ({
        watchlists: [...state.watchlists, newList],
        activeListId: newList.id
      }))
      persistActiveListId(newList.id)
      return newList
    } catch (err) {
      console.error('Failed to create watchlist:', err)
      return null
    }
  },

  deleteWatchlist: async (id: string) => {
    const { watchlists, activeListId } = get()
    if (!canDeleteWatchlist(watchlists)) {
      console.warn('Cannot delete the last remaining watchlist')
      return false
    }

    const target = watchlists.find((w) => w.id === id)
    if (!target) return false

    try {
      await window.api.watchlist.delete(id)
      const remaining = watchlists.filter((w) => w.id !== id)
      const nextActiveId = activeListId === id ? remaining[0].id : activeListId

      set({
        watchlists: remaining,
        activeListId: nextActiveId
      })
      persistActiveListId(nextActiveId)
      return true
    } catch (err) {
      console.error('Failed to delete watchlist:', err)
      return false
    }
  },

  renameWatchlist: async (id: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return false

    const { watchlists } = get()
    const target = watchlists.find((w) => w.id === id)
    if (!target) return false

    const updated: WatchlistGroup = {
      ...target,
      name: trimmed
    }

    try {
      await window.api.watchlist.save(updated)
      set((state) => ({
        watchlists: state.watchlists.map((w) => (w.id === id ? updated : w))
      }))
      return true
    } catch (err) {
      console.error('Failed to rename watchlist:', err)
      return false
    }
  },

  addSymbolToActiveList: async (symbol: string) => {
    const clean = symbol.trim().toUpperCase()
    if (!clean) return

    const { watchlists, activeListId } = get()
    const active = watchlists.find((w) => w.id === activeListId)
    if (!active || active.symbols.includes(clean)) return

    const updated: WatchlistGroup = {
      ...active,
      symbols: [...active.symbols, clean]
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
    const clean = symbol.trim().toUpperCase()
    const { watchlists, activeListId } = get()
    const active = watchlists.find((w) => w.id === activeListId)
    if (!active) return

    const updated: WatchlistGroup = {
      ...active,
      symbols: active.symbols.filter((s) => s.toUpperCase() !== clean)
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
