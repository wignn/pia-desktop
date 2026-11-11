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
      lastUpdatedAt: null
    })
  })

  afterEach(() => {
    vi.useRealTimers()
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
