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
  it('does not use estimated quote time to roll candles or reject real source ticks', async () => {
    const engine = new CandleEngine()
    await engine.setSymbolAndTimeframe('XAUUSD', '15m')
    const start = engine.getBars().at(-1)!.timestamp
    engine.handleTick({ symbol: 'XAUUSD', price: 90, timestamp: start + 240000, timestampEstimated: true })
    engine.handleTick({ symbol: 'XAUUSD', price: 110, timestamp: start + 60000 })
    expect(engine.getBars().at(-1)?.close).toBe(110)
  })

  it('never moves the live close backwards in tick time', async () => {
    const engine = new CandleEngine()
    await engine.setSymbolAndTimeframe('XAUUSD', '15m')
    const start = engine.getBars().at(-1)!.timestamp
    engine.handleTick({ symbol: 'XAUUSD', price: 110, timestamp: start + 240000 })
    engine.handleTick({ symbol: 'XAUUSD', price: 90, timestamp: start + 60000 })
    expect(engine.getBars().at(-1)?.close).toBe(110)
    engine.handleTick({ symbol: 'XAUUSD', price: 111, timestamp: start + 240000 })
    expect(engine.getBars().at(-1)?.close).toBe(111)
  })

  it('streams recent candles while the optional older context page is pending', async () => {
    const engine = new CandleEngine()
    const start = Date.UTC(2026, 0, 1)
    const recent = Array.from({ length: 300 }, (_, i) => ({ timestamp: start + i * 3600000, open: 100, high: 105, low: 99, close: 101 }))
    let finishOlder!: (bars: CandleBar[]) => void
    const older = new Promise<CandleBar[]>((resolve) => { finishOlder = resolve })
    vi.mocked(window.api.market.getCandles).mockResolvedValueOnce(recent).mockReturnValueOnce(older)
    const initialDelivery = vi.fn()
    const loading = engine.setSymbolAndTimeframe('XAUUSD', '1h', 361, initialDelivery)
    await Promise.resolve()
    await Promise.resolve()
    engine.handleTick({ symbol: 'XAUUSD', price: 120, timestamp: start + 299 * 3600000 + 1000 })
    const liveClose = engine.getBars().at(-1)?.close
    const deliveredWhileWaiting = initialDelivery.mock.calls[0]?.[0]?.length
    finishOlder([])
    await loading
    expect(liveClose).toBe(120)
    expect(deliveredWhileWaiting).toBe(300)
    expect(engine.getBars().at(-1)?.close).toBe(120)
  })

  it('loads 360 closed candles plus the live candle using a bounded older page on 1h', async () => {
    const engine = new CandleEngine()
    const start = Date.UTC(2026, 0, 1)
    const all = Array.from({ length: 361 }, (_, i) => ({ timestamp: start + i * 3600000, open: 100, high: 105, low: 99, close: 101 }))
    vi.mocked(window.api.market.getCandles).mockImplementation(async (args) =>
      args.to ? all.slice(0, 61) : all.slice(61))
    const loaded = await engine.setSymbolAndTimeframe('XAUUSD', '1h', 361)
    expect(loaded).toHaveLength(361)
    expect(loaded[0].timestamp).toBe(start)
    expect(loaded.at(-1)?.timestamp).toBe(start + 360 * 3600000)
    expect(window.api.market.getCandles).toHaveBeenNthCalledWith(1, { symbol: 'XAUUSD', timeframe: '1h', limit: 300 })
    expect(window.api.market.getCandles).toHaveBeenNthCalledWith(2, { symbol: 'XAUUSD', timeframe: '1h', to: all[61].timestamp, limit: 61 })
  })

  it('ignores revised cross-page overlap during context loading while keeping the recent page authoritative', async () => {
    const engine = new CandleEngine()
    const start = Date.UTC(2026, 0, 1)
    const all = Array.from({ length: 361 }, (_, i) => ({ timestamp: start + i * 3600000, open: 100, high: 105, low: 99, close: 101 }))
    vi.mocked(window.api.market.getCandles).mockResolvedValueOnce(all.slice(61)).mockResolvedValueOnce([
      ...all.slice(0, 61), { ...all[61], timestamp: all[61].timestamp / 1000, close: 103 }
    ])
    const loaded = await engine.setSymbolAndTimeframe('XAUUSD', '1h', 361)
    expect(loaded).toHaveLength(361)
    expect(loaded[61].close).toBe(101)
    expect(new Set(loaded.map((bar) => bar.timestamp)).size).toBe(361)
    expect(engine.getKronosInputState().error).toBeNull()
  })

  it('ignores revised cross-page overlap during left pagination without poisoning later clean pages', async () => {
    const engine = new CandleEngine()
    const start = Date.UTC(2026, 0, 1)
    const bar = { timestamp: start, open: 100, high: 105, low: 99, close: 101 }
    vi.mocked(window.api.market.getCandles).mockResolvedValueOnce([bar])
    await engine.setSymbolAndTimeframe('XAUUSD', '1h')
    vi.mocked(window.api.market.getCandles).mockResolvedValueOnce([
      { ...bar, timestamp: start - 3600000 }, { ...bar, timestamp: start / 1000, close: 103 }
    ])
    expect((await engine.fetchOlderBars(start)).bars).toHaveLength(1)
    expect(engine.getActiveBars().at(-1)?.close).toBe(101)
    expect(engine.getKronosInputState().error).toBeNull()
    vi.mocked(window.api.market.getCandles).mockResolvedValueOnce([{ ...bar, timestamp: start - 7200000 }])
    await engine.fetchOlderBars(start - 3600000)
    expect(engine.getActiveBars()).toHaveLength(3)
    expect(engine.getKronosInputState().error).toBeNull()
  })

  it('still blocks conflicting duplicates inside an older page before normalization', async () => {
    const engine = new CandleEngine()
    const start = Date.UTC(2026, 0, 1)
    const bar = { timestamp: start, open: 100, high: 105, low: 99, close: 101 }
    vi.mocked(window.api.market.getCandles).mockResolvedValueOnce([bar])
    await engine.setSymbolAndTimeframe('XAUUSD', '1h')
    const older = { ...bar, timestamp: start - 3600000 }
    vi.mocked(window.api.market.getCandles).mockResolvedValueOnce([older, { ...older, close: 103 }])
    await engine.fetchOlderBars(start)
    expect(engine.getKronosInputState().error).toMatch(/duplicate/i)
  })

  it('keeps recent history when the optional older page fails', async () => {
    const engine = new CandleEngine()
    const recent = Array.from({ length: 300 }, (_, i) => ({ timestamp: Date.UTC(2026, 0, 1) + i * 3600000, open: 100, high: 105, low: 99, close: 101 }))
    vi.mocked(window.api.market.getCandles).mockResolvedValueOnce(recent).mockRejectedValueOnce(new Error('Older history unavailable'))
    expect(await engine.setSymbolAndTimeframe('XAUUSD', '1h', 361)).toHaveLength(300)
    expect(engine.getKronosInputState().error).toBeNull()
  })

  it('audits conflicting raw duplicates before chart normalization', async () => {
    const engine = new CandleEngine()
    const bar = { timestamp: 1700000100000, open: 100, high: 105, low: 99, close: 101 }
    vi.mocked(window.api.market.getCandles).mockResolvedValueOnce([bar, { ...bar, close: 102 }])
    expect(await engine.setSymbolAndTimeframe('BTCUSD', '15m')).toHaveLength(1)
    expect(engine.getKronosInputState().error).toMatch(/duplicate/i)
    vi.mocked(window.api.market.getCandles).mockResolvedValueOnce([bar])
    await engine.setSymbolAndTimeframe('BTCUSD', '15m')
    expect(engine.getKronosInputState().error).toBeNull()
  })

  it('retains raw invalid OHLC provenance and uses only visible replay cutoff', async () => {
    const engine = new CandleEngine()
    const history = Array.from({ length: 20 }, (_, i) => ({ timestamp: 1700000100000 + i * 900000, open: 100, high: 105, low: 99, close: 101 }))
    vi.mocked(window.api.market.getCandles).mockResolvedValueOnce([{ ...history[0], high: 98 }, ...history.slice(1)])
    await engine.setSymbolAndTimeframe('BTCUSD', '15m')
    expect(engine.getKronosInputState().error).toMatch(/OHLC/i)
    engine.startReplay(13)
    expect(engine.getKronosInputState().cutoffTimestamp).toBe(history[12].timestamp)
    engine.stepReplayForward()
    expect(engine.getKronosInputState().cutoffTimestamp).toBe(history[13].timestamp)
  })

  it('does not relabel previous timeframe bars while replacement history is pending', async () => {
    const engine = new CandleEngine()
    await engine.setSymbolAndTimeframe('BTCUSD', '15m')
    let resolve!: (bars: CandleBar[]) => void
    vi.mocked(window.api.market.getCandles).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const pending = engine.setSymbolAndTimeframe('BTCUSD', '1h')
    expect(engine.getActiveBars()).toEqual([])
    resolve(history)
    await pending
    expect(engine.getActiveBars()).toHaveLength(2)
  })

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
