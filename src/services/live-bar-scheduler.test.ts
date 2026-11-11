import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveBarScheduler } from './live-bar-scheduler'
import { CandleEngine } from './candle-engine'
import type { KLineData } from 'klinecharts'

let flush: FrameRequestCallback
const bar = (timestamp: number, close: number, high = close, low = close): KLineData =>
  ({ timestamp, open: 100, high, low, close })

afterEach(() => vi.unstubAllGlobals())

function setup() {
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { flush = callback; return 1 }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const delivered: KLineData[] = []
  return { delivered, scheduler: createLiveBarScheduler((value) => delivered.push(value)) }
}

describe('live bar frame scheduler', () => {
  it('coalesces a burst without losing aggregated extrema or the latest close', () => {
    const { delivered, scheduler } = setup()
    for (let i = 0; i < 10000; i++) scheduler.push(1, bar(1000, 101 + i % 2, 120, 80))
    expect(delivered).toEqual([])
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    flush(16)
    expect(delivered).toEqual([bar(1000, 102, 120, 80)])
  })

  it('keeps all intrabar extrema through the real candle engine during a burst', async () => {
    const { delivered, scheduler } = setup()
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
    vi.stubGlobal('window', { api: { market: { getCandles: async () => [bar(1800000000000, 100)] } } })
    const engine = new CandleEngine()
    await engine.setSymbolAndTimeframe('XAUUSD', '1m')
    engine.addListener({ onHistoryLoaded: () => {}, onBarUpdate: (gen, value) => scheduler.push(gen, value) })
    engine.handleTick({ symbol: 'XAUUSD', price: 120, timestamp: 1800000001000 })
    engine.handleTick({ symbol: 'XAUUSD', price: 80, timestamp: 1800000002000 })
    engine.handleTick({ symbol: 'XAUUSD', price: 105, timestamp: 1800000003000 })
    flush(16)
    expect(delivered).toEqual([{ timestamp: 1800000000000, open: 100, high: 120, low: 80, close: 105, volume: undefined }])
  })

  it('preserves the final old bar and the new bar across a frame boundary', () => {
    const { delivered, scheduler } = setup()
    scheduler.push(1, bar(1000, 110, 120, 90))
    scheduler.push(1, bar(2000, 111, 115, 108))
    flush(16)
    expect(delivered).toEqual([bar(1000, 110, 120, 90), bar(2000, 111, 115, 108)])
  })

  it('does not deliver an old chart frame after its identity becomes inactive', () => {
    setup()
    let active = true
    const delivered: KLineData[] = []
    const scheduler = createLiveBarScheduler((value) => delivered.push(value), () => active)
    scheduler.push(1, bar(1000, 110))
    active = false
    flush(16)
    expect(delivered).toEqual([])
  })

  it('discards queued bars on chart identity changes and cleanup', () => {
    const { delivered, scheduler } = setup()
    scheduler.push(1, bar(1000, 110))
    scheduler.push(2, bar(1000, 200))
    flush(16)
    expect(delivered).toEqual([bar(1000, 200)])
    scheduler.push(2, bar(2000, 210))
    scheduler.cancel()
    flush(32)
    expect(delivered).toHaveLength(1)
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })
})
