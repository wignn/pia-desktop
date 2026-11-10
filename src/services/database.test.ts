import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DatabaseService,
  encodeMarketRegimeVector,
  computeCosineSimilarity,
  type MarketMemoryEpisode
} from './database'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('sql.js', () => ({ default: vi.fn() }))

describe('DatabaseService persistence', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
  })

  it('persists a pending write when flushed before the debounce timer fires', async () => {
    const service = new DatabaseService() as any
    service.db = { export: () => new Uint8Array([1, 2, 3]) }
    service.scheduleDiskWrite(60_000)

    await service.flushSync()

    expect(invokeMock).toHaveBeenCalledOnce()
    expect(invokeMock).toHaveBeenCalledWith('save_db', { data: [1, 2, 3] })
    expect(service.saveTimeout).toBeNull()
  })

  it('rejects a flush when native persistence fails', async () => {
    const failure = new Error('disk full')
    invokeMock.mockRejectedValueOnce(failure)
    const service = new DatabaseService() as any
    service.db = { export: () => new Uint8Array([4]) }

    await expect(service.flushSync()).rejects.toBe(failure)
  })

  it('encodes 7D market regime vectors bounded in [-1, 1] and handles zero/NaN inputs safely', () => {
    const bullishVec = encodeMarketRegimeVector({
      price: 2750,
      rsi14: 65,
      atr14: 27.5,
      ema20: 2760,
      ema50: 2740,
      orderbookImbalance: 1.6,
      newsScore: 50,
      kronosExpectedReturnPercent: 1.0,
      trendDirection: 'BULLISH'
    })

    expect(bullishVec).toHaveLength(7)
    for (const v of bullishVec) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(bullishVec[0]).toBeCloseTo(0.3, 4) // (65 - 50) / 50
    expect(bullishVec[6]).toBe(1) // BULLISH -> +1

    const nanSafeVec = encodeMarketRegimeVector({
      price: 0,
      rsi14: Number.NaN,
      atr14: Number.POSITIVE_INFINITY,
      ema20: undefined,
      ema50: undefined
    })
    expect(nanSafeVec).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('computes cosine similarity accurately and handles zero-norm vectors safely', () => {
    const a = [0.5, 0.4, 0.3, 0.2, 0.5, 0.5, 1]
    const b = [0.5, 0.4, 0.3, 0.2, 0.5, 0.5, 1]
    const opposite = a.map((x) => -x)
    const zero = [0, 0, 0, 0, 0, 0, 0]

    expect(computeCosineSimilarity(a, b)).toBeCloseTo(1, 4)
    expect(computeCosineSimilarity(a, opposite)).toBeCloseTo(-1, 4)
    expect(computeCosineSimilarity(a, zero)).toBe(0)
    expect(computeCosineSimilarity([], [])).toBe(0)
  })

  it('saves, filters by symbol, and clears MarketMemoryEpisode records in DatabaseService', () => {
    const service = new DatabaseService()
    const ep1: MarketMemoryEpisode = {
      id: 'ep-1',
      symbol: 'XAUUSD',
      timeframe: '15m',
      source: 'paper_trade',
      side: 'LONG',
      entryPrice: 2740,
      exitPrice: 2765,
      stopLoss: 2725,
      takeProfit: 2770,
      size: 0.5,
      realizedPnl: 1250,
      realizedR: 1.67,
      outcome: 'WIN',
      featureVector: [0.3, 0.4, 0.25, 0.3, 0.4, 0.5, 1],
      metadata: { rsi14: 65, kronosBias: 'BULLISH' },
      createdAt: 1000
    }
    const ep2: MarketMemoryEpisode = {
      id: 'ep-2',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      source: 'paper_trade',
      side: 'SHORT',
      entryPrice: 65000,
      exitPrice: 66000,
      stopLoss: 66000,
      size: 0.1,
      realizedPnl: -100,
      realizedR: -1,
      outcome: 'LOSS',
      featureVector: [-0.3, 0.6, -0.4, -0.2, -0.3, -0.4, -1],
      metadata: { rsi14: 35 },
      createdAt: 2000
    }

    expect(service.saveMarketMemoryEpisode(ep1)).toBe(true)
    expect(service.saveMarketMemoryEpisode(ep2)).toBe(true)

    const all = service.getMarketMemoryEpisodes()
    expect(all).toHaveLength(2)
    expect(all[0].id).toBe('ep-2')

    const xauOnly = service.getMarketMemoryEpisodes('XAUUSD')
    expect(xauOnly).toHaveLength(1)
    expect(xauOnly[0].id).toBe('ep-1')

    expect(service.clearMarketMemoryEpisodes('XAUUSD')).toBe(true)
    expect(service.getMarketMemoryEpisodes('XAUUSD')).toHaveLength(0)
    expect(service.getMarketMemoryEpisodes('BTCUSDT')).toHaveLength(1)
  })
})
