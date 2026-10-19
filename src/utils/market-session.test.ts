import { describe, it, expect } from 'vitest'
import { getMarketSessionStatus } from './market-session'

describe('market-session', () => {
  it('identifies crypto as always 24/7 open regardless of day', () => {
    // Saturday
    const sat = new Date('2026-10-17T12:00:00Z')
    const btc = getMarketSessionStatus('crypto', 'BTCUSDT', sat)
    expect(btc.isOpen).toBe(true)
    expect(btc.is24_7).toBe(true)
    expect(btc.label).toBe('Market Open (24/7)')

    const sol = getMarketSessionStatus(undefined, 'SOLUSDT', sat)
    expect(sol.isOpen).toBe(true)
    expect(sol.is24_7).toBe(true)
  })

  it('marks forex and metals closed during weekend', () => {
    // Saturday noon UTC
    const sat = new Date('2026-10-17T12:00:00Z')
    const gold = getMarketSessionStatus('metals', 'XAUUSD', sat)
    expect(gold.isOpen).toBe(false)
    expect(gold.label).toBe('Market Closed (Weekend)')

    const eurusd = getMarketSessionStatus('forex', 'EURUSD', sat)
    expect(eurusd.isOpen).toBe(false)
    expect(eurusd.label).toBe('Market Closed (Weekend)')
  })

  it('marks forex and metals open during weekday', () => {
    // Wednesday 10:00 UTC
    const wed = new Date('2026-10-14T10:00:00Z')
    const gold = getMarketSessionStatus('metals', 'XAUUSD', wed)
    expect(gold.isOpen).toBe(true)
    expect(gold.label).toBe('Market Open')
  })

  it('handles US stocks trading hours vs closed sessions', () => {
    // Wednesday 15:00 UTC (10:00 AM EST - Market Open)
    const wedOpen = new Date('2026-10-14T15:00:00Z')
    const nvda = getMarketSessionStatus('stocks', 'NVDA', wedOpen)
    expect(nvda.isOpen).toBe(true)
    expect(nvda.label).toBe('Market Open')

    // Wednesday 22:00 UTC (6:00 PM EST - Market Closed)
    const wedClosed = new Date('2026-10-14T22:00:00Z')
    const nvdaClosed = getMarketSessionStatus('stocks', 'NVDA', wedClosed)
    expect(nvdaClosed.isOpen).toBe(false)
    expect(nvdaClosed.label).toBe('Market Closed')

    // Sunday (Weekend)
    const sun = new Date('2026-10-18T15:00:00Z')
    const aaplSun = getMarketSessionStatus('stocks', 'AAPL', sun)
    expect(aaplSun.isOpen).toBe(false)
    expect(aaplSun.label).toBe('Market Closed (Weekend)')
  })
})
