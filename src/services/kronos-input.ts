import type { KronosBar, KronosChartIdentity } from './kronos-client'

const intervals: Record<string, number> = { '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000,
  '1h': 3600000, '4h': 14400000, '1d': 86400000, '1w': 604800000 }

export function timeframeMilliseconds(timeframe: string): number {
  if (!Object.hasOwn(intervals, timeframe)) throw new Error('Unsupported Kronos timeframe')
  return intervals[timeframe]
}

function validated(bars: readonly KronosBar[], timeframe: string): (KronosBar & { timestamp: number })[] {
  const interval = timeframeMilliseconds(timeframe)
  const anchor = timeframe === '1w' ? 345600000 : 0
  const sorted = bars.map((bar) => {
    const timestamp = bar.timestamp ?? bar.time
    if (!Number.isSafeInteger(timestamp) || timestamp! <= 0 || (timestamp! - anchor) % interval !== 0) {
      throw new Error('Kronos requires aligned millisecond timestamps')
    }
    if (![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) ||
      bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) throw new Error('Invalid OHLC input')
    if (bar.volume !== undefined && (!Number.isFinite(bar.volume) || bar.volume < 0)) throw new Error('Invalid volume input')
    return { timestamp: timestamp!, open: bar.open, high: bar.high, low: bar.low, close: bar.close,
      ...(bar.volume === undefined ? {} : { volume: bar.volume }) }
  }).sort((a, b) => a.timestamp - b.timestamp)
  return sorted.filter((bar, i) => {
    const previous = sorted[i - 1]
    if (previous?.timestamp !== bar.timestamp) return true
    if (JSON.stringify(previous) !== JSON.stringify(bar)) throw new Error('Conflicting duplicate candles')
    return false
  })
}

function quality(bars: readonly KronosBar[], timeframe: string) {
  const interval = timeframeMilliseconds(timeframe)
  return { gapCount: bars.filter((bar, i) => i > 0 && bar.timestamp! - bars[i - 1].timestamp! > interval).length,
    missingVolumeCount: bars.filter((bar) => bar.volume === undefined).length }
}

export function auditKronosHistory(bars: readonly KronosBar[], timeframe: string) {
  try { return { ...quality(validated(bars, timeframe), timeframe), error: null } }
  catch (error) { return { gapCount: 0, missingVolumeCount: 0, error: error instanceof Error ? error.message : String(error) } }
}

export function prepareKronosInput(identity: KronosChartIdentity, history: readonly KronosBar[], cutoffTimestamp: number) {
  if (!Number.isSafeInteger(cutoffTimestamp) || cutoffTimestamp <= 0) throw new Error('Invalid forecast cutoff')
  const interval = timeframeMilliseconds(identity.timeframe)
  const bars = validated(history, identity.timeframe).filter((bar) => bar.timestamp + interval <= cutoffTimestamp).slice(-360)
  return { bars, key: bars.length < 12 ? '' : JSON.stringify([identity.symbol, identity.timeframe, 12, 6, bars]),
    originTimestamp: bars.length ? bars[bars.length - 1].timestamp + interval : 0, quality: quality(bars, identity.timeframe) }
}
