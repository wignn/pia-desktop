import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { PiaScriptEditor, PIASCRIPT_COMPLETIONS } from './PiaScriptEditor'
import { fetchPureKronosRollout } from '../../services/kronos-client'
import { isOverlayIndicator } from '../../stores/useChartStore'

describe('PiaScriptEditor & IntelliSense', () => {
  it('renders line numbers gutter and textarea', () => {
    const code = `fast = ema(close, 9)\nslow = ema(close, 21)\nplot(fast)`
    const html = renderToString(React.createElement(PiaScriptEditor, { value: code, onChange: () => {} }))

    expect(html).toContain('data-testid="piascript-editor-textarea"')
    expect(html).toContain('1')
    expect(html).toContain('2')
    expect(html).toContain('3')
    expect(html).toContain('fast = ema(close, 9)')
  })

  it('provides complete PiaScript autocomplete vocabulary', () => {
    const labels = PIASCRIPT_COMPLETIONS.map((c) => c.label)
    expect(labels).toContain('ema')
    expect(labels).toContain('sma')
    expect(labels).toContain('rsi')
    expect(labels).toContain('crossover')
    expect(labels).toContain('crossunder')
    expect(labels).toContain('plot')
    expect(labels).toContain('buy')
    expect(labels).toContain('sell')
    expect(labels).toContain('close')
    expect(labels).toContain('hlc3')
  })

  it('filters completions accurately by prefix', () => {
    const prefix = 'cr'
    const matches = PIASCRIPT_COMPLETIONS.filter((c) =>
      c.label.toLowerCase().startsWith(prefix.toLowerCase())
    )
    expect(matches.map((m) => m.label)).toEqual(['crossover', 'crossunder'])
  })

  it('computes real-time pure Kronos AI CPU forecast fan and registers KRONOS as candle overlay', async () => {
    expect(isOverlayIndicator('KRONOS')).toBe(true)
    const bars = Array.from({ length: 32 }, (_, i) => ({
      timestamp: (1730000000 + i * 900) * 1000,
      open: 4000 + i * 1.5,
      high: 4003 + i * 1.5,
      low: 3998 + i * 1.5,
      close: 4001 + i * 1.5 + (i % 3) * 2
    }))
    const rolloutA = await fetchPureKronosRollout(bars, 12)
    expect(rolloutA).toHaveLength(12)
    for (const step of rolloutA) {
      expect(step.q10).toBeLessThanOrEqual(step.q50)
      expect(step.q50).toBeLessThanOrEqual(step.q90)
    }
    const rolloutB = await fetchPureKronosRollout([...bars.slice(0, -1), { ...bars[31], close: 4120, high: 4125 }], 12)
    expect(rolloutB[11].q50).not.toBe(rolloutA[11].q50)
  }, 20000)
})
