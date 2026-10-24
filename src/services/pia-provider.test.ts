import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PiaProvider } from './pia-provider'

describe('PiaProvider - 15m Fallback and Aggregation', () => {
  let provider: PiaProvider

  beforeEach(() => {
    vi.restoreAllMocks()
    const mockCredManager = {
      getApiKey: vi.fn().mockReturnValue('mock-api-key'),
      getBaseUrl: vi.fn().mockReturnValue('https://api.pia.test'),
      getWsUrl: vi.fn().mockReturnValue('wss://ws.pia.test')
    } as any
    provider = new PiaProvider(mockCredManager)
  })

  it('correctly aggregates three 5m bars into one 15m candle', () => {
    const aggregateFn = (provider as any).aggregate15mBars.bind(provider)
    const baseTime = 1700000000000 // Multiple of 15m or aligned
    const t0 = Math.floor(baseTime / 900000) * 900000

    const fiveMinBars = [
      { timestamp: t0, open: 2000, high: 2005, low: 1998, close: 2002, volume: 100 },
      { timestamp: t0 + 300000, open: 2002, high: 2010, low: 2001, close: 2008, volume: 150 },
      { timestamp: t0 + 600000, open: 2008, high: 2009, low: 2004, close: 2005, volume: 120 }
    ]

    const m15 = aggregateFn(fiveMinBars)
    expect(m15).toHaveLength(1)
    expect(m15[0].open).toBe(2000)
    expect(m15[0].high).toBe(2010)
    expect(m15[0].low).toBe(1998)
    expect(m15[0].close).toBe(2005)
    expect(m15[0].volume).toBe(370)
  })

  it('aggregates multiple 15m intervals maintaining chronological order', () => {
    const aggregateFn = (provider as any).aggregate15mBars.bind(provider)
    const t0 = 1700001000000 - (1700001000000 % 900000)

    const fiveMinBars = [
      // Interval 1
      { timestamp: t0, open: 100, high: 102, low: 99, close: 101, volume: 10 },
      { timestamp: t0 + 300000, open: 101, high: 105, low: 100, close: 104, volume: 20 },
      // Interval 2
      { timestamp: t0 + 900000, open: 104, high: 106, low: 103, close: 105, volume: 15 }
    ]

    const m15 = aggregateFn(fiveMinBars)
    expect(m15).toHaveLength(2)
    expect(m15[0].timestamp).toBe(t0)
    expect(m15[0].high).toBe(105)
    expect(m15[1].timestamp).toBe(t0 + 900000)
    expect(m15[1].high).toBe(106)
  })

  it('caps 15m and 1h requested limits to 300 to prevent ClickHouse query timeout', async () => {
    const mockGetCandles = vi.fn().mockResolvedValue({ candles: [] })
    ;(provider as any).client = {
      market: { getCandles: mockGetCandles }
    }

    await provider.getCandles({ symbol: 'XAUUSD', timeframe: '15m', limit: 500 })
    expect(mockGetCandles).toHaveBeenCalledWith(
      'XAUUSD',
      expect.objectContaining({ timeframe: '15m', limit: 300 })
    )

    await provider.getCandles({ symbol: 'XAUUSD', timeframe: '1h', limit: 500 })
    expect(mockGetCandles).toHaveBeenCalledWith(
      'XAUUSD',
      expect.objectContaining({ timeframe: '1h', limit: 300 })
    )
  })

  it('limits 5m fallback bars to at most 600 when 15m fails', async () => {
    const mockGetCandles = vi.fn().mockImplementation((_sym, opts) => {
      if (opts.timeframe === '15m') {
        return Promise.reject(new Error('502 Bad Gateway'))
      }
      return Promise.resolve({
        candles: [
          { time: 1700000000, open: 100, high: 105, low: 95, close: 102, volume: 10 }
        ]
      })
    })
    ;(provider as any).client = {
      market: { getCandles: mockGetCandles }
    }

    const bars = await provider.getCandles({ symbol: 'XAUUSD', timeframe: '15m', limit: 500 })

    expect(mockGetCandles).toHaveBeenCalledWith(
      'XAUUSD',
      expect.objectContaining({ timeframe: '5m', limit: 600 })
    )
    expect(bars.length).toBeGreaterThan(0)
  })
})
