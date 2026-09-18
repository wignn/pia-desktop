import { describe, it, expect } from 'vitest'
import { pairOptionContractsByStrike, resolveValidExpiration } from './options-helpers'
import type { OptionContractData } from '@shared/types'

describe('options-helpers', () => {
  describe('pairOptionContractsByStrike', () => {
    const calls: OptionContractData[] = [
      {
        strike: 100,
        type: 'call',
        expiration: '2026-05-15',
        last: 5.5,
        volume: 100,
        openInterest: 500,
        impliedVolatility: 0.25
      },
      {
        strike: 110,
        type: 'call',
        expiration: '2026-05-15',
        last: 2.1,
        volume: 50,
        openInterest: 300,
        impliedVolatility: 0.28
      },
      {
        strike: 100,
        type: 'call',
        expiration: '2026-06-19',
        last: 7.0,
        volume: 40,
        openInterest: 200,
        impliedVolatility: 0.3
      }
    ]

    const puts: OptionContractData[] = [
      {
        strike: 100,
        type: 'put',
        expiration: '2026-05-15',
        last: 4.8,
        volume: 80,
        openInterest: 450,
        impliedVolatility: 0.26
      },
      {
        strike: 90,
        type: 'put',
        expiration: '2026-05-15',
        last: 1.5,
        volume: 30,
        openInterest: 150,
        impliedVolatility: 0.32
      }
    ]

    it('pairs calls and puts by strike ascending, filtered by selected expiration', () => {
      const rows = pairOptionContractsByStrike(calls, puts, '2026-05-15')
      expect(rows).toHaveLength(3)

      // Sorted by strike: 90, 100, 110
      expect(rows[0].strike).toBe(90)
      expect(rows[0].call).toBeUndefined()
      expect(rows[0].put?.last).toBe(1.5)

      expect(rows[1].strike).toBe(100)
      expect(rows[1].call?.last).toBe(5.5)
      expect(rows[1].put?.last).toBe(4.8)

      expect(rows[2].strike).toBe(110)
      expect(rows[2].call?.last).toBe(2.1)
      expect(rows[2].put).toBeUndefined()
    })

    it('filters out other expirations when selectedExp is specified', () => {
      const rows = pairOptionContractsByStrike(calls, puts, '2026-06-19')
      expect(rows).toHaveLength(1)
      expect(rows[0].strike).toBe(100)
      expect(rows[0].call?.last).toBe(7.0)
      expect(rows[0].put).toBeUndefined()
    })

    it('handles empty inputs gracefully', () => {
      const rows = pairOptionContractsByStrike([], [], '2026-05-15')
      expect(rows).toEqual([])
    })
  })

  describe('resolveValidExpiration', () => {
    const expirations = ['2026-05-15', '2026-06-19', '2026-07-17']

    it('preserves valid currently selected expiration', () => {
      expect(resolveValidExpiration(expirations, '2026-06-19')).toBe('2026-06-19')
    })

    it('resets to first available expiration when selected is invalid or null', () => {
      expect(resolveValidExpiration(expirations, '2025-01-01')).toBe('2026-05-15')
      expect(resolveValidExpiration(expirations, null)).toBe('2026-05-15')
      expect(resolveValidExpiration(expirations, undefined)).toBe('2026-05-15')
    })

    it('returns empty string when expirations array is empty or undefined', () => {
      expect(resolveValidExpiration([], '2026-05-15')).toBe('')
      expect(resolveValidExpiration(undefined, '2026-05-15')).toBe('')
    })
  })
})
