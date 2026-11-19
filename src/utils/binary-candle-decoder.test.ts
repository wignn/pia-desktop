import { describe, expect, it } from 'vitest'
import { decodeBinaryCandles, encodeBinaryCandles } from './binary-candle-decoder'
import type { CandleBar } from '../shared/types'

describe('binary-candle-decoder', () => {
  it('encodes and decodes candle bars with bit precision', () => {
    const input: CandleBar[] = [
      {
        timestamp: 1710000000000,
        open: 2150.25,
        high: 2155.8,
        low: 2148.1,
        close: 2152.4,
        volume: 1250.5
      },
      {
        timestamp: 1710000060000,
        open: 2152.4,
        high: 2160.0,
        low: 2151.0,
        close: 2158.75,
        volume: 3420.0
      }
    ]

    const buffer = encodeBinaryCandles(input)
    expect(buffer.byteLength).toBe(2 * 48)

    const decoded = decodeBinaryCandles(buffer)
    expect(decoded).toHaveLength(2)
    expect(decoded[0]).toEqual(input[0])
    expect(decoded[1]).toEqual(input[1])
  })

  it('handles empty buffers gracefully', () => {
    expect(decodeBinaryCandles(new ArrayBuffer(0))).toEqual([])
  })

  it('throws on misaligned buffer sizes', () => {
    expect(() => decodeBinaryCandles(new ArrayBuffer(40))).toThrowError(
      'Invalid binary candle buffer length: 40'
    )
  })

  it('correctly handles Uint8Array slices', () => {
    const original: CandleBar[] = [
      {
        timestamp: 1700000000000,
        open: 100.5,
        high: 105.0,
        low: 99.0,
        close: 104.2,
        volume: 500
      }
    ]
    const encoded = encodeBinaryCandles(original)
    const uint8 = new Uint8Array(encoded)
    const decoded = decodeBinaryCandles(uint8)
    expect(decoded).toEqual(original)
  })
})
