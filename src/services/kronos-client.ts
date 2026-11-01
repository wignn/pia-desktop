import { create } from 'zustand'

export interface KronosBar {
  timestamp?: number
  time?: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface KronosStep {
  open: number
  high: number
  low: number
  close: number
  q10: number
  q50: number
  q90: number
}

interface KronosState {
  cacheKey: string
  originClose: number
  steps: KronosStep[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  model: string
}

export const useKronosStore = create<KronosState>(() => ({
  cacheKey: '',
  originClose: 0,
  steps: [],
  status: 'idle',
  model: 'NeoQuasar/Kronos-small'
}))

const KRONOS_ENDPOINTS = [
  'http://127.0.0.1:8789/forecast',
  'http://127.0.0.1:5000/forecast',
  'https://pia.wign.dev/api/kronos-forecast',
  'https://terminal.wign.dev/api/kronos-forecast',
  'https://api-engine.wign.dev/api/v1/kronos/forecast'
]
let inflightKey = ''
const pendingListeners = new Set<() => void>()

function buildKey(bars: readonly KronosBar[], horizon: number): string {
  if (bars.length < 12) return ''
  const first = bars[0]
  const last = bars[bars.length - 1]
  const firstTs = first.timestamp ?? first.time ?? 0
  const lastTs = last.timestamp ?? last.time ?? bars.length
  return `${bars.length}:${firstTs}:${lastTs}:${horizon}`
}

export async function fetchPureKronosRollout(
  bars: readonly KronosBar[],
  horizon = 12,
  symbol = 'XAUUSD'
): Promise<KronosStep[]> {
  if (bars.length < 12 || horizon < 1) return []
  const payload = {
    symbol,
    candles: bars.slice(-256).map((b, idx) => ({
      timestamp: b.timestamp ?? b.time ?? (1700000000 + idx * 900) * 1000,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume ?? 0
    })),
    pred_len: horizon,
    sample_count: 6
  }
  let lastStatus = 0
  for (const endpoint of KRONOS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      lastStatus = response.status
      if (!response.ok) continue
      const data = await response.json()
      if (!Array.isArray(data?.points)) continue
      return data.points.map((p: any) => {
        const q50 = Number(p.q50)
        const q10 = Math.min(Number(p.q10), q50)
        const q90 = Math.max(Number(p.q90), q50)
        const close = Number.isFinite(Number(p.close)) ? Number(p.close) : q50
        const open = Number.isFinite(Number(p.open)) ? Number(p.open) : q50
        const high = Number.isFinite(Number(p.high))
          ? Math.max(Number(p.high), open, close)
          : Math.max(q90, open, close)
        const low = Number.isFinite(Number(p.low))
          ? Math.min(Number(p.low), open, close)
          : Math.min(q10, open, close)
        return { open, high, low, close, q10, q50, q90 }
      })
    } catch {
      // Try next Kronos endpoint (local daemon -> deployed production service)
    }
  }
  throw new Error(`Kronos CPU inference error (${lastStatus || 'network'})`)
}

export function getCachedKronosRollout(
  bars: readonly KronosBar[],
  horizon = 12,
  onReady?: () => void
): KronosStep[] {
  const key = buildKey(bars, horizon)
  if (!key) return []
  const lastClose = bars[bars.length - 1].close
  const state = useKronosStore.getState()
  if (state.cacheKey === key && state.steps.length > 0) {
    const delta = Number.isFinite(state.originClose) ? lastClose - state.originClose : 0
    return state.steps.map((s) => ({
      open: s.open + delta,
      high: s.high + delta,
      low: s.low + delta,
      close: s.close + delta,
      q10: s.q10 + delta,
      q50: s.q50 + delta,
      q90: s.q90 + delta
    }))
  }
  if (onReady) {
    pendingListeners.add(onReady)
  }
  if (inflightKey !== key) {
    inflightKey = key
    const originClose = lastClose
    useKronosStore.setState({ status: 'loading' })
    fetchPureKronosRollout(bars, horizon)
      .then((steps) => {
        if (inflightKey === key) {
          inflightKey = ''
          useKronosStore.setState({
            cacheKey: steps.length > 0 ? key : '',
            originClose,
            steps,
            status: steps.length > 0 ? 'ready' : 'error'
          })
          const callbacks = Array.from(pendingListeners)
          pendingListeners.clear()
          for (const cb of callbacks) {
            try {
              cb()
            } catch {
              // ignore callback error
            }
          }
        }
      })
      .catch(() => {
        if (inflightKey === key) {
          inflightKey = ''
          useKronosStore.setState({ status: 'error', steps: [] })
          pendingListeners.clear()
        }
      })
  }
  return state.steps
}
