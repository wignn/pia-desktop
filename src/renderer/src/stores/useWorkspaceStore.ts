/**
 * PIA Terminal - Workspace & Panel State (Zustand)
 * Manages right dock panel tab selection, collapse state, and modal dialogues.
 */

import { create } from 'zustand'

export type RightPanelTab =
  | 'watchlist'
  | 'orderbook'
  | 'intelligence'
  | 'options'
  | 'macro'
  | 'yields'
  | 'geosignals'
  | 'energy'
  | 'sec'
  | 'social'
  | 'calendar'
  | 'news'
  | 'alerts'
  | 'paper'
  | 'settings'
export type AppTheme = 'dark' | 'light'

const getInitialTheme = (): AppTheme => {
  try {
    const saved = localStorage.getItem('pia-theme')
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved)
      return saved
    }
  } catch {
    // fallback
  }
  document.documentElement.setAttribute('data-theme', 'dark')
  return 'dark'
}

const initialTheme = getInitialTheme()

interface WorkspaceState {
  theme: AppTheme
  activeTab: RightPanelTab
  isRightPanelOpen: boolean
  isSymbolSearchOpen: boolean
  isIndicatorModalOpen: boolean
  isSettingsModalOpen: boolean

  // Actions
  setTheme: (theme: AppTheme) => void
  toggleTheme: () => void
  setActiveTab: (tab: RightPanelTab) => void
  toggleRightPanel: () => void
  setSymbolSearchOpen: (open: boolean) => void
  setIndicatorModalOpen: (open: boolean) => void
  setSettingsModalOpen: (open: boolean) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  theme: initialTheme,
  activeTab: 'watchlist',
  isRightPanelOpen: true,
  isSymbolSearchOpen: false,
  isIndicatorModalOpen: false,
  isSettingsModalOpen: false,

  setTheme: (theme: AppTheme) => {
    try {
      localStorage.setItem('pia-theme', theme)
    } catch {
      // ignore
    }
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },

  toggleTheme: () =>
    set((state) => {
      const nextTheme: AppTheme = state.theme === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem('pia-theme', nextTheme)
      } catch {
        // ignore
      }
      document.documentElement.setAttribute('data-theme', nextTheme)
      return { theme: nextTheme }
    }),

  setActiveTab: (tab: RightPanelTab) =>
    set((state) => {
      // If clicking the currently active tab, toggle panel open/closed
      if (state.activeTab === tab) {
        return { isRightPanelOpen: !state.isRightPanelOpen }
      }
      return { activeTab: tab, isRightPanelOpen: true }
    }),

  toggleRightPanel: () => set((state) => ({ isRightPanelOpen: !state.isRightPanelOpen })),
  setSymbolSearchOpen: (open: boolean) => set({ isSymbolSearchOpen: open }),
  setIndicatorModalOpen: (open: boolean) => set({ isIndicatorModalOpen: open }),
  setSettingsModalOpen: (open: boolean) => set({ isSettingsModalOpen: open })
}))
