/**
 * PIA Terminal - Chart Layout Management Store (Zustand)
 * Manages full custom layout presets persisted to SQLite in Electron userData.
 */

import { create } from 'zustand'
import type { ChartLayoutData, IndicatorConfig, Timeframe } from '@shared/types'
import { useMarketStore } from './useMarketStore'
import { useChartStore } from './useChartStore'
import { useWorkspaceStore } from './useWorkspaceStore'
import { useTabStore } from './useTabStore'

interface LayoutState {
  layouts: ChartLayoutData[]
  activeLayout: ChartLayoutData | null
  isLoading: boolean
  searchQuery: string
  filterFavoritesOnly: boolean

  // Actions
  setSearchQuery: (query: string) => void
  setFilterFavoritesOnly: (favOnly: boolean) => void
  fetchLayouts: () => Promise<void>
  loadLayoutById: (id: string, inNewTab?: boolean) => Promise<boolean>
  saveCurrentLayout: (name?: string, description?: string) => Promise<ChartLayoutData | null>
  createBlankLayout: (
    name: string,
    symbol?: string,
    timeframe?: Timeframe
  ) => Promise<ChartLayoutData | null>
  duplicateLayout: (id: string) => Promise<ChartLayoutData | null>
  deleteLayout: (id: string) => Promise<boolean>
  toggleFavorite: (id: string) => Promise<void>
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layouts: [],
  activeLayout: null,
  isLoading: false,
  searchQuery: '',
  filterFavoritesOnly: false,

  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setFilterFavoritesOnly: (filterFavoritesOnly: boolean) => set({ filterFavoritesOnly }),

  fetchLayouts: async () => {
    try {
      set({ isLoading: true })
      const data = await window.api.layouts.getAll()
      set({ layouts: data })
    } catch (err) {
      console.error('[useLayoutStore] Failed to fetch layouts:', err)
    } finally {
      set({ isLoading: false })
    }
  },

  loadLayoutById: async (id: string, inNewTab = false) => {
    try {
      const layout = await window.api.layouts.get(id)
      if (!layout) return false

      set({ activeLayout: layout })

      if (inNewTab) {
        useTabStore.getState().openLayoutInNewTab(layout)
      } else {
        useTabStore.getState().openLayoutInActiveTab(layout)
      }
      return true
    } catch (err) {
      console.error('[useLayoutStore] Failed to load layout:', err)
      return false
    }
  },

  saveCurrentLayout: async (name?: string, description?: string) => {
    try {
      const marketState = useMarketStore.getState()
      const chartState = useChartStore.getState()
      const workspaceState = useWorkspaceStore.getState()
      const currentActive = get().activeLayout

      const layoutName = name || currentActive?.name || `${marketState.symbol} Custom Setup`
      const layoutId =
        currentActive && currentActive.name === layoutName
          ? currentActive.id
          : `layout_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

      const indicators: IndicatorConfig[] = chartState.activeIndicators.map((ind) => ({
        id: `ind_${ind.name.toLowerCase()}`,
        name: ind.name,
        paneId: ind.paneId,
        calcParams: ind.name === 'EMA' ? [20] : ind.name === 'RSI' ? [14] : [12, 26, 9],
        visible: ind.visible
      }))

      const now = Date.now()
      const layoutData: ChartLayoutData = {
        id: layoutId,
        name: layoutName,
        symbol: marketState.symbol ?? '',
        timeframe: marketState.timeframe,
        chartType: chartState.chartType,
        indicators,
        activePanel: workspaceState.activeTab,
        isFavorite: currentActive?.isFavorite ?? false,
        description:
          description || currentActive?.description || `Custom layout for ${marketState.symbol}`,
        createdAt: currentActive?.createdAt || now,
        updatedAt: now
      }

      const success = await window.api.layouts.save(layoutData)
      if (success) {
        set({ activeLayout: layoutData })
        await get().fetchLayouts()
        useTabStore.getState().updateActiveTabSymbol(layoutData.symbol)
        return layoutData
      }
      return null
    } catch (err) {
      console.error('[useLayoutStore] Failed to save layout:', err)
      return null
    }
  },

  createBlankLayout: async (name: string, symbol = '', timeframe: Timeframe = '1h') => {
    try {
      const id = `layout_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const now = Date.now()
      const newLayout: ChartLayoutData = {
        id,
        name,
        symbol,
        timeframe,
        chartType: 'candle_solid',
        indicators: [
          {
            id: 'default_ema_20',
            name: 'EMA',
            paneId: 'candle_pane',
            calcParams: [20],
            visible: true
          },
          {
            id: 'default_vol',
            name: 'VOL',
            paneId: 'vol_pane',
            calcParams: [],
            visible: true
          }
        ],
        activePanel: 'watchlist',
        isFavorite: false,
        description: `Custom layout for ${symbol}`,
        createdAt: now,
        updatedAt: now
      }

      const success = await window.api.layouts.save(newLayout)
      if (success) {
        await get().fetchLayouts()
        return newLayout
      }
      return null
    } catch (err) {
      console.error('[useLayoutStore] Failed to create blank layout:', err)
      return null
    }
  },

  duplicateLayout: async (id: string) => {
    try {
      const target = get().layouts.find((l) => l.id === id)
      if (!target) return null

      const newId = `layout_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const now = Date.now()
      const duplicated: ChartLayoutData = {
        ...target,
        id: newId,
        name: `${target.name} (Copy)`,
        createdAt: now,
        updatedAt: now
      }

      const success = await window.api.layouts.save(duplicated)
      if (success) {
        await get().fetchLayouts()
        return duplicated
      }
      return null
    } catch (err) {
      console.error('[useLayoutStore] Failed to duplicate layout:', err)
      return null
    }
  },

  deleteLayout: async (id: string) => {
    try {
      const success = await window.api.layouts.delete(id)
      if (success) {
        set((state) => ({
          layouts: state.layouts.filter((l) => l.id !== id),
          activeLayout: state.activeLayout?.id === id ? null : state.activeLayout
        }))
        return true
      }
      return false
    } catch (err) {
      console.error('[useLayoutStore] Failed to delete layout:', err)
      return false
    }
  },

  toggleFavorite: async (id: string) => {
    try {
      const layout = get().layouts.find((l) => l.id === id)
      if (!layout) return

      const updated: ChartLayoutData = {
        ...layout,
        isFavorite: !layout.isFavorite,
        updatedAt: Date.now()
      }

      await window.api.layouts.save(updated)
      set((state) => ({
        layouts: state.layouts.map((l) => (l.id === id ? updated : l)),
        activeLayout: state.activeLayout?.id === id ? updated : state.activeLayout
      }))
    } catch (err) {
      console.error('[useLayoutStore] Failed to toggle layout favorite:', err)
    }
  }
}))
