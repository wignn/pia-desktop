import { describe, expect, it } from 'vitest'
import * as input from './kronos-input'

const start = 1700000100000
const step = 900000
const identity = { symbol: 'BTCUSD', timeframe: '15m' }
const bars = (n: number) => Array.from({ length: n }, (_, i) => ({ timestamp: start + i * step, open: 100, high: 104, low: 99, close: 101 }))

describe('closed Kronos input', () => {
  it('excludes unfinished bars and requires 12 completed candles', () => {
    expect(input.prepareKronosInput(identity, bars(14), start + 13 * step).bars).toHaveLength(13)
    expect(input.prepareKronosInput(identity, bars(12), start + 11 * step).key).toBe('')
  })
  it('sorts copies and collapses identical duplicates but rejects conflicting ones', () => {
    const history = bars(13).reverse()
    const copy = [...history]
    expect(input.prepareKronosInput(identity, [...history, history[0]], start + 13 * step).bars).toHaveLength(13)
    expect(history).toEqual(copy)
    expect(() => input.prepareKronosInput(identity, [...history, { ...history[0], close: 102 }], start + 13 * step)).toThrow(/duplicate/i)
  })
  it('rejects malformed OHLC, volume, timestamps and timeframe', () => {
    for (const patch of [{ high: 98 }, { volume: NaN }, { volume: -1 }, { timestamp: start + 1 }, { close: Infinity }]) {
      expect(() => input.prepareKronosInput(identity, [{ ...bars(13)[0], ...patch }, ...bars(13).slice(1)], start + 13 * step)).toThrow()
    }
    expect(() => input.timeframeMilliseconds('2h')).toThrow()
  })
  it('retains missing volume and reports gaps without filling candles', () => {
    const history = bars(13).map((bar, i) => ({ ...bar, timestamp: bar.timestamp + (i > 5 ? step * 200 : 0) }))
    const prepared = input.prepareKronosInput(identity, history, start + step * 300)
    expect(prepared.bars).toHaveLength(13)
    expect(prepared.bars[0].volume).toBeUndefined()
    expect(prepared.quality).toEqual({ gapCount: 1, missingVolumeCount: 13 })
  })
  it('uses UTC daily and Monday weekly boundaries', () => {
    for (const [timeframe, first, interval] of [
      ['1d', Date.UTC(2026, 0, 1), 86400000],
      ['1w', Date.UTC(2026, 0, 5), 604800000]
    ] as const) {
      const history = bars(13).map((bar, i) => ({ ...bar, timestamp: first + interval * i }))
      expect(input.prepareKronosInput({ ...identity, timeframe }, history, first + interval * 12).bars).toHaveLength(12)
      expect(() => input.prepareKronosInput({ ...identity, timeframe }, [{ ...history[0], timestamp: first + 86400000 / 2 }], first)).toThrow()
    }
  })
  it('keys only effective closed content, not unfinished ticks or older pagination', () => {
    const history = bars(300)
    const cutoff = start + 299 * step
    const a = input.prepareKronosInput(identity, history, cutoff)
    const ticks = history.map((bar, i) => i === 299 ? { ...bar, close: 103 } : bar)
    expect(input.prepareKronosInput(identity, ticks, cutoff).key).toBe(a.key)
    expect(input.prepareKronosInput(identity, history.slice(10), cutoff).key).toBe(a.key)
    expect(input.prepareKronosInput(identity, history.map((bar, i) => i === 298 ? { ...bar, close: 102 } : bar), cutoff).key).not.toBe(a.key)
    expect(a.bars).toHaveLength(256)
    expect(a.originTimestamp).toBe(cutoff)
  })
})
