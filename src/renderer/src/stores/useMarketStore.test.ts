import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarketStore } from './useMarketStore'

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn()
  })
  vi.stubGlobal('window', {
    api: {
      market: {
        subscribePrice: vi.fn().mockResolvedValue(undefined),
        unsubscribePrice: vi.fn().mockResolvedValue(undefined)
      }
    }
  })
  useMarketStore.setState({
    symbol: 'XAUUSD',
    timeframe: '15m',
    selectedBar: null,
    latestBar: null,
    isLoadingCandles: false
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
