import { describe, it, expect } from 'vitest'
import { resolveControlWidgetSymbol, resolveControlWidgetTimeframe } from './control-panel-helpers'

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

  describe('resolveControlWidgetTimeframe', () => {
    it('keeps every canonical timeframe', () => {
      expect(resolveControlWidgetTimeframe('30m')).toBe('30m')
      expect(resolveControlWidgetTimeframe('4h')).toBe('4h')
      expect(resolveControlWidgetTimeframe('1w')).toBe('1w')
    })

    it('replaces invalid persisted values with the requested fallback', () => {
      expect(resolveControlWidgetTimeframe('1M')).toBe('15m')
      expect(resolveControlWidgetTimeframe('', '1h')).toBe('1h')
      expect(resolveControlWidgetTimeframe(undefined)).toBe('15m')
    })
  })
})
