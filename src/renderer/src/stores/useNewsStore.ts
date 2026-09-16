/**
 * PIA Terminal - Financial News Store (Zustand)
 * Manages breaking news stream and categories.
 */

import { create } from 'zustand'
import type { NewsArticle } from '@shared/types'

interface NewsState {
  articles: NewsArticle[]
  isLoading: boolean
  category: string | undefined

  fetchNews: () => Promise<void>
  setCategory: (category: string | undefined) => void
}

export const useNewsStore = create<NewsState>((set, get) => ({
  articles: [],
  isLoading: false,
  category: undefined,

  fetchNews: async () => {
    set({ isLoading: true })
    try {
      const items = await window.api.news.get({
        category: get().category,
        limit: 30
      })
      set({ articles: items, isLoading: false })
    } catch (err) {
      console.error('Failed to fetch news:', err)
      set({ isLoading: false })
    }
  },

  setCategory: (cat) => {
    set({ category: cat })
    get().fetchNews()
  }
}))
