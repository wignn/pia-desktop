import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn(), unlisten: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke, isTauri: () => true }))
vi.mock('@tauri-apps/api/event', () => ({ listen: native.listen }))
import * as client from './kronos-client'

const START = 1700000100000
const STEP = 900000
const CUTOFF = START + 15 * STEP + 30000
const a = { symbol: 'BTCUSD', timeframe: '15m' }
const b = { symbol: 'XAUUSD', timeframe: '15m' }
const makeBars = (count = 16, start = START) => Array.from({ length: count }, (_, i) => ({
  timestamp: start + i * STEP, open: 100, high: 104, low: 99, close: 101
}))
const bars = makeBars(16)
function resultFor(payload: any, overrides: Record<string, unknown> = {}) {
  const stepMs = payload.timeframe === '1h' ? 3600000 : STEP
  const originTimestamp = payload.candles.at(-1).timestamp + stepMs
  return {
    timeframe: payload.timeframe,
    contextBars: payload.candles.length,
    sampleCount: 6,
    cutoffTimestamp: payload.cutoffTimestamp,
    originTimestamp,
    originPrice: payload.candles.at(-1).close,
    quality: { gapCount: 0, missingVolumeCount: payload.candles.filter((c: any) => c.volume === undefined).length, normalizedOutputCount: 0 },
    points: Array.from({ length: 12 }, (_, i) => ({
      step: i + 1, timestamp: originTimestamp + i * stepMs,
      open: 101, high: 104, low: 100, close: 102, q10: 99, q50: 102, q90: 105
    })),
    ...overrides
  }
}
let pending: { resolve: (value: unknown) => void; reject: (reason: Error) => void; args: any }[]
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

beforeEach(() => {
  vi.clearAllMocks()
  pending = []
  native.listen.mockResolvedValue(native.unlisten)
  native.invoke.mockImplementation((command, args) => {
    if (command === 'kronos_forecast') return new Promise((resolve, reject) => pending.push({ resolve, reject, args }))
    if (command === 'kronos_status') return Promise.resolve({ status: 'ready' })
    return Promise.resolve()
  })
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('HTTP forbidden'))
  client.setActiveKronosChart(null)
})
afterEach(async () => { client.setActiveKronosChart?.(null); await flush(); vi.restoreAllMocks() })

async function start(identity = a, data = bars, cutoffTimestamp = CUTOFF) {
  client.setActiveKronosChart(identity)
  client.requestKronosRollout(identity, data, 12, { cutoffTimestamp, error: null })
  await flush()
}

describe('local Kronos ownership and closed-candle scheduling', () => {
  it('cache reads never initiate I/O or reuse another chart steps', () => {
    expect(client.useKronosStore.getState().model).toBe('NeoQuasar/Kronos-base')
    client.useKronosStore.setState({ steps: resultFor({ timeframe: '15m', cutoffTimestamp: CUTOFF, candles: bars.slice(0, 15) }).points, cacheKey: 'old' })
    expect(client.getCachedKronosRollout(b, bars)).toEqual([])
    expect(client.getCachedKronosRollout(a, bars)).toEqual([])
    expect(native.invoke).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends only closed bars and keeps exact OHLC/q50 unchanged across intra-bar ticks and cutoff progression', async () => {
    await start()
    expect(pending[0].args.payload.symbol).toBe('BTCUSD')
    expect(pending[0].args.payload.timeframe).toBe('15m')
    expect(pending[0].args.payload.candles).toHaveLength(15)
    expect('volume' in pending[0].args.payload.candles[0]).toBe(false)
    pending[0].resolve(resultFor(pending[0].args.payload))
    await flush()
    expect(client.getCachedKronosRollout(a, bars)).toHaveLength(12)
    const ticks = bars.map((bar, i) => i === bars.length - 1 ? { ...bar, close: 103.5, high: 106 } : bar)
    client.requestKronosRollout(a, ticks, 12, { cutoffTimestamp: CUTOFF + 60000, error: null })
    expect(client.getCachedKronosRollout(a, ticks)[0]).toMatchObject({
      timestamp: START + 15 * STEP, open: 101, high: 104, low: 100, close: 102, q10: 99, q50: 102, q90: 105
    })
    expect(pending).toHaveLength(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('invokes once on closed-bar advance while keeping prior origin during replacement or failure', async () => {
    await start()
    pending[0].resolve(resultFor(pending[0].args.payload))
    await flush()
    const nextBars = [...bars, { timestamp: START + 16 * STEP, open: 101, high: 105, low: 100, close: 103 }]
    client.requestKronosRollout(a, nextBars, 12, { cutoffTimestamp: START + 16 * STEP + 5000, error: null })
    await flush()
    expect(pending).toHaveLength(2)
    expect(client.useKronosStore.getState().status).toBe('computing')
    expect(client.useKronosStore.getState().originTimestamp).toBe(START + 15 * STEP)
    expect(client.getCachedKronosRollout(a, nextBars)).toHaveLength(12)
    pending[1].reject(new Error('Worker busy'))
    await flush()
    expect(client.useKronosStore.getState().status).toBe('error')
    expect(client.useKronosStore.getState().originTimestamp).toBe(START + 15 * STEP)
    expect(client.getCachedKronosRollout(a, nextBars)).toHaveLength(12)
  })

  it('invalidates on revised historical OHLC inside last 256 closed bars and ignores older pagination outside 256', async () => {
    const full = makeBars(257)
    const fullCutoff = START + 256 * STEP + 1000
    await start(a, full, fullCutoff)
    pending[0].resolve(resultFor(pending[0].args.payload))
    await flush()
    const prepended = [{ timestamp: START - STEP, open: 95, high: 98, low: 94, close: 96 }, ...full]
    client.requestKronosRollout(a, prepended, 12, { cutoffTimestamp: fullCutoff, error: null })
    await flush()
    expect(pending).toHaveLength(1)
    const revised = full.map((bar, i) => i === 10 ? { ...bar, close: 103 } : bar)
    client.requestKronosRollout(a, revised, 12, { cutoffTimestamp: fullCutoff, error: null })
    expect(client.getCachedKronosRollout(a, revised)).toEqual([])
    await flush()
    expect(pending).toHaveLength(2)
    pending[1].resolve(resultFor(pending[1].args.payload))
    await flush()
  })

  it('blocks invocation on raw-engine error, stays idle under 12 closed bars, and honors replay cutoff', async () => {
    client.setActiveKronosChart(a)
    client.requestKronosRollout(a, bars.slice(0, 12), 12, { cutoffTimestamp: START + 11 * STEP + 1000, error: null })
    expect(client.useKronosStore.getState().status).toBe('idle')
    expect(native.invoke).not.toHaveBeenCalled()
    client.requestKronosRollout(a, bars, 12, { cutoffTimestamp: CUTOFF, error: 'Conflicting duplicate candles' })
    expect(client.useKronosStore.getState().status).toBe('error')
    expect(client.useKronosStore.getState().error).toBe('Conflicting duplicate candles')
    expect(native.invoke).not.toHaveBeenCalled()
    client.requestKronosRollout(a, bars, 12, { cutoffTimestamp: START + 12 * STEP, error: null })
    await flush()
    expect(pending[0].args.payload.candles).toHaveLength(12)
    pending[0].resolve(resultFor(pending[0].args.payload))
    await flush()
  })

  it('rejects results whose metadata or point timestamps mismatch the request', async () => {
    for (const override of [
      { contextBars: 14 },
      { timeframe: '1h' },
      { originTimestamp: START + 14 * STEP },
      { points: Array.from({ length: 12 }, (_, i) => ({ step: i + 1, timestamp: START + i * STEP, open: 101, high: 104, low: 100, close: 102, q10: 99, q50: 102, q90: 105 })) }
    ]) {
      await start()
      const current = pending.at(-1)!
      current.resolve(resultFor(current.args.payload, override))
      await flush()
      expect(client.useKronosStore.getState().status).toBe('error')
      expect(client.getCachedKronosRollout(a, bars)).toEqual([])
      client.setActiveKronosChart(null)
    }
  })

  it('clears symbol and timeframe changes with identical bar timestamps', async () => {
    await start()
    pending[0].resolve(resultFor(pending[0].args.payload))
    await flush()
    client.setActiveKronosChart(b)
    expect(client.getCachedKronosRollout(b, bars)).toEqual([])
    expect(client.useKronosStore.getState().steps).toEqual([])
    const hourly = Array.from({ length: 16 }, (_, i) => ({
      timestamp: 1700002800000 + i * 3600000, open: 100, high: 104, low: 99, close: 101
    }))
    await start({ ...a, timeframe: '1h' }, hourly, 1700002800000 + 15 * 3600000 + 1000)
    expect(client.getCachedKronosRollout(a, hourly)).toEqual([])
    pending[1].resolve(resultFor(pending[1].args.payload))
    await flush()
  })

  it('rejects late A after A to B to A and coalesces only the newest snapshot', async () => {
    await start()
    await start(b)
    await start(a)
    expect(pending).toHaveLength(1)
    pending[0].resolve(resultFor(pending[0].args.payload))
    await flush()
    expect(client.getCachedKronosRollout(a, bars)).toEqual([])
    expect(pending).toHaveLength(2)
    pending[1].resolve(resultFor(pending[1].args.payload))
    await flush()
    expect(client.getCachedKronosRollout(a, bars)).toHaveLength(12)
  })

  it('disable rejects completion and unregisters native listeners', async () => {
    await start()
    client.setActiveKronosChart(null)
    pending[0].resolve(resultFor(pending[0].args.payload))
    await flush()
    expect(client.useKronosStore.getState().steps).toEqual([])
    expect(native.unlisten).toHaveBeenCalled()
  })

  it('reports failure, never fetches, and retries explicitly', async () => {
    await start()
    pending[0].reject(new Error('Local worker stopped'))
    await flush()
    expect(client.useKronosStore.getState().status).toBe('error')
    expect(fetch).not.toHaveBeenCalled()
    client.retryKronos()
    await flush()
    expect(pending).toHaveLength(2)
    pending[1].resolve(resultFor(pending[1].args.payload))
    await flush()
    expect(client.useKronosStore.getState().status).toBe('ready')
  })

  it.each(['idle', 'error'])('keeps setup loading over a stale native %s snapshot', async (status) => {
    let initialized!: () => void
    native.invoke.mockImplementation((command, args: any) => {
      if (command === 'kronos_status') return Promise.resolve({ status })
      if (command === 'kronos_initialize') return new Promise<void>((resolve) => { initialized = resolve })
      return Promise.resolve(resultFor(args.payload))
    })
    await start()
    const observed = client.useKronosStore.getState().status
    initialized()
    await flush()
    expect(observed).toBe('loading')
  })

  it('reschedules the same history after insufficient replay bars', async () => {
    await start()
    pending[0].resolve(resultFor(pending[0].args.payload))
    await flush()
    client.requestKronosRollout(a, bars.slice(0, 5), 12, { cutoffTimestamp: CUTOFF, error: null })
    client.requestKronosRollout(a, bars, 12, { cutoffTimestamp: CUTOFF, error: null })
    await flush()
    const count = pending.length
    pending[1]?.resolve(resultFor(pending[1].args.payload))
    await flush()
    expect(count).toBe(2)
    expect(client.getCachedKronosRollout(a, bars)).toHaveLength(12)
  })

  it('reports queued inference rather than insufficient history on a new chart', async () => {
    await start()
    await start(b)
    const observed = client.useKronosStore.getState().status
    pending[0].resolve(resultFor(pending[0].args.payload))
    await flush()
    pending[1].resolve(resultFor(pending[1].args.payload))
    await flush()
    expect(observed).toBe('computing')
  })

  it('does not enqueue each tick or intermediate new bar', async () => {
    await start()
    for (let i = 1; i <= 10; i++) {
      client.requestKronosRollout(
        a,
        [...bars, { ...bars[0], timestamp: bars.at(-1)!.timestamp + i * STEP }],
        12,
        { cutoffTimestamp: bars.at(-1)!.timestamp + (i + 1) * STEP, error: null }
      )
    }
    pending[0].resolve(resultFor(pending[0].args.payload))
    await flush()
    expect(pending).toHaveLength(2)
    expect(pending[1].args.payload.candles.at(-1).timestamp).toBe(bars.at(-1)!.timestamp + 10 * STEP)
    pending[1].resolve(resultFor(pending[1].args.payload))
    await flush()
    expect(pending).toHaveLength(2)
  })
})
