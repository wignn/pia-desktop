import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PriceQuote } from '@shared/types'
import { useAlertsStore } from './useAlertsStore'
import { useMarketStore } from './useMarketStore'
import { usePaperTradingStore } from './usePaperTradingStore'

let priceListener: ((quote: PriceQuote) => void) | undefined
let visibilityListener: (() => void) | undefined
let frameCallback: FrameRequestCallback | undefined
let hidden = false

if (!vi.stubGlobal) {
  vi.stubGlobal = (name: string, val: unknown) => {
    ;(globalThis as Record<string, unknown>)[name] = val
  }
}

beforeEach(() => {
  priceListener = undefined
  visibilityListener = undefined
  frameCallback = undefined
  hidden = false

  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn()
  })
  vi.stubGlobal('document', {
    get hidden() {
      return hidden
    },
    addEventListener: vi.fn((_event: string, listener: () => void) => {
      visibilityListener = listener
    }),
    removeEventListener: vi.fn()
  })
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback
      return 1
    })
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    api: {
      market: {
        getSession: vi.fn().mockResolvedValue({ symbol: 'XAUUSD', sessionOpen: true, timestamp: Date.now() }),
        subscribePrice: vi.fn().mockResolvedValue(undefined),
        unsubscribePrice: vi.fn().mockResolvedValue(undefined),
        onPriceUpdate: vi.fn((listener: (quote: PriceQuote) => void) => {
          priceListener = listener
          return vi.fn()
        }),
        onConnectionState: vi.fn(() => vi.fn())
      }
    }
  })
  useMarketStore.setState({
    symbol: 'XAUUSD',
    timeframe: '15m',
    prices: {},
    selectedBar: null,
    latestBar: null,
    isLoadingCandles: false
  })
})

afterEach(() => vi.useRealTimers())

describe('useMarketStore realtime prices', () => {
  it('recovers continuously delivered stale source prices without overlapping refreshes', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
    useMarketStore.setState({ connectionState: { status: 'connected' } })
    let finish!: (quote: PriceQuote) => void
    window.api.market.getPrice = vi.fn(() => new Promise<PriceQuote>((resolve) => { finish = resolve }))
    window.api.market.reconnect = vi.fn().mockResolvedValue(undefined)
    const unsubscribe = useMarketStore.getState().subscribeToMarketEvents()
    try {
      priceListener?.({ symbol: 'XAUUSD', price: 2990, timestamp: Date.now() - 180000, receivedAt: Date.now() })
      frameCallback?.(16)
      await vi.advanceTimersByTimeAsync(2000)
      expect(window.api.market.getPrice).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(10000)
      expect(window.api.market.getPrice).toHaveBeenCalledTimes(1)
      finish({ symbol: 'XAUUSD', price: 3010, timestamp: Date.now(), receivedAt: Date.now() })
      await Promise.resolve()
      expect(useMarketStore.getState().prices.XAUUSD.price).toBe(3010)
    } finally { unsubscribe() }
  })

  it('keeps a newer in-frame stream price when a recovery REST response arrives late', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
    useMarketStore.setState({ connectionState: { status: 'connected' } })
    let finish!: (quote: PriceQuote) => void
    window.api.market.getPrice = vi.fn(() => new Promise<PriceQuote>((resolve) => { finish = resolve }))
    const unsubscribe = useMarketStore.getState().subscribeToMarketEvents()
    try {
      await vi.advanceTimersByTimeAsync(1000)
      const restTimestamp = Date.now()
      await vi.advanceTimersByTimeAsync(1000)
      priceListener?.({ symbol: 'XAUUSD', price: 3010, timestamp: Date.now() })
      finish({ symbol: 'XAUUSD', price: 2990, timestamp: restTimestamp })
      await Promise.resolve()
      frameCallback?.(16)
      expect(useMarketStore.getState().prices.XAUUSD.price).toBe(3010)
    } finally { unsubscribe() }
  })

  it('reconnects a stale feed with a cooldown when REST cannot supply a fresh quote', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
    useMarketStore.setState({ connectionState: { status: 'connected' } })
    window.api.market.getPrice = vi.fn().mockResolvedValue(null)
    window.api.market.reconnect = vi.fn().mockResolvedValue(undefined)
    const unsubscribe = useMarketStore.getState().subscribeToMarketEvents()
    try {
      await vi.advanceTimersByTimeAsync(2000)
      expect(window.api.market.reconnect).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(20000)
      expect(window.api.market.reconnect).toHaveBeenCalledTimes(1)
    } finally { unsubscribe() }
  })

  it('does not repeatedly recover a closed market or reconnect a quiet unchanged quote', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
    const quote = { symbol: 'XAUUSD', price: 3000, timestamp: Date.now() - 60000 }
    useMarketStore.setState({ connectionState: { status: 'connected' }, prices: { XAUUSD: quote } })
    window.api.market.getSession = vi.fn().mockResolvedValue({ symbol: 'XAUUSD', sessionOpen: false, timestamp: Date.now() })
    window.api.market.getPrice = vi.fn().mockResolvedValue(quote)
    window.api.market.reconnect = vi.fn().mockResolvedValue(undefined)
    const unsubscribe = useMarketStore.getState().subscribeToMarketEvents()
    try {
      await vi.advanceTimersByTimeAsync(45000)
      expect(window.api.market.getPrice).not.toHaveBeenCalled()
      expect(window.api.market.reconnect).not.toHaveBeenCalled()
      vi.mocked(window.api.market.getSession).mockResolvedValue({ symbol: 'XAUUSD', sessionOpen: true, timestamp: Date.now() })
      await vi.advanceTimersByTimeAsync(30000)
      expect(window.api.market.getPrice).toHaveBeenCalled()
      expect(window.api.market.reconnect).not.toHaveBeenCalled()
    } finally { unsubscribe() }
  })

  it('does not treat an estimated timestamp as proof of source freshness', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
    useMarketStore.setState({ connectionState: { status: 'connected' }, prices: {
      XAUUSD: { symbol: 'XAUUSD', price: 3000, timestamp: Date.now(), timestampEstimated: true } as PriceQuote
    } })
    window.api.market.getPrice = vi.fn().mockResolvedValue(null)
    window.api.market.reconnect = vi.fn().mockResolvedValue(undefined)
    const unsubscribe = useMarketStore.getState().subscribeToMarketEvents()
    try {
      await vi.advanceTimersByTimeAsync(1000)
      expect(window.api.market.getPrice).toHaveBeenCalledOnce()
    } finally { unsubscribe() }
  })

  it('does not reconnect after the stream recovers while REST is in flight', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
    useMarketStore.setState({ connectionState: { status: 'connected' } })
    let finish!: (quote: PriceQuote | null) => void
    window.api.market.getPrice = vi.fn(() => new Promise<PriceQuote | null>((resolve) => { finish = resolve }))
    window.api.market.reconnect = vi.fn().mockResolvedValue(undefined)
    const unsubscribe = useMarketStore.getState().subscribeToMarketEvents()
    try {
      await vi.advanceTimersByTimeAsync(1000)
      priceListener?.({ symbol: 'XAUUSD', price: 3010, timestamp: Date.now() })
      finish(null)
      await Promise.resolve()
      expect(window.api.market.reconnect).not.toHaveBeenCalled()
    } finally { unsubscribe() }
  })

  it('recovers the socket even when the fallback HTTP request fails', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
    useMarketStore.setState({ connectionState: { status: 'connected' } })
    window.api.market.getPrice = vi.fn().mockRejectedValue(new Error('offline'))
    window.api.market.reconnect = vi.fn().mockResolvedValue(undefined)
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unsubscribe = useMarketStore.getState().subscribeToMarketEvents()
    try {
      await vi.advanceTimersByTimeAsync(2000)
      expect(window.api.market.reconnect).toHaveBeenCalledTimes(1)
    } finally { unsubscribe(); warning.mockRestore() }
  })

  it('does not roll back an in-frame quote with an older tick', () => {
    const unsubscribe = useMarketStore.getState().subscribeToMarketEvents()
    try {
      priceListener?.({ symbol: 'XAUUSD', price: 3010, timestamp: 2000 })
      priceListener?.({ symbol: 'XAUUSD', price: 2990, timestamp: 1000 })
      frameCallback?.(16)
      expect(useMarketStore.getState().prices.XAUUSD.price).toBe(3010)
    } finally { unsubscribe() }
  })

  it('publishes only the latest quote per symbol once per frame', () => {
    const unsubscribe = useMarketStore.getState().subscribeToMarketEvents()
    const first = { symbol: 'XAUUSD', price: 2600, timestamp: 1 }
    const latest = { symbol: 'XAUUSD', price: 2601, timestamp: 2 }
    const eurusd = { symbol: 'EURUSD', price: 1.1, timestamp: 2 }

    priceListener?.(first)
    priceListener?.(latest)
    priceListener?.(eurusd)

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(useMarketStore.getState().prices).toEqual({})

    frameCallback?.(16)

    expect(useMarketStore.getState().prices).toEqual({ XAUUSD: latest, EURUSD: eurusd })
    unsubscribe()
  })

  it('holds visual updates while hidden and flushes the latest quote when visible', () => {
    hidden = true
    const unsubscribe = useMarketStore.getState().subscribeToMarketEvents()
    const latest = { symbol: 'XAUUSD', price: 2602, timestamp: 3 }

    priceListener?.({ symbol: 'XAUUSD', price: 2601, timestamp: 2 })
    priceListener?.(latest)
    expect(requestAnimationFrame).not.toHaveBeenCalled()

    hidden = false
    visibilityListener?.()
    frameCallback?.(16)

    expect(useMarketStore.getState().prices.XAUUSD).toEqual(latest)
    unsubscribe()
  })

  it('evaluates alerts and positions for every tick before the visual frame', () => {
    const checkAlerts = vi.spyOn(useAlertsStore.getState(), 'checkPriceAlerts')
    const checkPositions = vi.spyOn(usePaperTradingStore.getState(), 'checkPositionsSLTP')
    const unsubscribe = useMarketStore.getState().subscribeToMarketEvents()
    const first = { symbol: 'XAUUSD', price: 2600, timestamp: 1 }
    const second = { symbol: 'XAUUSD', price: 2601, timestamp: 2 }

    priceListener?.(first)
    priceListener?.(second)

    expect(checkAlerts).toHaveBeenNthCalledWith(1, first)
    expect(checkAlerts).toHaveBeenNthCalledWith(2, second)
    expect(checkPositions).toHaveBeenNthCalledWith(1, first)
    expect(checkPositions).toHaveBeenNthCalledWith(2, second)
    expect(useMarketStore.getState().prices).toEqual({})
    unsubscribe()
  })

  it('cancels a pending frame and removes visibility listener on cleanup', () => {
    const unsubscribe = useMarketStore.getState().subscribeToMarketEvents()
    priceListener?.({ symbol: 'XAUUSD', price: 2600, timestamp: 1 })

    unsubscribe()

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
    expect(document.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      visibilityListener
    )
  })
})

describe('useMarketStore candle display state', () => {
  it('clears stale selected and latest bars when symbol changes', () => {
    const bar = { timestamp: 1, open: 1, high: 2, low: 1, close: 2 }
    useMarketStore.setState({ selectedBar: bar, latestBar: bar })

    useMarketStore.getState().setSymbol('EURUSD')

    expect(useMarketStore.getState()).toMatchObject({
      symbol: 'EURUSD',
      selectedBar: null,
      latestBar: null,
      isLoadingCandles: true
    })
  })

  it('clears stale selected and latest bars when timeframe changes', () => {
    const bar = { timestamp: 1, open: 1, high: 2, low: 1, close: 2 }
    useMarketStore.setState({ selectedBar: bar, latestBar: bar })

    useMarketStore.getState().setTimeframe('30m')

    expect(useMarketStore.getState()).toMatchObject({
      timeframe: '30m',
      selectedBar: null,
      latestBar: null,
      isLoadingCandles: true
    })
  })

  it('never sends an empty symbol while clearing selection', () => {
    useMarketStore.getState().setSymbol(null)

    expect(window.api.market.unsubscribePrice).toHaveBeenCalledWith('XAUUSD')
    expect(window.api.market.subscribePrice).not.toHaveBeenCalled()
    expect(useMarketStore.getState().symbol).toBeNull()
  })

  it('fetchSymbols fetches symbols and initial prices concurrently and hydrates price store', async () => {
    const mockSymbols = [
      { symbol: 'XAUUSD', name: 'Gold', category: 'metals' as const },
      { symbol: 'EURUSD', name: 'Euro', category: 'forex' as const }
    ]
    const mockPrices: PriceQuote[] = [
      { symbol: 'XAUUSD', price: 2750.5, timestamp: 1000, change24hPercent: 0.5 },
      { symbol: 'EURUSD', price: 1.085, timestamp: 1000, change24hPercent: -0.1 }
    ]

    window.api.market.getSymbols = vi.fn().mockResolvedValue(mockSymbols)
    window.api.market.getPrices = vi.fn().mockResolvedValue(mockPrices)

    await useMarketStore.getState().fetchSymbols()

    expect(window.api.market.getSymbols).toHaveBeenCalled()
    expect(window.api.market.getPrices).toHaveBeenCalled()
    expect(useMarketStore.getState().symbols).toEqual(mockSymbols)
    expect(useMarketStore.getState().prices['XAUUSD']).toEqual(mockPrices[0])
    expect(useMarketStore.getState().prices['EURUSD']).toEqual(mockPrices[1])
  })
})
