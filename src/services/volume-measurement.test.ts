import { describe, expect, it } from 'vitest'
import { decodeMeasurements, projectHistogram, supportsTradeVolume, mergeMeasurements } from './volume-measurement'

describe('honest volume measurements', () => {
  it('preserves unavailable quantity and displays explicit activity only', () => {
    const values = decodeMeasurements({ volume: null, tick_count: 12, volume_basis: 'unavailable', activity_basis: 'received_feed_updates', provider_source: 'ctrader_fix' })
    expect(values.volume).toBeUndefined()
    expect(projectHistogram(values, 'activity')).toBe(12)
    expect(projectHistogram(values, 'trade')).toBeUndefined()
    expect(supportsTradeVolume([values])).toBe(false)
  })
  it('retains known trade zero and rejects legacy numeric volume as trade evidence', () => {
    expect(projectHistogram(decodeMeasurements({volume: 0, volume_basis: 'trade'}), 'trade')).toBe(0)
    expect(projectHistogram(decodeMeasurements({volume: 1}), 'trade')).toBeUndefined()
    expect(projectHistogram(decodeMeasurements({tick_count: null, activity_basis: 'received_feed_updates'}), 'activity')).toBeUndefined()
  })
  it('never aggregates measurement units across providers or missing buckets', () => {
    const a = decodeMeasurements({volume: null, tick_count: 2, activity_basis: 'received_feed_updates', provider_source: 'ctrader_fix'})
    const b = decodeMeasurements({volume: 3, volume_basis: 'trade', provider_source: 'okx'})
    expect(mergeMeasurements(a, b).tickCount).toBeUndefined()
    expect(mergeMeasurements(a, b).volumeBasis).toBe('unavailable')
    expect(mergeMeasurements(a, a).tickCount).toBe(4)
    expect(a.tickCount).toBe(2)
  })

  it('correctly decodes ClickHouse tick_count candles and displays volume and activity', () => {
    const clickhouseRow = {
      close: 3617.985,
      high: 3618.235,
      latest_at: '2026-11-20 00:09:00',
      low: 3613.695,
      open: 3613.715,
      source: 'clickhouse_candles_1m',
      tick_count: '162',
      time: 1795133340,
      value: 3617.985,
      volume: 162,
      volume_basis: 'tick_count'
    }
    const decoded = decodeMeasurements(clickhouseRow)
    expect(decoded.volume).toBe(162)
    expect(decoded.tickCount).toBe(162)
    expect(decoded.volumeBasis).toBe('tick_count')
    expect(decoded.activityBasis).toBe('received_feed_updates')
    expect(projectHistogram(decoded, 'trade')).toBe(162)
    expect(projectHistogram(decoded, 'activity')).toBe(162)
  })
})
