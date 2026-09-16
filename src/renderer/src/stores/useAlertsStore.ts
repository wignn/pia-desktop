/**
 * PIA Terminal - Price Alerts Store (Zustand)
 * Manages local price alert creation, persistent storage via SQLite IPC,
 * and real-time tick evaluation with audio-visual notifications.
 */

import { create } from 'zustand'
import type { PriceAlert, PriceQuote } from '@shared/types'

function playAlertSound(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return

    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime) // A5
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.1) // D6

    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.35)
  } catch {
    // Audio playback error or autoplay policy restraint
  }
}

interface AlertsState {
  alerts: PriceAlert[]
  isLoading: boolean
  lastTriggeredAlert: PriceAlert | null
  previousPrices: Record<string, number>

  loadAlerts: () => Promise<void>
  createAlert: (params: {
    symbol: string
    targetPrice: number
    direction: 'above' | 'below' | 'cross'
    note?: string
  }) => Promise<boolean>
  deleteAlert: (id: string) => Promise<boolean>
  dismissBanner: () => void
  checkPriceAlerts: (quote: PriceQuote) => void
}

export const useAlertsStore = create<AlertsState>((set, get) => ({
  alerts: [],
  isLoading: false,
  lastTriggeredAlert: null,
  previousPrices: {},

  loadAlerts: async () => {
    set({ isLoading: true })
    try {
      const alerts = await window.api.alerts.getAll()
      set({ alerts, isLoading: false })
    } catch (err) {
      console.error('[AlertsStore] Failed to load alerts:', err)
      set({ isLoading: false })
    }
  },

  createAlert: async (params) => {
    const newAlert: PriceAlert = {
      id: 'alert_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      symbol: params.symbol.toUpperCase(),
      targetPrice: params.targetPrice,
      direction: params.direction,
      triggered: false,
      createdAt: Date.now(),
      note: params.note?.trim() || undefined
    }

    try {
      const success = await window.api.alerts.save(newAlert)
      if (success) {
        set((state) => ({
          alerts: [newAlert, ...state.alerts]
        }))
        return true
      }
      return false
    } catch (err) {
      console.error('[AlertsStore] Failed to create alert:', err)
      return false
    }
  },

  deleteAlert: async (id: string) => {
    try {
      const success = await window.api.alerts.delete(id)
      if (success) {
        set((state) => ({
          alerts: state.alerts.filter((a) => a.id !== id),
          lastTriggeredAlert: state.lastTriggeredAlert?.id === id ? null : state.lastTriggeredAlert
        }))
        return true
      }
      return false
    } catch (err) {
      console.error('[AlertsStore] Failed to delete alert:', err)
      return false
    }
  },

  dismissBanner: () => set({ lastTriggeredAlert: null }),

  checkPriceAlerts: (quote: PriceQuote) => {
    const { alerts, previousPrices } = get()
    const currentPrice = quote.price
    const prevPrice = previousPrices[quote.symbol] ?? currentPrice
    const symbol = quote.symbol

    // Update previous price record
    set((state) => ({
      previousPrices: {
        ...state.previousPrices,
        [symbol]: currentPrice
      }
    }))

    const pendingAlerts = alerts.filter((a) => !a.triggered && a.symbol === symbol)
    if (pendingAlerts.length === 0) return

    for (const alert of pendingAlerts) {
      let isTriggered = false

      if (alert.direction === 'above') {
        if (currentPrice >= alert.targetPrice) {
          isTriggered = true
        }
      } else if (alert.direction === 'below') {
        if (currentPrice <= alert.targetPrice) {
          isTriggered = true
        }
      } else if (alert.direction === 'cross') {
        const crossedFromBelow = prevPrice < alert.targetPrice && currentPrice >= alert.targetPrice
        const crossedFromAbove = prevPrice > alert.targetPrice && currentPrice <= alert.targetPrice
        if (crossedFromBelow || crossedFromAbove || currentPrice === alert.targetPrice) {
          isTriggered = true
        }
      }

      if (isTriggered) {
        const updatedAlert: PriceAlert = {
          ...alert,
          triggered: true,
          triggeredAt: Date.now()
        }

        // Save triggered state to SQLite
        window.api.alerts.save(updatedAlert).catch((err) => {
          console.error('[AlertsStore] Failed to save triggered alert:', err)
        })

        // Trigger audio chime
        playAlertSound()

        // Update in-memory state and present banner
        set((state) => ({
          alerts: state.alerts.map((a) => (a.id === alert.id ? updatedAlert : a)),
          lastTriggeredAlert: updatedAlert
        }))
      }
    }
  }
}))
