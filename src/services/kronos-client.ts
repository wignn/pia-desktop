import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { create } from 'zustand'
import { prepareKronosInput, timeframeMilliseconds } from './kronos-input'

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
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  q10: number
  q50: number
  q90: number
}

export interface KronosQuality {
  gapCount: number
  missingVolumeCount: number
  normalizedOutputCount: number
}

export interface KronosInputState {
  cutoffTimestamp?: number
  error?: string | null
}

export type KronosChartIdentity = { symbol: string; timeframe: string }
type Status = 'idle' | 'downloading' | 'loading' | 'computing' | 'ready' | 'error'
interface NativeStatus {
  status: 'downloading' | 'loading' | 'ready' | 'error'
  downloadedBytes?: number
  totalBytes?: number
  error?: string
}
interface KronosState {
  identity: KronosChartIdentity | null
  generation: number
  cacheKey: string
  contextBars: number
  cutoffTimestamp: number
  originTimestamp: number
  originClose: number
  quality: KronosQuality
  steps: KronosStep[]
  status: Status
  model: string
  error: string
  downloadedBytes?: number
  totalBytes?: number
}

const emptyQuality: KronosQuality = { gapCount: 0, missingVolumeCount: 0, normalizedOutputCount: 0 }

export const useKronosStore = create<KronosState>(() => ({
  identity: null, generation: 0, cacheKey: '', contextBars: 0, cutoffTimestamp: 0,
  originTimestamp: 0, originClose: 0, quality: emptyQuality, steps: [],
  status: 'idle', model: 'NeoQuasar/Kronos-base', error: ''
}))

type Snapshot = {
  identity: KronosChartIdentity
  generation: number
  key: string
  bars: (KronosBar & { timestamp: number })[]
  rawBars: KronosBar[]
  horizon: number
  cutoffTimestamp: number
  originTimestamp: number
  quality: { gapCount: number; missingVolumeCount: number }
  inputState?: KronosInputState
}
let running = false
let pending: Snapshot | null = null
let latest: Snapshot | null = null
let attemptedKey = ''
let sequence = 0
let unlisten: UnlistenFn | null = null
let listenerSetup: Promise<void> | null = null
let listenerEpoch = 0

function sameChart(a: KronosChartIdentity | null, b: KronosChartIdentity | null): boolean {
  return a?.symbol === b?.symbol && a?.timeframe === b?.timeframe
}

function current(snapshot: Snapshot): boolean {
  const state = useKronosStore.getState()
  return state.generation === snapshot.generation && sameChart(state.identity, snapshot.identity)
}

export function setActiveKronosChart(identity: KronosChartIdentity | null): void {
  const state = useKronosStore.getState()
  if (sameChart(state.identity, identity)) return
  pending = null
  latest = null
  attemptedKey = ''
  useKronosStore.setState({
    identity: identity ? { ...identity } : null,
    generation: state.generation + 1,
    cacheKey: '', contextBars: 0, cutoffTimestamp: 0, originTimestamp: 0, originClose: 0,
    quality: emptyQuality, steps: [], status: 'idle', error: '',
    downloadedBytes: undefined, totalBytes: undefined
  })
  if (!identity) {
    listenerEpoch++
    unlisten?.()
    unlisten = null
    listenerSetup = null
  }
}

async function subscribeNative(): Promise<void> {
  if (!isTauri()) throw new Error('Kronos requires the installed Desktop runtime')
  if (unlisten) return
  if (!listenerSetup) {
    const epoch = listenerEpoch
    listenerSetup = listen<NativeStatus>('kronos-status', ({ payload }) => {
      if (epoch !== listenerEpoch || !useKronosStore.getState().identity) return
      // Native readiness is not forecast readiness.
      if (payload.status !== 'ready') useKronosStore.setState({ ...payload, error: payload.error ?? '' })
    }).then((stop) => {
      if (epoch !== listenerEpoch) stop()
      else unlisten = stop
    }).finally(() => { if (epoch === listenerEpoch) listenerSetup = null })
  }
  await listenerSetup
}

function parseForecastResult(value: unknown, snapshot: Snapshot) {
  const interval = timeframeMilliseconds(snapshot.identity.timeframe)
  const raw = value as Record<string, any> | null
  const points = raw?.points
  const quality = raw?.quality
  if (!raw || !Array.isArray(points) || points.length !== snapshot.horizon ||
      raw.timeframe !== snapshot.identity.timeframe ||
      raw.contextBars !== snapshot.bars.length ||
      raw.sampleCount !== 6 ||
      raw.cutoffTimestamp !== snapshot.cutoffTimestamp ||
      raw.originTimestamp !== snapshot.originTimestamp ||
      typeof raw.originPrice !== 'number' || !Number.isFinite(raw.originPrice) ||
      !quality || quality.gapCount !== snapshot.quality.gapCount ||
      quality.missingVolumeCount !== snapshot.quality.missingVolumeCount ||
      !Number.isInteger(quality.normalizedOutputCount) || quality.normalizedOutputCount < 0) {
    throw new Error('Local model returned invalid forecast metadata')
  }
  const steps = points.map((point: any, i: number): KronosStep => {
    const { timestamp, open, high, low, close, q10, q50, q90 } = point ?? {}
    if (timestamp !== snapshot.originTimestamp + i * interval ||
      ![open, high, low, close, q10, q50, q90].every((v) => typeof v === 'number' && Number.isFinite(v)) ||
      low > Math.min(open, close) || high < Math.max(open, close) || q10 > q50 || q50 > q90) {
      throw new Error('Local model returned invalid prices')
    }
    return { timestamp, open, high, low, close, q10, q50, q90 }
  })
  return {
    contextBars: raw.contextBars as number,
    cutoffTimestamp: raw.cutoffTimestamp as number,
    originTimestamp: raw.originTimestamp as number,
    originPrice: raw.originPrice as number,
    quality: {
      gapCount: quality.gapCount as number,
      missingVolumeCount: quality.missingVolumeCount as number,
      normalizedOutputCount: quality.normalizedOutputCount as number
    },
    steps
  }
}

async function drain(): Promise<void> {
  if (running || !pending) return
  running = true
  const snapshot = pending
  pending = null
  try {
    await subscribeNative()
    if (!current(snapshot)) return
    useKronosStore.setState({ status: 'loading', error: '' })
    const status = await invoke<NativeStatus>('kronos_status')
    if (current(snapshot) && (status.status === 'downloading' || status.status === 'loading')) {
      useKronosStore.setState({ ...status, error: '' })
    }
    await invoke('kronos_initialize')
    if (!current(snapshot)) return
    useKronosStore.setState({ status: 'computing' })
    const result = await invoke('kronos_forecast', {
      id: ++sequence,
      payload: {
        symbol: snapshot.identity.symbol,
        timeframe: snapshot.identity.timeframe,
        cutoffTimestamp: snapshot.cutoffTimestamp,
        candles: snapshot.bars.map((bar) => ({
          timestamp: bar.timestamp, open: bar.open, high: bar.high,
          low: bar.low, close: bar.close,
          ...(bar.volume === undefined ? {} : { volume: bar.volume })
        })),
        pred_len: snapshot.horizon, sample_count: 6
      }
    })
    if (current(snapshot) && !pending) {
      const parsed = parseForecastResult(result, snapshot)
      useKronosStore.setState({
        cacheKey: snapshot.key,
        contextBars: parsed.contextBars,
        cutoffTimestamp: parsed.cutoffTimestamp,
        originTimestamp: parsed.originTimestamp,
        originClose: parsed.originPrice,
        quality: parsed.quality,
        steps: parsed.steps,
        status: 'ready',
        error: ''
      })
    }
  } catch (error) {
    if (current(snapshot) && !pending) {
      const state = useKronosStore.getState()
      const keepPrior = Boolean(state.cacheKey && snapshot.originTimestamp > state.originTimestamp)
      useKronosStore.setState({
        ...(keepPrior ? {} : {
          cacheKey: '', contextBars: 0, cutoffTimestamp: 0, originTimestamp: 0,
          originClose: 0, quality: emptyQuality, steps: []
        }),
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  } finally {
    running = false
    void drain()
  }
}

export function requestKronosRollout(
  identity: KronosChartIdentity,
  bars: readonly KronosBar[],
  horizon = 12,
  inputState?: KronosInputState
): void {
  const state = useKronosStore.getState()
  if (!sameChart(state.identity, identity)) return
  const rawBars = bars.map((bar) => ({ ...bar }))
  const cutoffTimestamp = inputState?.cutoffTimestamp ?? Date.now()
  if (inputState?.error) {
    latest = { identity: { ...identity }, generation: state.generation, key: '', bars: [], rawBars,
      horizon, cutoffTimestamp, originTimestamp: 0, quality: { gapCount: 0, missingVolumeCount: 0 },
      inputState: { ...inputState } }
    pending = null
    attemptedKey = ''
    useKronosStore.setState({ status: 'error', error: inputState.error })
    return
  }
  let prepared: ReturnType<typeof prepareKronosInput>
  try {
    if (horizon < 1 || horizon > 12) throw new Error('Invalid forecast horizon')
    prepared = prepareKronosInput(identity, rawBars, cutoffTimestamp)
  } catch (error) {
    latest = { identity: { ...identity }, generation: state.generation, key: '', bars: [], rawBars,
      horizon, cutoffTimestamp, originTimestamp: 0, quality: { gapCount: 0, missingVolumeCount: 0 },
      inputState: inputState ? { ...inputState } : undefined }
    pending = null
    attemptedKey = ''
    useKronosStore.setState({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    return
  }
  if (!prepared.key) {
    latest = null
    pending = null
    attemptedKey = ''
    if (state.cacheKey || state.status !== 'idle') {
      useKronosStore.setState({
        generation: state.generation + 1, cacheKey: '', contextBars: 0, cutoffTimestamp: 0,
        originTimestamp: 0, originClose: 0, quality: emptyQuality, steps: [], status: 'idle', error: ''
      })
    }
    return
  }
  const snapshot: Snapshot = {
    identity: { ...identity },
    generation: state.generation,
    key: prepared.key,
    bars: prepared.bars,
    rawBars,
    horizon,
    cutoffTimestamp,
    originTimestamp: prepared.originTimestamp,
    quality: prepared.quality,
    inputState: inputState ? { ...inputState } : undefined
  }
  latest = snapshot
  if (prepared.key === state.cacheKey || prepared.key === attemptedKey) return
  const invalidatePrior = Boolean(state.cacheKey && prepared.originTimestamp <= state.originTimestamp)
  attemptedKey = prepared.key
  pending = snapshot
  useKronosStore.setState({
    ...(invalidatePrior ? {
      cacheKey: '', contextBars: 0, cutoffTimestamp: 0, originTimestamp: 0,
      originClose: 0, quality: emptyQuality, steps: []
    } : {}),
    status: 'computing',
    error: ''
  })
  void drain()
}

export function retryKronos(): void {
  if (!latest || !current(latest) || running) return
  attemptedKey = ''
  requestKronosRollout(latest.identity, latest.rawBars, latest.horizon, latest.inputState)
}

export function getCachedKronosRollout(
  identity: KronosChartIdentity,
  _bars?: readonly KronosBar[],
  horizon = 12
): KronosStep[] {
  const state = useKronosStore.getState()
  if (!sameChart(state.identity, identity) || !state.cacheKey || state.steps.length !== horizon) return []
  return state.steps.map((s) => ({ ...s }))
}
