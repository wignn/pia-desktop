import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CandleEngine } from './candle-engine'
import type { CandleBar, PriceQuote } from '@shared/types'

const history: CandleBar[] = [
  { timestamp: 1_699_999_200, open: 100, high: 105, low: 98, close: 103, volume: 42 },
  { timestamp: 1_700_001_000, open: 103, high: 108, low: 102, close: 107, volume: 55 }
]

beforeEach(() => {
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

  it('maps every supported timeframe without silently changing intervals', () => {
    const engine = new CandleEngine()
    expect(engine.timeframeToMs('30m')).toBe(30 * 60 * 1000)
    expect(engine.timeframeToMs('1w')).toBe(7 * 24 * 60 * 60 * 1000)
  })
})
