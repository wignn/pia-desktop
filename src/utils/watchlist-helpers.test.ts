import { describe, it, expect } from 'vitest'
import {
  validateSymbolAgainstCatalog,
  canDeleteWatchlist,
  resolveActiveWatchlistId
} from './watchlist-helpers'

describe('watchlist-helpers', () => {
  describe('validateSymbolAgainstCatalog', () => {
    const catalog = [{ symbol: 'AAPL' }, { symbol: 'BTCUSDT' }, { symbol: 'EURUSD' }]

    it('returns invalid for empty input', () => {
      expect(validateSymbolAgainstCatalog('')).toEqual({ valid: false, symbol: '' })
      expect(validateSymbolAgainstCatalog('   ')).toEqual({ valid: false, symbol: '' })
      expect(validateSymbolAgainstCatalog(null)).toEqual({ valid: false, symbol: '' })
    })

    it('validates symbol in catalog case-insensitively', () => {
      expect(validateSymbolAgainstCatalog('aapl', catalog)).toEqual({
        valid: true,
        symbol: 'AAPL'
      })
      expect(validateSymbolAgainstCatalog('BTCUSDT', catalog)).toEqual({
        valid: true,
        symbol: 'BTCUSDT'
      })
    })

    it('rejects symbol not in catalog when catalog has items', () => {
      expect(validateSymbolAgainstCatalog('UNKNOWN', catalog)).toEqual({
        valid: false,
        symbol: 'UNKNOWN'
      })
    })

    it('allows valid format when catalog is empty/loading', () => {
      expect(validateSymbolAgainstCatalog('NVDA', [])).toEqual({
        valid: true,
        symbol: 'NVDA'
      })
      expect(validateSymbolAgainstCatalog('INVALID@#$SYMBOL', [])).toEqual({
        valid: false,
        symbol: 'INVALID@#$SYMBOL'
      })
    })
  })

  describe('canDeleteWatchlist', () => {
    it('returns false when only one or zero watchlists exist', () => {
      expect(canDeleteWatchlist([])).toBe(false)
      expect(canDeleteWatchlist([{ id: 'wl-1' }])).toBe(false)
    })

    it('returns true when more than one watchlist exists', () => {
      expect(canDeleteWatchlist([{ id: 'wl-1' }, { id: 'wl-2' }])).toBe(true)
    })
  })

  describe('resolveActiveWatchlistId', () => {
    const lists = [{ id: 'wl-1' }, { id: 'wl-2' }, { id: 'wl-3' }]

    it('returns preferred ID if it exists in watchlists', () => {
      expect(resolveActiveWatchlistId('wl-2', lists)).toBe('wl-2')
    })

    it('falls back to first list ID if preferred ID does not exist', () => {
      expect(resolveActiveWatchlistId('wl-nonexistent', lists)).toBe('wl-1')
      expect(resolveActiveWatchlistId(null, lists)).toBe('wl-1')
    })

    it('falls back to fallbackId when watchlists array is empty', () => {
      expect(resolveActiveWatchlistId('wl-custom', [], 'fallback-id')).toBe('wl-custom')
      expect(resolveActiveWatchlistId(null, [], 'fallback-id')).toBe('fallback-id')
    })
  })
})
