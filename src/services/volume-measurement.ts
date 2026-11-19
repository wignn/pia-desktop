import type { CandleBar } from '../shared/types'

type Measurements = Pick<CandleBar, 'volume' | 'tickCount' | 'volumeBasis' | 'activityBasis' | 'activityComplete' | 'providerSource'>

function nonnegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

export function decodeMeasurements(raw: Record<string, unknown>): Measurements {
  const count = nonnegative(raw.tick_count)
  return {
    volume: nonnegative(raw.volume),
    tickCount: count !== undefined && Number.isSafeInteger(count) ? count : undefined,
    volumeBasis: raw.volume_basis === 'trade' || raw.volume_basis === 'unavailable' ? raw.volume_basis : 'unknown',
    activityBasis: raw.activity_basis === 'received_feed_updates' ? raw.activity_basis : 'unavailable',
    activityComplete: typeof raw.activity_complete === 'boolean' ? raw.activity_complete : undefined,
    providerSource: typeof raw.provider_source === 'string' && raw.provider_source.trim() ? raw.provider_source : undefined
  }
}

export function projectHistogram(bar: Measurements, mode: 'trade' | 'activity'): number | undefined {
  if (mode === 'trade') return bar.volumeBasis === 'trade' ? nonnegative(bar.volume) : undefined
  return bar.activityBasis === 'received_feed_updates' ? nonnegative(bar.tickCount) : undefined
}

export function supportsTradeVolume(bars: Measurements[]): boolean {
  return bars.length > 0 && bars.every(bar => projectHistogram(bar, 'trade') !== undefined)
}

export function mergeMeasurements(a: Measurements, b: Measurements): Measurements {
  if (!a.providerSource || a.providerSource !== b.providerSource) {
    return { volumeBasis: 'unavailable', activityBasis: 'unavailable', activityComplete: false }
  }
  const trade = a.volumeBasis === 'trade' && b.volumeBasis === 'trade' && a.volume !== undefined && b.volume !== undefined
  const activity = a.activityBasis === 'received_feed_updates' && b.activityBasis === 'received_feed_updates' && a.tickCount !== undefined && b.tickCount !== undefined
  return {
    providerSource: a.providerSource,
    volumeBasis: trade ? 'trade' : 'unavailable',
    volume: trade ? a.volume! + b.volume! : undefined,
    activityBasis: activity ? 'received_feed_updates' : 'unavailable',
    tickCount: activity ? a.tickCount! + b.tickCount! : undefined,
    activityComplete: a.activityComplete === true && b.activityComplete === true ? true : undefined
  }
}
