/**
 * PIA Terminal - Settings Store (Zustand)
 * Manages API keys, endpoint configurations, and OS credential status.
 */

import { create } from 'zustand'
import type { CredentialStatus } from '@shared/types'

interface SettingsState {
  credentials: CredentialStatus | null
  isLoading: boolean
  isSaving: boolean
  errorMessage: string | null

  loadCredentials: () => Promise<void>
  saveApiKey: (apiKey: string, baseUrl?: string, wsUrl?: string) => Promise<boolean>
  clearApiKey: () => Promise<boolean>
  loginWithGoogle: () => Promise<boolean>
  logout: () => Promise<boolean>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  credentials: null,
  isLoading: false,
  isSaving: false,
  errorMessage: null,

  loadCredentials: async () => {
    // Only set isLoading: true on cold initial boot to prevent unmounting the active workspace
    if (get().credentials === null) {
      set({ isLoading: true, errorMessage: null })
    }
    try {
      const creds = await window.api.settings.getCredentials()
      set({ credentials: creds, isLoading: false })
    } catch (err) {
      set({
        credentials: {
          hasApiKey: false,
          isLoggedIn: false,
          isSecureStorage: false,
          baseUrl: 'https://api-engine.wign.dev',
          wsUrl: 'wss://api-engine.wign.dev/api/v1/ws'
        },
        isLoading: false,
        errorMessage: err instanceof Error ? err.message : 'Failed to load credentials'
      })
    }
  },

  saveApiKey: async (apiKey: string, baseUrl?: string, wsUrl?: string) => {
    set({ isSaving: true, errorMessage: null })
    try {
      const ok = await window.api.settings.saveApiKey({ apiKey, baseUrl, wsUrl })
      if (ok) {
        await get().loadCredentials()
      } else {
        set({ errorMessage: 'Could not save credentials to the system credential store.' })
      }
      set({ isSaving: false })
      return ok
    } catch (err) {
      set({
        isSaving: false,
        errorMessage: err instanceof Error ? err.message : 'Failed to save API key'
      })
      return false
    }
  },

  clearApiKey: async () => {
    set({ isSaving: true, errorMessage: null })
    try {
      const ok = await window.api.settings.clearApiKey()
      if (ok) {
        await get().loadCredentials()
      }
      set({ isSaving: false })
      return ok
    } catch (err) {
      set({
        isSaving: false,
        errorMessage: err instanceof Error ? err.message : 'Failed to clear API key'
      })
      return false
    }
  },

  loginWithGoogle: async () => {
    set({ isSaving: true, errorMessage: null })
    try {
      const ok = await window.api.settings.loginWithGoogle()
      if (ok) await get().loadCredentials()
      set({ isSaving: false })
      return ok
    } catch (err) {
      set({ isSaving: false, errorMessage: err instanceof Error ? err.message : 'Google login failed' })
      return false
    }
  },

  logout: async () => {
    set({ isSaving: true, errorMessage: null })
    try {
      const ok = await window.api.settings.logout()
      if (ok) await get().loadCredentials()
      set({ isSaving: false })
      return ok
    } catch (err) {
      set({ isSaving: false, errorMessage: err instanceof Error ? err.message : 'Logout failed' })
      return false
    }
  }
}))
