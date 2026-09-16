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
    case '1M':
      return { type: 'month', span: 1 }
    default:
      return { type: 'minute', span: 1 }
  }
}
