/**
 * PIA Terminal - Economic Calendar Store (Zustand)
 * Manages macroeconomic events feed and impact filtering.
 */

import { create } from 'zustand'
import type { EconomicEvent } from '@shared/types'

interface CalendarState {
  events: EconomicEvent[]
  isLoading: boolean
  impactFilter: 'all' | 'high' | 'medium' | 'low'

  fetchEvents: () => Promise<void>
  setImpactFilter: (impact: 'all' | 'high' | 'medium' | 'low') => void
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  isLoading: false,
  impactFilter: 'all',

  fetchEvents: async () => {
    set({ isLoading: true })
    try {
      const filter = get().impactFilter
      const items = await window.api.calendar.get({
        impact: filter === 'all' ? undefined : filter,
        limit: 50
      })
      set({ events: items, isLoading: false })
    } catch (err) {
      console.error('Failed to fetch calendar events:', err)
      set({ isLoading: false })
    }
  },

  setImpactFilter: (impact) => {
    set({ impactFilter: impact })
    get().fetchEvents()
  }
}))
