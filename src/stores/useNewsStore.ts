/**
 * PIA Terminal - Financial News Store (Zustand)
 * Manages breaking news stream, real-time WebSocket updates, and silent background polling.
 */

import { create } from 'zustand'
import type { NewsArticle } from '@shared/types'

export interface FetchNewsOptions {
  silent?: boolean
  replace?: boolean
}

interface NewsState {
  articles: NewsArticle[]
  isLoading: boolean
  category: string | undefined
  lastUpdatedAt: number | null

  fetchNews: (options?: FetchNewsOptions) => Promise<void>
  setCategory: (category: string | undefined) => void
  ingestRealtimeNews: (incoming: NewsArticle | NewsArticle[]) => void
  startRealtimeSync: (intervalMs?: number) => () => void
}

const DEFAULT_POLL_INTERVAL_MS = 15_000
const MAX_STORED_ARTICLES = 60

function isSampleArticle(article: NewsArticle): boolean {
  return typeof article.id === 'string' && article.id.startsWith('news-sample-')
}

function matchesCategoryFilter(article: NewsArticle, category?: string): boolean {
  if (!category || category.toLowerCase() === 'all') return true
  if (!article.category) return true
  return article.category.toLowerCase() === category.toLowerCase()
}

export function mergeNewsArticles(
  existing: NewsArticle[],
  incoming: NewsArticle[],
  maxItems = MAX_STORED_ARTICLES
): NewsArticle[] {
  const hasRealExisting = existing.some((a) => !isSampleArticle(a))
  const hasRealIncoming = incoming.some((a) => !isSampleArticle(a))
  const useOnlyReal = hasRealExisting || hasRealIncoming

  const byKey = new Map<string, NewsArticle>()

  const getKey = (item: NewsArticle): string => {
    if (item.id && String(item.id).trim()) return `id:${String(item.id).trim()}`
    if (item.url && item.url !== 'https://wign.dev') return `url:${item.url.trim()}`
    return `title:${(item.title || '').trim().toLowerCase()}`
  }

  for (const item of existing) {
    if (!item || (useOnlyReal && isSampleArticle(item))) continue
    byKey.set(getKey(item), item)
  }

  for (const item of incoming) {
    if (!item || (useOnlyReal && isSampleArticle(item))) continue
    const key = getKey(item)
    const prev = byKey.get(key)
    byKey.set(key, prev ? { ...prev, ...item } : item)
  }

  return Array.from(byKey.values())
    .sort((a, b) => (Number(b.publishedAt) || 0) - (Number(a.publishedAt) || 0))
    .slice(0, maxItems)
}

let activeSyncConsumers = 0
let pollTimer: ReturnType<typeof setInterval> | null = null
let wsUnsubscribe: (() => void) | null = null
let focusHandler: (() => void) | null = null
let visibilityHandler: (() => void) | null = null

export const useNewsStore = create<NewsState>((set, get) => ({
  articles: [],
  isLoading: false,
  category: undefined,
  lastUpdatedAt: null,

  fetchNews: async (options?: FetchNewsOptions) => {
    const silent = Boolean(options?.silent)
    const replace = Boolean(options?.replace)
    const activeCategory = get().category

    if (!silent) {
      set({ isLoading: true })
    }

    try {
      const newsApi = window.api?.news
      if (!newsApi) {
        if (!silent) set({ isLoading: false })
        return
      }

      const [feedResult, latestResult] = await Promise.allSettled([
        newsApi.get({
          category: activeCategory,
          limit: 30
        }),
        typeof newsApi.getLatest === 'function' ? newsApi.getLatest() : Promise.resolve([])
      ])

      const feedItems =
        feedResult.status === 'fulfilled' && Array.isArray(feedResult.value)
          ? feedResult.value
          : []
      const latestItems =
        latestResult.status === 'fulfilled' && Array.isArray(latestResult.value)
          ? latestResult.value.filter((item) => matchesCategoryFilter(item, activeCategory))
          : []

      // Guard against stale response if category changed while request was in flight
      if (get().category !== activeCategory) {
        return
      }

      const incoming = mergeNewsArticles(feedItems, latestItems)
      const baseArticles = replace ? [] : get().articles
      const merged =
        incoming.length > 0 ? mergeNewsArticles(baseArticles, incoming) : baseArticles

      set({
        articles: merged,
        isLoading: false,
        lastUpdatedAt: Date.now()
      })
    } catch (err) {
      console.error('Failed to fetch news:', err)
      if (!silent) {
        set({ isLoading: false })
      }
    }
  },

  setCategory: (cat) => {
    set({ category: cat })
    void get().fetchNews({ replace: true })
  },

  ingestRealtimeNews: (incoming) => {
    const list = Array.isArray(incoming) ? incoming : [incoming]
    const activeCategory = get().category
    const filtered = list.filter(
      (item): item is NewsArticle =>
        Boolean(item && typeof item === 'object' && matchesCategoryFilter(item, activeCategory))
    )
    if (filtered.length === 0) return

    set((state) => ({
      articles: mergeNewsArticles(state.articles, filtered),
      lastUpdatedAt: Date.now()
    }))
  },

  startRealtimeSync: (intervalMs = DEFAULT_POLL_INTERVAL_MS) => {
    activeSyncConsumers += 1

    if (activeSyncConsumers === 1) {
      const initialSilent = get().articles.length > 0
      void get().fetchNews({ silent: initialSilent })

      if (typeof window !== 'undefined' && typeof window.api?.news?.onUpdate === 'function') {
        wsUnsubscribe = window.api.news.onUpdate((incoming) => {
          get().ingestRealtimeNews(incoming)
        })
      }

      pollTimer = setInterval(() => {
        void get().fetchNews({ silent: true })
      }, intervalMs)

      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        focusHandler = () => {
          void get().fetchNews({ silent: true })
        }
        window.addEventListener('focus', focusHandler)
      }

      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        visibilityHandler = () => {
          if (document.visibilityState === 'visible') {
            void get().fetchNews({ silent: true })
          }
        }
        document.addEventListener('visibilitychange', visibilityHandler)
      }
    }

    let cleanedUp = false
    return () => {
      if (cleanedUp) return
      cleanedUp = true
      activeSyncConsumers = Math.max(0, activeSyncConsumers - 1)

      if (activeSyncConsumers === 0) {
        if (pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }
        if (wsUnsubscribe) {
          wsUnsubscribe()
          wsUnsubscribe = null
        }
        if (
          focusHandler &&
          typeof window !== 'undefined' &&
          typeof window.removeEventListener === 'function'
        ) {
          window.removeEventListener('focus', focusHandler)
          focusHandler = null
        }
        if (
          visibilityHandler &&
          typeof document !== 'undefined' &&
          typeof document.removeEventListener === 'function'
        ) {
          document.removeEventListener('visibilitychange', visibilityHandler)
          visibilityHandler = null
        }
      }
    }
  }
}))
