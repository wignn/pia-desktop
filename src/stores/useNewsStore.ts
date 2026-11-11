/**
 * PIA Terminal - Financial News Store (Zustand)
 * Manages breaking news stream, real-time WebSocket updates, and silent background polling.
 */

import { create } from 'zustand'
import type { NewsArticle } from '@shared/types'

export interface FetchNewsOptions {
  silent?: boolean
  replace?: boolean
  notify?: boolean
}

interface NewsState {
  articles: NewsArticle[]
  isLoading: boolean
  category: string | undefined
  lastUpdatedAt: number | null
  notifications: NewsArticle[]
  notificationStartedAt: number | null
  seenNotificationKeys: Set<string>
  selectedArticle: NewsArticle | null

  dismissNotification: (id: string) => void
  selectNotification: (id: string) => void
  recordIncomingNews: (incoming: NewsArticle[], notify: boolean) => void
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

function notificationKeys(article: NewsArticle): string[] {
  const keys: string[] = []
  if (article.id) keys.push(`id:${article.id}`)
  if (article.url && article.url !== 'https://wign.dev') keys.push(`url:${article.url.trim()}`)
  if (keys.length === 0 && article.title?.trim()) keys.push(`title:${article.source}:${article.title.trim().toLowerCase()}`)
  return keys
}

let syncGeneration = 0
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
  notifications: [],
  notificationStartedAt: null,
  seenNotificationKeys: new Set(),
  selectedArticle: null,

  dismissNotification: (id) => set((state) => ({
    notifications: state.notifications.filter((item) => item.id !== id)
  })),

  selectNotification: (id) => set((state) => ({
    selectedArticle: state.notifications.find((item) => item.id === id) ?? state.selectedArticle,
    notifications: state.notifications.filter((item) => item.id !== id)
  })),

  recordIncomingNews: (incoming, notify) => {
    set((state) => {
      const seen = new Set(state.seenNotificationKeys)
      const fresh: NewsArticle[] = []
      for (const item of incoming) {
        if (!item || isSampleArticle(item)) continue
        const keys = notificationKeys(item)
        const known = keys.some((key) => seen.has(key))
        keys.forEach((key) => seen.add(key))
        const publishedAt = Number(item.publishedAt)
        if (notify && !known && keys.length > 0 && state.notificationStartedAt !== null &&
          Number.isFinite(publishedAt) && publishedAt >= state.notificationStartedAt &&
          publishedAt <= Date.now() + 5000) fresh.push(item)
      }
      // Keep notification identity memory bounded independently of the visible 60-item feed.
      while (seen.size > 6000) seen.delete(seen.values().next().value!)
      return {
        seenNotificationKeys: seen,
        notifications: [...state.notifications, ...fresh.sort((a, b) => a.publishedAt - b.publishedAt)].slice(-60)
      }
    })
  },

  fetchNews: async (options?: FetchNewsOptions) => {
    const silent = Boolean(options?.silent)
    const replace = Boolean(options?.replace)
    const activeCategory = get().category
    const generation = syncGeneration

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
      const allLatestItems =
        latestResult.status === 'fulfilled' && Array.isArray(latestResult.value)
          ? latestResult.value
          : []
      if (generation !== syncGeneration) return
      get().recordIncomingNews(mergeNewsArticles(feedItems, allLatestItems), options?.notify ?? activeSyncConsumers > 0)
      const latestItems = allLatestItems.filter((item) => matchesCategoryFilter(item, activeCategory))

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
    set({ category: cat, selectedArticle: null })
    void get().fetchNews({ replace: true })
  },

  ingestRealtimeNews: (incoming) => {
    const list = Array.isArray(incoming) ? incoming : [incoming]
    get().recordIncomingNews(list, true)
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
      const generation = ++syncGeneration
      if (get().notificationStartedAt === null) set({ notificationStartedAt: Date.now() })
      const initialSilent = get().articles.length > 0
      void get().fetchNews({ silent: initialSilent, notify: false })

      if (typeof window !== 'undefined' && typeof window.api?.news?.onUpdate === 'function') {
        wsUnsubscribe = window.api.news.onUpdate((incoming) => {
          if (generation === syncGeneration) get().ingestRealtimeNews(incoming)
        })
      }

      pollTimer = setInterval(() => {
        void get().fetchNews({ silent: true, notify: true })
      }, intervalMs)

      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        focusHandler = () => {
          void get().fetchNews({ silent: true, notify: true })
        }
        window.addEventListener('focus', focusHandler)
      }

      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        visibilityHandler = () => {
          if (document.visibilityState === 'visible') {
            void get().fetchNews({ silent: true, notify: true })
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
        syncGeneration += 1
        set({ isLoading: false, notifications: [], notificationStartedAt: null })
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
