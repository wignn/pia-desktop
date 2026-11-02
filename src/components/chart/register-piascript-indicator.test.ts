import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

const { START, STEP, ORIGIN, registered, registerIndicator, getCachedKronosRollout, retryKronos, kronosState } = vi.hoisted(() => {
  const START = 1700000100000
  const STEP = 900000
  const ORIGIN = START + 15 * STEP
  const registered: Record<string, any> = {}
  return {
    START,
    STEP,
    ORIGIN,
    registered,
    registerIndicator: vi.fn((def: any) => { registered[def.name] = def }),
    getCachedKronosRollout: vi.fn(),
    retryKronos: vi.fn(),
    kronosState: {
      identity: { symbol: 'BTCUSD', timeframe: '15m' },
      generation: 1,
      cacheKey: 'k',
      contextBars: 256,
      cutoffTimestamp: ORIGIN + 30000,
      originTimestamp: ORIGIN,
      originClose: 101,
      quality: { gapCount: 2, missingVolumeCount: 12, normalizedOutputCount: 1 },
      steps: [],
      status: 'ready' as string,
      model: 'NeoQuasar/Kronos-base',
      error: ''
    }
  }
})
vi.mock('klinecharts', () => ({ registerIndicator }))
vi.mock('../../services/kronos-client', () => ({
  getCachedKronosRollout,
  retryKronos,
  useKronosStore: Object.assign(() => kronosState, { getState: () => kronosState })
}))
vi.mock('../../services/candle-engine', () => ({
  candleEngine: { getActiveBars: () => [] }
}))
vi.mock('../../stores/useMarketStore', () => ({
  useMarketStore: Object.assign(
    (selector: any) => selector({
      symbol: 'BTCUSD', timeframe: '15m', selectedBar: null,
      latestBar: { open: 100, high: 104, low: 99, close: 101, volume: 10 },
      prices: { BTCUSD: { price: 101 } }, symbols: [{ symbol: 'BTCUSD', category: 'CRYPTO' }]
    }),
    { getState: () => ({ symbol: 'BTCUSD', timeframe: '15m' }) }
  )
}))
vi.mock('../../stores/useChartStore', () => ({
  useChartStore: (selector: any) => selector({ activeIndicators: [{ name: 'KRONOS', paneId: 'candle_pane' }] })
}))
vi.mock('../../stores/useWorkspaceStore', () => ({ useWorkspaceStore: { getState: () => ({ theme: 'dark' }) } }))
vi.mock('../../stores/usePiaScriptStore', () => ({ usePiaScriptStore: { getState: () => ({}) } }))
import { registerPiaScriptIndicator } from './register-piascript-indicator'
import { ChartLegend } from './ChartLegend'

function makeRollout(origin = ORIGIN) {
  return Array.from({ length: 12 }, (_, i) => ({
    timestamp: origin + i * STEP,
    open: 100, high: 103, low: 99, close: 102, q10: 99, q50: 102, q90: 103
  }))
}

it('centers forecast badge text independently of inherited canvas state and keeps badges inside the pane', () => {
  registerPiaScriptIndicator()
  const indicator = registered.KRONOS
  getCachedKronosRollout.mockReturnValue(makeRollout())
  const labels: { x: number; y: number; baseline: string; align: string }[] = []
  const boxes: number[][] = []
  const ctx: any = new Proxy({
    textBaseline: 'bottom', textAlign: 'right',
    measureText: (text: string) => ({ width: text.length * 6 }),
    roundRect: (...args: number[]) => boxes.push(args),
    fillText: (_text: string, x: number, y: number) => labels.push({ x, y, baseline: ctx.textBaseline, align: ctx.textAlign })
  }, { get: (target: any, key) => key in target ? target[key] : () => {} })
  const dataList = Array.from({ length: 16 }, (_, i) => ({ timestamp: START + i * STEP, close: 100 }))
  indicator.draw({ ctx, chart: { getDataList: () => dataList },
    bounding: { width: 180, height: 120 }, xAxis: { convertToPixel: (i: number) => i * 15 },
    yAxis: { convertToPixel: (value: number) => value / 2 } })
  expect(labels).toHaveLength(2)
  labels.forEach((label, i) => {
    expect(label.baseline).toBe('middle')
    expect(label.align).toBe('left')
    const [x, y, width, height] = boxes[i]
    expect(label.y).toBe(y + height / 2)
    expect(label.x).toBeGreaterThanOrEqual(x)
    expect(x).toBeGreaterThanOrEqual(4)
    expect(x + width).toBeLessThanOrEqual(176)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y + height).toBeLessThanOrEqual(120)
  })
})

it('anchors origin at last completed bar and keeps forecast coordinates fixed across ticks and delayed replacements', () => {
  registerPiaScriptIndicator()
  const indicator = registered.KRONOS
  getCachedKronosRollout.mockReturnValue(makeRollout(ORIGIN))
  const moveTos: [number, number][] = []
  const candleRects: number[][] = []
  const ctx: any = new Proxy({
    measureText: (text: string) => ({ width: text.length * 6 }),
    moveTo: (x: number, y: number) => moveTos.push([x, y]),
    strokeRect: (...args: number[]) => candleRects.push(args)
  }, { get: (target: any, key) => key in target ? target[key] : () => {} })

  // 15 closed bars (0..14) + 1 unfinished bar at index 15 (timestamp = ORIGIN)
  const bars16 = Array.from({ length: 16 }, (_, i) => ({ timestamp: START + i * STEP, close: 100 + i }))
  indicator.draw({
    ctx,
    chart: { getDataList: () => bars16 },
    bounding: { width: 600, height: 200 },
    xAxis: { convertToPixel: (i: number) => i * 15 },
    yAxis: { convertToPixel: (v: number) => v }
  })
  // x0 is at last completed bar index 14 (14 * 15 = 210); first predicted candle is at index 15 (15 * 15 = 225)
  expect(moveTos[0][0]).toBe(14 * 15)
  const firstCandleCenter16 = candleRects[0][0] + candleRects[0][2] / 2
  expect(firstCandleCenter16).toBe(15 * 15)

  // Advance live bar and append a new bar (index 16) while replacement forecast is still pending (same ORIGIN)
  moveTos.length = 0
  candleRects.length = 0
  const bars17 = [...bars16, { timestamp: START + 16 * STEP, close: 120 }]
  indicator.draw({
    ctx,
    chart: { getDataList: () => bars17 },
    bounding: { width: 600, height: 200 },
    xAxis: { convertToPixel: (i: number) => i * 15 },
    yAxis: { convertToPixel: (v: number) => v }
  })
  expect(moveTos[0][0]).toBe(14 * 15)
  const firstCandleCenter17 = candleRects[0][0] + candleRects[0][2] / 2
  expect(firstCandleCenter17).toBe(15 * 15)
})

it('renders truthful ensemble range, scenario vs median labels, provenance caveats, and replacement error status', () => {
  const rollout = makeRollout(ORIGIN)
  kronosState.steps = rollout as any
  kronosState.status = 'ready'
  getCachedKronosRollout.mockReturnValue(rollout)
  const readyHtml = renderToStaticMarkup(React.createElement(ChartLegend))
  expect(readyHtml).toContain('Scenario candles')
  expect(readyHtml).toContain('Median line')
  expect(readyHtml).toContain('Ensemble range (q10–q90)')
  expect(readyHtml).toContain('256 closed bars')
  expect(readyHtml).toContain('2023-11-15 02:00 UTC')
  expect(readyHtml).toContain('2 gaps')
  expect(readyHtml).toContain('12 missing-vol')
  expect(readyHtml).toContain('Waiting for current candle close')
  expect(readyHtml).not.toContain('80% fan')

  kronosState.status = 'error'
  kronosState.error = 'Worker busy'
  const errorHtml = renderToStaticMarkup(React.createElement(ChartLegend))
  expect(errorHtml).toContain('Replacement failed (Worker busy); showing prior origin')
  expect(errorHtml).toContain('Retry Kronos')
  expect(errorHtml).not.toContain('Waiting for current candle close')
})
