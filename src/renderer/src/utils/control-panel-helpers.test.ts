import { describe, it, expect } from 'vitest'
import { resolveControlWidgetSymbol } from './control-panel-helpers'

describe('control-panel-helpers', () => {
  describe('resolveControlWidgetSymbol', () => {
    const catalog = [{ symbol: 'AAPL' }, { symbol: 'BTCUSDT' }, { symbol: 'ETHUSDT' }]

    it('returns valid uppercase symbol when in catalog', () => {
      expect(resolveControlWidgetSymbol('aapl', catalog)).toBe('AAPL')
      expect(resolveControlWidgetSymbol('BTCUSDT', catalog)).toBe('BTCUSDT')
    })

    it('falls back to first catalog symbol when active symbol is not in catalog', () => {
      expect(resolveControlWidgetSymbol('UNKNOWN_SYM', catalog)).toBe('AAPL')
    })

    it('falls back to first catalog symbol when active symbol is empty or whitespace', () => {
      expect(resolveControlWidgetSymbol('', catalog)).toBe('AAPL')
      expect(resolveControlWidgetSymbol('   ', catalog)).toBe('AAPL')
      expect(resolveControlWidgetSymbol(null, catalog)).toBe('AAPL')
      expect(resolveControlWidgetSymbol(undefined, catalog)).toBe('AAPL')
    })

    it('falls back to custom fallback if catalog is empty and symbol is empty', () => {
      expect(resolveControlWidgetSymbol('', [], 'XAUUSD')).toBe('XAUUSD')
      expect(resolveControlWidgetSymbol(null, [], 'EURUSD')).toBe('EURUSD')
    })

    it('accepts trimmed active symbol if catalog is empty/unloaded', () => {
      expect(resolveControlWidgetSymbol('solusdt', [])).toBe('SOLUSDT')
    })
  })
})
