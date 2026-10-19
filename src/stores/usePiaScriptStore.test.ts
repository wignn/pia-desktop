import { describe, expect, it } from 'vitest'
import { usePiaScriptStore } from './usePiaScriptStore'
import { candleEngine } from '../services/candle-engine'

describe('usePiaScriptStore', () => {
  it('initializes with default script and state', () => {
    const state = usePiaScriptStore.getState()
    expect(state.script).toContain('fast = ema(close, 9)')
    expect(state.initialCapital).toBe(10000)
  })

  it('runs script against candle data and produces plots, signals, and backtest', async () => {
    const mockBars = []
    for (let i = 0; i < 40; i++) {
      const price = i < 20 ? 100 + i : 140 - i
      mockBars.push({
        timestamp: 1700000000000 + i * 60000,
        open: price,
        high: price + 1,
        low: price - 1,
        close: price,
        volume: 1000
      })
    }
    ;(candleEngine as any).activeBars = mockBars

    const result = await usePiaScriptStore.getState().runScript()
    expect(result).not.toBeNull()
    expect(result?.success).toBe(true)
    expect(result?.plots.length).toBeGreaterThan(0)
    expect(result?.backtest).toBeDefined()
    expect(result?.backtest?.initial_capital).toBe(10000)
    expect(usePiaScriptStore.getState().isAppliedToChart).toBe(true)
  })

  it('toggles apply to chart', () => {
    const cur = usePiaScriptStore.getState().isAppliedToChart
    usePiaScriptStore.getState().toggleApplyToChart()
    expect(usePiaScriptStore.getState().isAppliedToChart).toBe(!cur)
  })
})
