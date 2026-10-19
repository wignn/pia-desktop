import { AssetCategory } from '../shared/types'

export interface MarketStatusResult {
  isOpen: boolean
  label: string
  is24_7: boolean
}

/**
 * Determines whether the market session is currently open or closed for a given asset.
 * ponytail: UTC heuristic sessions; upgrade to individual exchange holiday calendars if needed.
 */
export function getMarketSessionStatus(
  category?: AssetCategory,
  symbol?: string,
  date: Date = new Date()
): MarketStatusResult {
  const sym = symbol?.toUpperCase() || ''
  const isCrypto =
    category === 'crypto' ||
    sym.endsWith('USDT') ||
    sym.endsWith('USD') && (sym.startsWith('BTC') || sym.startsWith('ETH') || sym.startsWith('SOL'))

  if (isCrypto) {
    return { isOpen: true, label: 'Market Open (24/7)', is24_7: true }
  }

  const utcDay = date.getUTCDay() // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
  const utcHour = date.getUTCHours()
  const utcMinute = date.getUTCMinutes()
  const currentMinutes = utcHour * 60 + utcMinute

  const isWeekendForex =
    utcDay === 6 || // Saturday all day
    (utcDay === 5 && currentMinutes >= 22 * 60) || // Friday after 22:00 UTC
    (utcDay === 0 && currentMinutes < 21 * 60) // Sunday before 21:00 UTC

  if (category === 'forex' || category === 'metals' || category === 'commodities') {
    if (isWeekendForex) {
      return { isOpen: false, label: 'Market Closed (Weekend)', is24_7: false }
    }
    return { isOpen: true, label: 'Market Open', is24_7: false }
  }

  if (category === 'stocks' || category === 'indices') {
    if (utcDay === 0 || utcDay === 6) {
      return { isOpen: false, label: 'Market Closed (Weekend)', is24_7: false }
    }
    // US regular trading session: 13:30 to 20:00 UTC (9:30 AM - 4:00 PM EST)
    const isRegularTradingHours = currentMinutes >= 13 * 60 + 30 && currentMinutes < 20 * 60
    if (isRegularTradingHours) {
      return { isOpen: true, label: 'Market Open', is24_7: false }
    }
    return { isOpen: false, label: 'Market Closed', is24_7: false }
  }

  // Fallback for unknown categories: check weekend
  if (utcDay === 0 || utcDay === 6) {
    return { isOpen: false, label: 'Market Closed (Weekend)', is24_7: false }
  }

  return { isOpen: true, label: 'Market Open', is24_7: false }
}
