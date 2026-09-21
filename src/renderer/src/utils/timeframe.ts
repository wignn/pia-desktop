import type { Timeframe } from '@shared/types'
import type { Period } from 'klinecharts'

export function timeframeToPeriod(tf: Timeframe): Period {
  switch (tf) {
    case '1m':
      return { type: 'minute', span: 1 }
    case '5m':
      return { type: 'minute', span: 5 }
    case '15m':
      return { type: 'minute', span: 15 }
    case '30m':
      return { type: 'minute', span: 30 }
    case '1h':
      return { type: 'hour', span: 1 }
    case '4h':
      return { type: 'hour', span: 4 }
    case '1d':
      return { type: 'day', span: 1 }
    case '1w':
      return { type: 'week', span: 1 }
    default:
      return { type: 'minute', span: 1 }
  }
}

export function periodToTimeframe(period?: Partial<Period> | null): Timeframe {
  if (!period || !period.type) return '15m'
  if (period.type === 'week') return '1w'
  if (period.type === 'day') return '1d'
  if (period.type === 'hour') return period.span === 4 ? '4h' : '1h'
  if (period.type === 'minute') {
    if (period.span === 30) return '30m'
    if (period.span === 15) return '15m'
    if (period.span === 5) return '5m'
    return '1m'
  }
  return '1d'
}
