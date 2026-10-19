import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { PiaScriptEditor, PIASCRIPT_COMPLETIONS } from './PiaScriptEditor'

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
})
