import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PriceQuote } from '@shared/types'
import { useAlertsStore } from './useAlertsStore'
import { useMarketStore } from './useMarketStore'
import { usePaperTradingStore } from './usePaperTradingStore'

let priceListener: ((quote: PriceQuote) => void) | undefined
let visibilityListener: (() => void) | undefined
let frameCallback: FrameRequestCallback | undefined
let hidden = false

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
    api: {
      market: {
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

describe('useMarketStore realtime prices', () => {
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
})
