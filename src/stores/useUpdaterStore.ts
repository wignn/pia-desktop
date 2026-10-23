/**
 * PIA Terminal - Auto-Updater Store (Zustand)
 * Manages background update state, progress tracking, and on-demand installation.
 */

import { create } from 'zustand'
import type { UpdaterStatus } from '@shared/types'

interface UpdaterState {
  status: UpdaterStatus
  isChecking: boolean
  isBannerDismissed: boolean

  initUpdaterListener: () => () => void
  checkForUpdates: () => Promise<void>
  installUpdate: () => Promise<boolean>
  dismissBanner: () => void
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  status: {
    state: 'idle',
    currentVersion: '3.0.10'
  },
  isChecking: false,
  isBannerDismissed: false,

  dismissBanner: () => set({ isBannerDismissed: true }),

  initUpdaterListener: () => {
    // Fetch initial status
    window.api?.updater?.getStatus?.().then((initialStatus) => {
      if (initialStatus) {
        set({ status: initialStatus })
      }
    }).catch((err) => {
      console.warn('[useUpdaterStore] Failed to get initial status:', err)
    })

    // Listen for push events from main process
    const unsubscribe = window.api?.updater?.onStatus?.((status) => {
      set({
        status,
        isChecking: status.state === 'checking',
        isBannerDismissed: status.state === 'idle' || status.state === 'not-available' ? true : get().isBannerDismissed
      })
    })

    return unsubscribe || (() => {})
  },

  checkForUpdates: async () => {
    set({ isChecking: true })
    try {
      const status = await window.api.updater.check()
      set({
        status,
        isChecking: false,
        isBannerDismissed: status.state === 'available' || status.state === 'downloading' || status.state === 'downloaded' ? false : get().isBannerDismissed
      })
    } catch (err) {
      set({
        isChecking: false,
        status: {
          ...get().status,
          state: 'error',
          error: err instanceof Error ? err.message : String(err)
        }
      })
    }
  },

  installUpdate: async () => {
    try {
      return await window.api.updater.install()
    } catch (err) {
      console.error('[useUpdaterStore] Failed to trigger install:', err)
      return false
    }
  }
}))
