import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CandleEngine, dispatchCandleTick, registerCandleEngine } from './candle-engine'
import type { CandleBar, PriceQuote } from '@shared/types'

const history: CandleBar[] = [
  { timestamp: 1_699_999_200, open: 100, high: 105, low: 98, close: 103, volume: 42 },
  { timestamp: 1_700_001_000, open: 103, high: 108, low: 102, close: 107, volume: 55 }
]

if (!vi.stubGlobal) {
  vi.stubGlobal = (name: string, val: unknown) => {
    ;(globalThis as Record<string, unknown>)[name] = val
  }
}

beforeEach(() => {
  const store: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] }
  })
  vi.stubGlobal('window', {
    api: {
      market: {
        getCandles: vi.fn().mockResolvedValue(history)
      }
    }
  })
})

describe('CandleEngine', () => {
  it('normalizes history, preserves the newest bar, and notifies listeners', async () => {
    const engine = new CandleEngine()
    const onHistoryLoaded = vi.fn()
    engine.addListener({ onHistoryLoaded, onBarUpdate: vi.fn() })

    const bars = await engine.setSymbolAndTimeframe('XAUUSD', '1m')

    expect(bars).toHaveLength(2)
    expect(bars.at(-1)).toMatchObject({ open: 103, high: 108, low: 102, close: 107 })
    expect(onHistoryLoaded).toHaveBeenCalledWith(engine.getGenerationId(), bars)
  })

  it('hydrates matching saved candles immediately and refreshes the snapshot from network', async () => {
    const refreshed = [
      ...history,
      { timestamp: 1_700_002_000, open: 107, high: 110, low: 106, close: 109, volume: 60 }
    ]
    const getCandles = vi.fn().mockResolvedValue(refreshed)
    vi.stubGlobal('window', { api: { market: { getCandles } } })
    localStorage.setItem('pia_chart_snapshot_v1', JSON.stringify({
      symbol: 'XAUUSD', timeframe: '1m', bars: history
    }))
    const engine = new CandleEngine()
    const onCachedBars = vi.fn()
    const onBarUpdate = vi.fn()
    engine.addListener({ onHistoryLoaded: vi.fn(), onBarUpdate })
    const loaded = engine.setSymbolAndTimeframe('XAUUSD', '1m', 300, onCachedBars)

    expect(onCachedBars).toHaveBeenCalledOnce()
    expect(onCachedBars.mock.calls[0][0]).toHaveLength(2)
    expect(getCandles).toHaveBeenCalledOnce()

    const bars = await loaded
    expect(bars).toHaveLength(3)
    expect(onBarUpdate).toHaveBeenCalledWith(engine.getGenerationId(), expect.objectContaining({
      timestamp: 1_700_001_000_000,
      close: 107
    }))
    expect(onBarUpdate).toHaveBeenCalledWith(engine.getGenerationId(), expect.objectContaining({
      timestamp: 1_700_002_000_000,
      close: 109
    }))
    expect(JSON.parse(localStorage.getItem('pia_chart_snapshot_v1')!).bars).toHaveLength(3)
  })

  it('ignores malformed or mismatched snapshots and fetches from network', async () => {
    localStorage.setItem('pia_chart_snapshot_v1', '{bad json')
    const onCachedBars = vi.fn()
    const engine = new CandleEngine()
    const bars = await engine.setSymbolAndTimeframe('BTCUSDT', '1m', 300, onCachedBars)

    expect(onCachedBars).not.toHaveBeenCalled()
    expect(bars).toHaveLength(2)
  })

  it('does not render cached bars after the active pair changed', async () => {
    let resolveRequest!: (bars: CandleBar[]) => void
    const getCandles = vi.fn()
      .mockImplementationOnce(() => new Promise<CandleBar[]>((resolve) => {
        resolveRequest = resolve
      }))
      .mockResolvedValue(history)
    vi.stubGlobal('window', { api: { market: { getCandles } } })
    localStorage.setItem('pia_chart_snapshot_v1', JSON.stringify({
      symbol: 'XAUUSD', timeframe: '1m', bars: history
    }))
    const engine = new CandleEngine()
    const cached = vi.fn()
    const pending = engine.setSymbolAndTimeframe('XAUUSD', '1m', 300, cached)
    await engine.setSymbolAndTimeframe('BTCUSDT', '1m')
    expect(cached).toHaveBeenCalledOnce()
    resolveRequest(history)
    await pending
    expect(engine.getSymbol()).toBe('BTCUSDT')
  })

  it('updates OHLC while preserving historical volume for the active bucket', async () => {
    const engine = new CandleEngine()
    const onBarUpdate = vi.fn()
    engine.addListener({ onHistoryLoaded: vi.fn(), onBarUpdate })
    const bars = await engine.setSymbolAndTimeframe('XAUUSD', '1m')
    const latest = bars.at(-1)!
    const quote: PriceQuote = {
      symbol: 'XAUUSD',
      price: 110,
      bid: 109,
      ask: 111,
      timestamp: latest.timestamp + 1_000
    }

    engine.handleTick(quote)

    expect(engine.getActiveBars().at(-1)).toMatchObject({
      open: 103,
      high: 110,
      low: 102,
      close: 110,
      volume: 55
    })
    expect(onBarUpdate).toHaveBeenCalledOnce()
  })

  it('creates a new bar without fabricating volume', async () => {
    const engine = new CandleEngine()
    await engine.setSymbolAndTimeframe('XAUUSD', '1m')
    const latest = engine.getActiveBars().at(-1)!
    const nextBucket =
      Math.floor(latest.timestamp / engine.timeframeToMs('1m') + 1) * engine.timeframeToMs('1m')

    engine.handleTick({
      symbol: 'XAUUSD',
      price: 120,
      bid: 119,
      ask: 121,
      timestamp: nextBucket
    })

    expect(engine.getActiveBars().at(-1)).toMatchObject({
      open: 120,
      high: 120,
      low: 120,
      close: 120,
      volume: undefined
    })
  })

  it('updates active bar even if tick timestamp has slight clock skew within active window', async () => {
    const engine = new CandleEngine()
    const onBarUpdate = vi.fn()
    engine.addListener({ onHistoryLoaded: vi.fn(), onBarUpdate })
    const bars = await engine.setSymbolAndTimeframe('XAUUSD', '1m')
    const latest = bars.at(-1)!
    // Tick timestamp slightly behind latest bar's start (e.g. 5 seconds clock drift)
    const quote: PriceQuote = {
      symbol: 'XAU/USD',
      price: 111,
      timestamp: latest.timestamp - 5_000
    }

    engine.handleTick(quote)

    expect(engine.getActiveBars().at(-1)).toMatchObject({
      close: 111
    })
    expect(onBarUpdate).toHaveBeenCalledOnce()
  })

  it('maps every supported timeframe without silently changing intervals', () => {
    const engine = new CandleEngine()
    expect(engine.timeframeToMs('30m')).toBe(30 * 60 * 1000)
    expect(engine.timeframeToMs('1w')).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('dispatches ticks to independent registered engines and cleans them up', async () => {
    const goldEngine = new CandleEngine()
    const bitcoinEngine = new CandleEngine()
    const goldUpdate = vi.fn()
    const bitcoinUpdate = vi.fn()
    goldEngine.addListener({ onHistoryLoaded: vi.fn(), onBarUpdate: goldUpdate })
    bitcoinEngine.addListener({ onHistoryLoaded: vi.fn(), onBarUpdate: bitcoinUpdate })

    await goldEngine.setSymbolAndTimeframe('XAUUSD', '1m')
    await bitcoinEngine.setSymbolAndTimeframe('BTCUSDT', '30m')
    const unregisterGold = registerCandleEngine(goldEngine)
    const unregisterBitcoin = registerCandleEngine(bitcoinEngine)
    const goldTimestamp = goldEngine.getActiveBars().at(-1)!.timestamp + 1_000

    dispatchCandleTick({ symbol: 'XAUUSD', price: 112, timestamp: goldTimestamp })

    expect(goldUpdate).toHaveBeenCalledOnce()
    expect(bitcoinUpdate).not.toHaveBeenCalled()

    unregisterGold()
    dispatchCandleTick({ symbol: 'XAUUSD', price: 113, timestamp: goldTimestamp + 1_000 })
    expect(goldUpdate).toHaveBeenCalledOnce()

    unregisterBitcoin()
  })

  it('retries once with backoff after an empty response and succeeds on the next call', async () => {
    vi.useFakeTimers()
    try {
      const mock = vi.fn().mockResolvedValueOnce([]).mockResolvedValue(history)
      vi.stubGlobal('window', { api: { market: { getCandles: mock } } })
      const engine = new CandleEngine()
      const onHistoryLoaded = vi.fn()
      engine.addListener({ onHistoryLoaded, onBarUpdate: vi.fn() })

      let bars: Awaited<ReturnType<typeof engine.setSymbolAndTimeframe>> | null = null
      const pending = engine.setSymbolAndTimeframe('USOIL', '15m').then((r) => {
        bars = r
      })
      await vi.advanceTimersByTimeAsync(2000)
      await pending

      expect(mock).toHaveBeenCalledTimes(2)
      expect(bars).toHaveLength(2)
      expect(onHistoryLoaded).toHaveBeenCalledWith(engine.getGenerationId(), bars)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries once with backoff when the candle request throws, then succeeds', async () => {
    vi.useFakeTimers()
    try {
      const mock = vi.fn().mockRejectedValueOnce(new Error('network down')).mockResolvedValue(history)
      vi.stubGlobal('window', { api: { market: { getCandles: mock } } })
      const engine = new CandleEngine()

      let bars: Awaited<ReturnType<typeof engine.setSymbolAndTimeframe>> | null = null
      const pending = engine.setSymbolAndTimeframe('USOIL', '15m').then((r) => {
        bars = r
      })
      await vi.advanceTimersByTimeAsync(2000)
      await pending

      expect(mock).toHaveBeenCalledTimes(2)
      expect(bars).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('caps 15m and 1h limit to 300 to prevent ClickHouse query timeouts', async () => {
    const mock = vi.fn().mockResolvedValue(history)
    vi.stubGlobal('window', { api: { market: { getCandles: mock } } })
    const engine = new CandleEngine()

    await engine.setSymbolAndTimeframe('XAUUSD', '15m', 500)
    expect(mock).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'XAUUSD',
        timeframe: '15m',
        limit: 300
      })
    )

    await engine.setSymbolAndTimeframe('XAUUSD', '1h', 500)
    expect(mock).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'XAUUSD',
        timeframe: '1h',
        limit: 300
      })
    )
  })
})
