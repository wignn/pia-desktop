/**
 * PIA Terminal - Tab Management Store (Zustand)
 * Manages TradingView Desktop-style tabs at the top of the terminal.
 */

import { create } from 'zustand'
import type { TerminalTabItem, Timeframe, ChartLayoutData, MacroMetricType } from '@shared/types'
import { useMarketStore } from './useMarketStore'
import { useChartStore } from './useChartStore'
import { useWorkspaceStore, type RightPanelTab } from './useWorkspaceStore'

interface TabState {
  tabs: TerminalTabItem[]
  activeTabId: string

  // Actions
  addTab: (custom?: Partial<TerminalTabItem>) => string
  closeTab: (tabId: string) => void
  setActiveTabId: (tabId: string) => void
  updateActiveTabSymbol: (symbol: string) => void
  updateActiveTabTimeframe: (timeframe: Timeframe) => void
  openLayoutInActiveTab: (layout: ChartLayoutData) => void
  openLayoutInNewTab: (layout: ChartLayoutData) => string
  openHubInNewTab: () => string
  switchToHub: () => void
  openMacroMapsInNewTab: (metric?: MacroMetricType) => string
  switchToMacroMaps: (metric?: MacroMetricType) => void
}

const defaultInitialTabs: TerminalTabItem[] = [
  {
    id: 'tab_initial_main',
    title: 'Live Chart',
    type: 'chart',
    layoutId: 'layout_live_main',
    symbol: '',
    timeframe: '1h',
    customName: 'Live Chart'
  }
]

export const useTabStore = create<TabState>((set, get) => ({
  tabs: defaultInitialTabs,
  activeTabId: 'tab_initial_main',

  addTab: (custom = {}) => {
    const id = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const marketState = useMarketStore.getState()
    const newTab: TerminalTabItem = {
      id,
      title: custom.title || custom.symbol || 'New Tab',
      type: custom.type || 'hub',
      layoutId: custom.layoutId,
      symbol: custom.symbol || marketState.symbol || '',
      timeframe: custom.timeframe || marketState.timeframe || '1h',
      customName: custom.customName
    }

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: id
    }))

    // If opening a chart tab, synchronize market store
    if (newTab.type === 'chart') {
      useMarketStore.getState().setSymbol(newTab.symbol)
      useMarketStore.getState().setTimeframe(newTab.timeframe)
    }

    return id
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get()
    if (tabs.length <= 1) {
      // If closing the only remaining tab, switch it to Supercharts Hub
      set({
        tabs: [
          {
            id: `tab_${Date.now()}`,
            title: 'Supercharts Hub',
            type: 'hub',
            symbol: '',
            timeframe: '1h'
          }
        ],
        activeTabId: `tab_${Date.now()}`
      })
      return
    }

    const targetIdx = tabs.findIndex((t) => t.id === tabId)
    const remainingTabs = tabs.filter((t) => t.id !== tabId)

    let nextActiveId = activeTabId
    if (activeTabId === tabId) {
      // Switch to adjacent tab
      const nextIdx = Math.max(0, targetIdx - 1)
      const nextTab = remainingTabs[nextIdx] || remainingTabs[0]
      nextActiveId = nextTab.id

      if (nextTab.type === 'chart') {
        useMarketStore.getState().setSymbol(nextTab.symbol)
        useMarketStore.getState().setTimeframe(nextTab.timeframe)
      }
    }

    set({
      tabs: remainingTabs,
      activeTabId: nextActiveId
    })
  },

  setActiveTabId: (tabId: string) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return

    set({ activeTabId: tabId })

    if (tab.type === 'chart') {
      useMarketStore.getState().setSymbol(tab.symbol)
      useMarketStore.getState().setTimeframe(tab.timeframe)
    }
  },

  updateActiveTabSymbol: (symbol: string) => {
    const { activeTabId, tabs } = get()
    set({
      tabs: tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              symbol,
              title: t.customName ? t.customName : symbol
            }
          : t
      )
    })
  },

  updateActiveTabTimeframe: (timeframe: Timeframe) => {
    const { activeTabId, tabs } = get()
    set({
      tabs: tabs.map((t) => (t.id === activeTabId ? { ...t, timeframe } : t))
    })
  },

  openLayoutInActiveTab: (layout: ChartLayoutData) => {
    const { activeTabId, tabs } = get()

    // 1. Sync Market Store
    useMarketStore.getState().setSymbol(layout.symbol)
    useMarketStore.getState().setTimeframe(layout.timeframe)

    // 2. Sync Chart Store (chartType, indicators)
    const chartStore = useChartStore.getState()
    chartStore.setChartType(layout.chartType)

    // Apply indicators from layout
    if (layout.indicators && layout.indicators.length > 0) {
      // Reset active indicators to match layout
      useChartStore.setState({
        activeIndicators: layout.indicators.map((ind) => ({
          name: ind.name,
          shortName: ind.name,
          paneId: ind.paneId,
          visible: ind.visible
        }))
      })
    }

    // 3. Sync Workspace Store (activePanel)
    if (layout.activePanel) {
      useWorkspaceStore.getState().setActiveTab(layout.activePanel as RightPanelTab)
    }

    // 4. Update Tab metadata
    set({
      tabs: tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              title: layout.name,
              type: 'chart',
              layoutId: layout.id,
              symbol: layout.symbol,
              timeframe: layout.timeframe,
              customName: layout.name
            }
          : t
      )
    })
  },

  openLayoutInNewTab: (layout: ChartLayoutData) => {
    const id = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const newTab: TerminalTabItem = {
      id,
      title: layout.name,
      type: 'chart',
      layoutId: layout.id,
      symbol: layout.symbol,
      timeframe: layout.timeframe,
      customName: layout.name
    }

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: id
    }))

    // Apply layout state
    useMarketStore.getState().setSymbol(layout.symbol)
    useMarketStore.getState().setTimeframe(layout.timeframe)
    useChartStore.getState().setChartType(layout.chartType)
    if (layout.indicators && layout.indicators.length > 0) {
      useChartStore.setState({
        activeIndicators: layout.indicators.map((ind) => ({
          name: ind.name,
          shortName: ind.name,
          paneId: ind.paneId,
          visible: ind.visible
        }))
      })
    }
    if (layout.activePanel) {
      useWorkspaceStore.getState().setActiveTab(layout.activePanel as RightPanelTab)
    }

    return id
  },

  openHubInNewTab: () => {
    const id = `tab_hub_${Date.now()}`
    const newTab: TerminalTabItem = {
      id,
      title: 'Supercharts Hub',
      type: 'hub',
      symbol: '',
      timeframe: '1h'
    }

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: id
    }))

    return id
  },

  switchToHub: () => {
    const { activeTabId, tabs } = get()
    set({
      tabs: tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              type: 'hub',
              title: 'Supercharts Hub'
            }
          : t
      )
    })
  },

  openMacroMapsInNewTab: (metric: MacroMetricType = 'inflation') => {
    const id = `tab_macro_${Date.now()}`
    const metricLabels: Record<MacroMetricType, string> = {
      inflation: 'Inflation Rate',
      interest_rate: 'Interest Rate',
      gdp_growth: 'GDP Growth',
      unemployment: 'Unemployment Rate',
      debt_to_gdp: 'Debt to GDP'
    }
    const label = metricLabels[metric] || 'Macro Maps'
    const newTab: TerminalTabItem = {
      id,
      title: `Macro Maps - ${label}`,
      type: 'macromaps',
      symbol: '',
      timeframe: '1h',
      customName: `Macro Maps: ${label}`,
      macroMetric: metric
    }

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: id
    }))

    return id
  },

  switchToMacroMaps: (metric: MacroMetricType = 'inflation') => {
    const { activeTabId, tabs } = get()
    const metricLabels: Record<MacroMetricType, string> = {
      inflation: 'Inflation Rate',
      interest_rate: 'Interest Rate',
      gdp_growth: 'GDP Growth',
      unemployment: 'Unemployment Rate',
      debt_to_gdp: 'Debt to GDP'
    }
    const label = metricLabels[metric] || 'Macro Maps'
    set({
      tabs: tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              type: 'macromaps',
              title: `Macro Maps - ${label}`,
              customName: `Macro Maps: ${label}`,
              macroMetric: metric
            }
          : t
      )
    })
  }
}))
