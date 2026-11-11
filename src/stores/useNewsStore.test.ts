import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useNewsStore, mergeNewsArticles } from './useNewsStore'
import type { NewsArticle } from '@shared/types'

describe('useNewsStore real-time news updates', () => {
  const getMock = vi.fn()
  const getLatestMock = vi.fn()
  let updateListener: ((incoming: NewsArticle | NewsArticle[]) => void) | null = null
  const onUpdateUnsubscribe = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    getMock.mockReset()
    getLatestMock.mockReset()
    onUpdateUnsubscribe.mockReset()
    updateListener = null

    ;(globalThis as any).window = {
      api: {
        news: {
          get: getMock,
          getLatest: getLatestMock,
          onUpdate: vi.fn((cb: (incoming: NewsArticle | NewsArticle[]) => void) => {
            updateListener = cb
            return () => {
              onUpdateUnsubscribe()
              if (updateListener === cb) updateListener = null
            }
          })
        }
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }

    useNewsStore.setState({
      articles: [],
      isLoading: false,
      category: undefined,
      lastUpdatedAt: null,
      notifications: [],
      notificationStartedAt: null,
      seenNotificationKeys: new Set(),
      selectedArticle: null
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const article = (id: string, publishedAt = Date.now()): NewsArticle => ({
    id, title: `News ${id}`, summary: 'Market update', url: `https://example.com/${id}`,
    source: 'Reuters', publishedAt, category: 'Macro'
  })

  it('notifies new stream news once even when repeated by polling with another ID', async () => {
    getMock.mockResolvedValue([article('historical', Date.now() - 60_000)])
    getLatestMock.mockResolvedValue([])
    const stop = useNewsStore.getState().startRealtimeSync()
    try {
      await vi.advanceTimersByTimeAsync(1)
      expect(useNewsStore.getState().notifications).toEqual([])
      const breaking = article('breaking')
      updateListener?.(breaking)
      expect(useNewsStore.getState().notifications.map((item) => item.id)).toEqual(['breaking'])
      useNewsStore.getState().dismissNotification('breaking')
      updateListener?.(breaking)
      getLatestMock.mockResolvedValue([{ ...breaking, id: 'different-rest-id' }])
      await useNewsStore.getState().fetchNews({ silent: true, notify: true })
      expect(useNewsStore.getState().notifications).toEqual([])
    } finally { stop() }
  })

  it('queues new polling news without losing a burst of stream headlines', async () => {
    getMock.mockResolvedValue([])
    getLatestMock.mockResolvedValue([])
    const stop = useNewsStore.getState().startRealtimeSync()
    try {
      await vi.advanceTimersByTimeAsync(1)
      updateListener?.([article('first'), article('second')])
      getLatestMock.mockResolvedValue([article('polled')])
      await vi.advanceTimersByTimeAsync(15_000)
      expect(useNewsStore.getState().notifications.map((item) => item.id)).toEqual(['first', 'second', 'polled'])
      useNewsStore.getState().dismissNotification('first')
      expect(useNewsStore.getState().notifications.map((item) => item.id)).toEqual(['second', 'polled'])
    } finally { stop() }
  })

  it('does not swallow new arrivals first discovered by a category refresh', async () => {
    getMock.mockResolvedValue([])
    getLatestMock.mockResolvedValue([])
    const stop = useNewsStore.getState().startRealtimeSync()
    try {
      await vi.advanceTimersByTimeAsync(1)
      getLatestMock.mockResolvedValue([article('discovered-on-category')])
      useNewsStore.getState().setCategory('Crypto')
      await vi.advanceTimersByTimeAsync(1)
      expect(useNewsStore.getState().notifications.map((item) => item.id)).toEqual(['discovered-on-category'])
    } finally { stop() }
  })

  it('allows distinct articles with the same recurring headline to notify', async () => {
    getMock.mockResolvedValue([])
    getLatestMock.mockResolvedValue([])
    const stop = useNewsStore.getState().startRealtimeSync()
    try {
      await vi.advanceTimersByTimeAsync(1)
      updateListener?.([{ ...article('one'), title: 'Gold market update' }, { ...article('two'), title: 'Gold market update' }])
      expect(useNewsStore.getState().notifications.map((item) => item.id)).toEqual(['one', 'two'])
    } finally { stop() }
  })

  it('clears selected notification news when the category changes', async () => {
    getMock.mockResolvedValue([])
    getLatestMock.mockResolvedValue([])
    const stop = useNewsStore.getState().startRealtimeSync()
    try {
      await vi.advanceTimersByTimeAsync(1)
      updateListener?.(article('macro-selection'))
      useNewsStore.getState().selectNotification('macro-selection')
      useNewsStore.getState().setCategory('Crypto')
      expect(useNewsStore.getState().selectedArticle).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
    } finally { stop() }
  })

  it('ignores reconnect history, category hydration, and sample articles', async () => {
    getMock.mockResolvedValue([])
    getLatestMock.mockResolvedValue([])
    const stop = useNewsStore.getState().startRealtimeSync()
    try {
      await vi.advanceTimersByTimeAsync(1)
      updateListener?.(article('reconnect-old', Date.now() - 60_000))
      updateListener?.(article('news-sample-1'))
      getMock.mockResolvedValue([article('category-history', Date.now() - 30_000)])
      useNewsStore.getState().setCategory('Macro')
      await vi.advanceTimersByTimeAsync(1)
      expect(useNewsStore.getState().notifications).toEqual([])
    } finally { stop() }
  })

  it('notifies news outside the displayed category and retains it when selected', async () => {
    getMock.mockResolvedValue([])
    getLatestMock.mockResolvedValue([])
    useNewsStore.setState({ category: 'Crypto' })
    const stop = useNewsStore.getState().startRealtimeSync()
    try {
      await vi.advanceTimersByTimeAsync(1)
      const breaking = article('gold')
      updateListener?.(breaking)
      expect(useNewsStore.getState().articles).toEqual([])
      expect(useNewsStore.getState().notifications).toEqual([breaking])
      useNewsStore.getState().selectNotification('gold')
      expect(useNewsStore.getState().selectedArticle).toEqual(breaking)
      expect(useNewsStore.getState().notifications).toEqual([])
    } finally { stop() }
  })

  it('does not deliver updates from a disposed sync or duplicate global consumers', async () => {
    let finish!: (items: NewsArticle[]) => void
    getMock.mockImplementation(() => new Promise<NewsArticle[]>((resolve) => { finish = resolve }))
    getLatestMock.mockResolvedValue([])
    const stop = useNewsStore.getState().startRealtimeSync()
    const stopPanel = useNewsStore.getState().startRealtimeSync()
    const lateListener = updateListener
    stopPanel()
    stop()
    lateListener?.(article('late-stream'))
    finish([article('late-rest')])
    await vi.advanceTimersByTimeAsync(1)
    expect(useNewsStore.getState().articles).toEqual([])
    expect(useNewsStore.getState().notifications).toEqual([])
    expect(onUpdateUnsubscribe).toHaveBeenCalledTimes(1)
  })

  it('merges and deduplicates articles sorted by publishedAt descending', () => {
    const existing: NewsArticle[] = [
      {
        id: 'art-1',
        title: 'Older Macro Story',
        summary: 'Summary 1',
        url: 'https://example.com/1',
        source: 'Reuters',
        publishedAt: 1000,
        category: 'Macro'
      }
    ]
    const incoming: NewsArticle[] = [
      {
        id: 'art-2',
        title: 'Breaking CPI Print',
        summary: 'Summary 2',
        url: 'https://example.com/2',
        source: 'Bloomberg',
        publishedAt: 2500,
        category: 'Macro'
      },
      {
        id: 'art-1',
        title: 'Older Macro Story',
        summary: 'Summary 1 updated',
        url: 'https://example.com/1',
        source: 'Reuters',
        publishedAt: 1000,
        category: 'Macro'
      }
    ]

    const merged = mergeNewsArticles(existing, incoming)
    expect(merged).toHaveLength(2)
    expect(merged[0].id).toBe('art-2')
    expect(merged[1].id).toBe('art-1')
    expect(merged[1].summary).toBe('Summary 1 updated')
  })

  it('performs silent background refresh without setting isLoading=true and prepends new articles', async () => {
    const initialArticle: NewsArticle = {
      id: 'live-1',
      title: 'Initial Market Open',
      summary: 'Equities open higher',
      url: 'https://example.com/live-1',
      source: 'CNBC',
      publishedAt: 10_000,
      category: 'Stocks'
    }
    getMock.mockResolvedValueOnce([initialArticle])
    getLatestMock.mockResolvedValueOnce([])

    await useNewsStore.getState().fetchNews()
    expect(useNewsStore.getState().articles).toHaveLength(1)
    expect(useNewsStore.getState().isLoading).toBe(false)

    const breakingArticle: NewsArticle = {
      id: 'live-2',
      title: 'Breaking: Fed Emergency Statement',
      summary: 'Rates held steady',
      url: 'https://example.com/live-2',
      source: 'Bloomberg',
      publishedAt: 20_000,
      category: 'Macro'
    }

    let loadingObservedDuringSilentPoll = false
    const unsub = useNewsStore.subscribe((state) => {
      if (state.isLoading) loadingObservedDuringSilentPoll = true
    })

    getMock.mockResolvedValueOnce([initialArticle])
    getLatestMock.mockResolvedValueOnce([breakingArticle])

    await useNewsStore.getState().fetchNews({ silent: true })
    unsub()

    expect(loadingObservedDuringSilentPoll).toBe(false)
    expect(useNewsStore.getState().articles.map((a) => a.id)).toEqual(['live-2', 'live-1'])
    expect(useNewsStore.getState().lastUpdatedAt).toBeTypeOf('number')
  })

  it('ingests real-time WebSocket news push and polls on interval via startRealtimeSync', async () => {
    const baseArticle: NewsArticle = {
      id: 'live-10',
      title: 'Gold Steady Before London Fix',
      summary: 'Bullion holds range',
      url: 'https://example.com/live-10',
      source: 'Reuters',
      publishedAt: 50_000,
      category: 'Commodities'
    }
    getMock.mockResolvedValue([baseArticle])
    getLatestMock.mockResolvedValue([])

    const stopSync = useNewsStore.getState().startRealtimeSync(15_000)
    await vi.advanceTimersByTimeAsync(10)

    expect(useNewsStore.getState().articles).toHaveLength(1)
    expect(updateListener).toBeTypeOf('function')

    // Push a real-time article over the WebSocket bridge
    const pushedArticle: NewsArticle = {
      id: 'ws-push-1',
      title: 'Flash: Bitcoin Crosses Key Level',
      summary: 'Spot volume spikes',
      url: 'https://example.com/ws-1',
      source: 'CoinDesk',
      publishedAt: 60_000,
      category: 'Crypto'
    }
    updateListener?.(pushedArticle)

    expect(useNewsStore.getState().articles.map((a) => a.id)).toEqual(['ws-push-1', 'live-10'])

    // Advance timer to trigger periodic background poll with a new article
    const polledArticle: NewsArticle = {
      id: 'poll-2',
      title: 'Treasury Auction Results',
      summary: 'Strong indirect bid',
      url: 'https://example.com/poll-2',
      source: 'Financial Times',
      publishedAt: 70_000,
      category: 'Macro'
    }
    getLatestMock.mockResolvedValueOnce([polledArticle])

    await vi.advanceTimersByTimeAsync(15_000)
    expect(useNewsStore.getState().articles.map((a) => a.id)).toEqual([
      'poll-2',
      'ws-push-1',
      'live-10'
    ])

    stopSync()
    expect(onUpdateUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
