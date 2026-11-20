import type { CandleBar } from '../shared/types'

type Measurements = Pick<CandleBar, 'volume' | 'tickCount' | 'volumeBasis' | 'activityBasis' | 'activityComplete' | 'providerSource'>

function nonnegative(value: unknown): number | undefined {
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
  }
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

export function decodeMeasurements(raw: Record<string, unknown>): Measurements {
  const count = nonnegative(raw.tick_count)
  const isTickBasis = raw.volume_basis === 'tick_count'
  const isTradeBasis = raw.volume_basis === 'trade'
  const isUnavailable = raw.volume_basis === 'unavailable'

  const volume = nonnegative(raw.volume)
  const tickCount = count !== undefined && Number.isSafeInteger(count)
    ? count
    : (isTickBasis && volume !== undefined && Number.isSafeInteger(volume) ? Math.round(volume) : undefined)

  return {
    volume,
    tickCount,
    volumeBasis: isTradeBasis ? 'trade' : (isUnavailable ? 'unavailable' : (isTickBasis ? 'tick_count' : 'unknown')),
    activityBasis: raw.activity_basis === 'received_feed_updates' || isTickBasis
      ? 'received_feed_updates'
      : 'unavailable',
    activityComplete: typeof raw.activity_complete === 'boolean' ? raw.activity_complete : undefined,
    providerSource: typeof raw.provider_source === 'string' && raw.provider_source.trim() ? raw.provider_source : undefined
  }
}

export function projectHistogram(bar: Measurements, mode: 'trade' | 'activity'): number | undefined {
  if (mode === 'trade') {
    if (bar.volumeBasis === 'trade') return nonnegative(bar.volume)
    if (bar.volumeBasis === 'unavailable') return undefined
    if (bar.volumeBasis === 'tick_count') return nonnegative(bar.volume)
    return undefined
  }
  return (bar.activityBasis === 'received_feed_updates' || bar.volumeBasis === 'tick_count')
    ? (nonnegative(bar.tickCount) ?? nonnegative(bar.volume))
    : undefined
}

export function supportsTradeVolume(bars: Measurements[]): boolean {
  return bars.length > 0 && bars.every(bar => projectHistogram(bar, 'trade') !== undefined)
}

export function mergeMeasurements(a: Measurements, b: Measurements): Measurements {
  if (!a.providerSource || a.providerSource !== b.providerSource) {
    return { volumeBasis: 'unavailable', activityBasis: 'unavailable', activityComplete: false }
  }
  const trade = a.volumeBasis === 'trade' && b.volumeBasis === 'trade' && a.volume !== undefined && b.volume !== undefined
  const tickBasis = a.volumeBasis === 'tick_count' && b.volumeBasis === 'tick_count' && a.volume !== undefined && b.volume !== undefined
  const activity = a.activityBasis === 'received_feed_updates' && b.activityBasis === 'received_feed_updates' && a.tickCount !== undefined && b.tickCount !== undefined
  const volumeBasis = trade ? 'trade' : (tickBasis ? 'tick_count' : 'unavailable')

  return {
    providerSource: a.providerSource,
    volumeBasis,
    volume: trade || tickBasis ? a.volume! + b.volume! : undefined,
    activityBasis: activity ? 'received_feed_updates' : 'unavailable',
    tickCount: activity ? a.tickCount! + b.tickCount! : undefined,
    activityComplete: a.activityComplete === true && b.activityComplete === true ? true : undefined
  }
}
