import type { CandleBar } from '../shared/types'

/**
 * Decodes a raw binary buffer of 48-byte packed candles into CandleBar[].
 * Byte layout per bar (little-endian 6x f64):
 * [0..7: timestamp_ms, 8..15: open, 16..23: high, 24..31: low, 32..39: close, 40..47: volume]
 */
export function decodeBinaryCandles(buffer: ArrayBuffer | Uint8Array): CandleBar[] {
  const byteLength = buffer.byteLength
  if (byteLength === 0) return []

  if (byteLength % 48 !== 0) {
    throw new Error(`Invalid binary candle buffer length: ${byteLength} (must be multiple of 48)`)
  }

  const count = byteLength / 48

  // Create Float64Array view over underlying ArrayBuffer
  const arrayBuffer =
    buffer instanceof Uint8Array
      ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      : buffer

  const floats = new Float64Array(arrayBuffer)
  const candles: CandleBar[] = new Array(count)

  let fIndex = 0
  for (let i = 0; i < count; i++) {
    candles[i] = {
      timestamp: Math.round(floats[fIndex++]),
      open: floats[fIndex++],
      high: floats[fIndex++],
      low: floats[fIndex++],
      close: floats[fIndex++],
      volume: floats[fIndex++]
    }
  }

  return candles
}

/**
 * Encodes CandleBar[] into an ArrayBuffer (48 bytes per candle).
 */
export function encodeBinaryCandles(candles: CandleBar[]): ArrayBuffer {
  const buffer = new ArrayBuffer(candles.length * 48)
  const floats = new Float64Array(buffer)

  let fIndex = 0
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    floats[fIndex++] = c.timestamp
    floats[fIndex++] = c.open
    floats[fIndex++] = c.high
    floats[fIndex++] = c.low
    floats[fIndex++] = c.close
    floats[fIndex++] = c.volume ?? 0
  }

  return buffer
}
