/**
 * Provider-backed market metadata utilities.
 * These helpers classify and format symbols; they do not contain market data.
 */

import type { AssetCategory, MarketCapabilities } from './types'
import { getKnownInstrument } from './instruments'

export const DEFAULT_MARKET_CAPABILITIES: MarketCapabilities = {
  quote: true,
  candles: true,
  trades: true,
  orderBook: false,
  options: false,
  gex: false
}

export function resolveOptionsUnderlying(symbol: string): string {
  const clean = symbol.trim().toUpperCase()
  if (clean === 'XAUUSD' || clean === 'GOLD') return 'GLD'
  if (clean === 'XAGUSD' || clean === 'SILVER') return 'SLV'
  return clean
}
export function capabilitiesForSymbol(symbol: string, category: AssetCategory): MarketCapabilities {
  const clean = symbol.toUpperCase()
  const optionsUnderlying =
    clean === 'XAUUSD' || clean === 'GOLD' || clean === 'XAGUSD' || clean === 'SILVER'
  return {
    ...DEFAULT_MARKET_CAPABILITIES,
    orderBook: true,
    options: optionsUnderlying || category === 'stocks' || category === 'indices',
    gex: optionsUnderlying || category === 'stocks' || category === 'indices'
  }
}

const KNOWN_INDICES = new Set([
  'SPX', 'NDX', 'DJI', 'DAX', 'FTSE', 'NIKKEI', 'HSI', 'JCI', 'IHSG', 'SSEC',
  'RUT', 'N225', 'NIFTY50', 'STI', 'FCHI', 'GDAXI', 'DXY', 'DXYM', 'VIX',
  'ASX200', 'AUS200', 'AUS200M', 'KOSPI', 'SENSEX', 'HK50', 'HK50M', 'HK33',
  'US30', 'US30M', 'US30X10', 'US30_X10M', 'US500', 'US500M', 'US500X100', 'US500_X100M',
  'USTEC', 'USTECM', 'USTECX100', 'USTEC_X100M', 'DE30', 'DE30M', 'FR40', 'FR40M',
  'UK100', 'UK100M', 'STOXX50', 'STOXX50M', 'JP225', 'JP225M',
  'SPX500', 'NAS100', 'US2000', 'AU200', 'EU50', 'CN50', 'SG30', 'NL25',
  'FH_SPX500', 'FH_NAS100', 'FH_US30', 'FH_US2000', 'FH_JP225', 'FH_AU200',
  'FH_UK100', 'FH_DE30', 'FH_FR40', 'FH_EU50', 'FH_HK33', 'FH_CN50', 'FH_SG30', 'FH_NL25',
  'FTSE RAFI US1000', 'FTSE RAFI US1500', 'DB US DOLLAR INDEX', 'DB COMMODITY INDEX', 'US COMMODITY INDEX',
  'AUSTRALIA 200', 'EUROPE 50', 'FRANCE 40', 'GERMANY 40', 'HONG KONG 50', 'ITALY 40',
  'JAPAN 225', 'LATIN AMERICA 40', 'NETHERLANDS 25', 'SPAIN 35', 'SWITZERLAND 20', 'UK 100', 'US 30', 'US 500',
  'US TECH 100', 'CORE S&P 500', 'S&P 500 LOW VOLATILITY', 'CHINA LARGE-CAP'
])

const KNOWN_COMMODITIES = new Set([
  'USOIL', 'USOILM', 'UKOIL', 'UKOILM', 'XNGUSD', 'XNGUSDM', 'BRENT', 'WTI', 'NAT.GAS', 'NATGAS',
  'XBRUSD', 'XTIUSD', 'CORN', 'WHEAT', 'SOYBEAN', 'COFFEE', 'SUGAR', 'COTTON', 'COCOA',
  'DB OIL FUND', 'DB AGRICULTURE FUND', 'US OIL FUND', 'US NATURAL GAS FUND'
])

const FOREX_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'HKD', 'SEK', 'NOK',
  'TRY', 'ZAR', 'MXN', 'PLN', 'CZK', 'HUF', 'ILS', 'DKK', 'CNH', 'THB', 'RUB', 'CNY', 'IDR'
])

const CRYPTO_COINS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'SUI', 'NEAR', 'APT', 'PEPE', 'LTC'
]

export function isForexCurrencyPair(symbol: string): boolean {
  let s = (symbol || '').toUpperCase().trim()
  if (s.endsWith('M') && s.length === 7) s = s.slice(0, 6)
  if (s.length === 6) {
    const base = s.slice(0, 3)
    const quote = s.slice(3, 6)
    if (FOREX_CURRENCIES.has(base) && FOREX_CURRENCIES.has(quote)) return true
  }
  if (s.includes('/') || s.includes('_') || s.includes('-')) {
    const parts = s.split(/[/\\-_]/)
    if (parts.length >= 2 && FOREX_CURRENCIES.has(parts[0]) && FOREX_CURRENCIES.has(parts[1])) return true
  }
  return false
}

export function mapPiaAssetTypeToCategory(assetType: string, symbol: string): AssetCategory {
  const cleanSym = (symbol || '').toUpperCase().trim()
  const cleanType = (assetType || '').toLowerCase().trim()

  const known = getKnownInstrument(cleanSym)
  if (known) return known.category

  // 1. Metals First (prevents XPBUSD matching crypto BUSD)
  if (
    cleanSym.startsWith('XAU') ||
    cleanSym.startsWith('XAG') ||
    cleanSym.startsWith('XPT') ||
    cleanSym.startsWith('XPD') ||
    cleanSym.startsWith('XAL') ||
    cleanSym.startsWith('XCU') ||
    cleanSym.startsWith('XNI') ||
    cleanSym.startsWith('XPB') ||
    cleanSym.startsWith('XZN') ||
    cleanSym === 'GOLD' ||
    cleanSym === 'SILVER' ||
    cleanSym === 'COPPER' ||
    cleanSym === 'PLATINUM' ||
    cleanSym === 'PALLADIUM'
  ) {
    return 'metals'
  }

  // 2. Commodities (Energies, Agriculture, Commodity Funds)
  if (
    KNOWN_COMMODITIES.has(cleanSym) ||
    cleanSym.startsWith('XNG') ||
    cleanSym === 'XBRUSD' ||
    cleanSym === 'XTIUSD' ||
    cleanSym === 'WTI' ||
    cleanSym === 'BRENT' ||
    cleanSym === 'USOIL' ||
    cleanSym === 'UKOIL' ||
    cleanSym === 'NAT.GAS' ||
    cleanSym === 'NATGAS'
  ) {
    return 'commodities'
  }

  // 3. Indices (Finnhub OANDA CFDs, Benchmarks, Word-form CFDs, MSCI indices)
  const noM = cleanSym.endsWith('M') ? cleanSym.slice(0, -1) : cleanSym
  if (
    cleanSym.startsWith('FH_') ||
    cleanSym.startsWith('MSCI ') ||
    cleanType === 'index' ||
    cleanType === 'indices' ||
    KNOWN_INDICES.has(cleanSym) ||
    KNOWN_INDICES.has(cleanSym.replace(/^FH_/, '')) ||
    KNOWN_INDICES.has(noM)
  ) {
    return 'indices'
  }

  // 4. Crypto (Major tokens, Binance pairs, stablecoins, micro contracts)
  if (cleanType === 'crypto') return 'crypto'
  if (
    cleanSym.endsWith('USDT') ||
    cleanSym.endsWith('USDTM') ||
    cleanSym.endsWith('USDC') ||
    cleanSym.endsWith('USDCM') ||
    cleanSym.endsWith('PERP')
  ) {
    return 'crypto'
  }
  for (const c of CRYPTO_COINS) {
    if (cleanSym.startsWith(c)) {
      let rem = cleanSym.slice(c.length)
      if (rem.endsWith('M')) rem = rem.slice(0, -1)
      if (
        FOREX_CURRENCIES.has(rem) ||
        rem === 'XAU' ||
        rem === 'XAG' ||
        rem === 'USDT' ||
        rem === 'USDC' ||
        rem === 'BUSD'
      ) {
        return 'crypto'
      }
    }
  }

  // 5. Forex (Strict verification: must be a genuine fiat pair)
  if (isForexCurrencyPair(cleanSym)) {
    return 'forex'
  }

  // 6. Stocks / Corporate Equities / Corporate CFDs / Bonds / ETFs
  return 'stocks'
}

export function getSymbolPrecision(
  symbol: string,
  category?: AssetCategory,
  currentPrice?: number
): { pricePrecision: number; volumePrecision: number; minMove: number } {
  const cleanSym = (symbol || '').toUpperCase().trim()
  const known = getKnownInstrument(cleanSym)
  if (known && currentPrice === undefined) {
    return {
      pricePrecision: known.pricePrecision,
      volumePrecision: known.volumePrecision,
      minMove: known.minMove
    }
  }

  const cat = category || mapPiaAssetTypeToCategory('', cleanSym)

  if (cat === 'forex') {
    return cleanSym.includes('JPY')
      ? { pricePrecision: 3, volumePrecision: 2, minMove: 0.001 }
      : { pricePrecision: 5, volumePrecision: 2, minMove: 0.00001 }
  }
  if (cat === 'metals') {
    return cleanSym.startsWith('XAG') || cleanSym.includes('SILVER')
      ? { pricePrecision: 3, volumePrecision: 2, minMove: 0.001 }
      : { pricePrecision: 2, volumePrecision: 3, minMove: 0.01 }
  }
  if (cat === 'commodities') {
    return cleanSym.includes('GAS') || cleanSym === 'NATGAS' || cleanSym === 'NGAS'
      ? { pricePrecision: 3, volumePrecision: 2, minMove: 0.001 }
      : { pricePrecision: 2, volumePrecision: 2, minMove: 0.01 }
  }
  if (cat === 'crypto') {
    if (currentPrice !== undefined && currentPrice < 0.1) {
      return { pricePrecision: 6, volumePrecision: 1, minMove: 0.000001 }
    }
    if (currentPrice !== undefined && currentPrice < 1) {
      return { pricePrecision: 4, volumePrecision: 2, minMove: 0.0001 }
    }
    if (currentPrice !== undefined && currentPrice < 10) {
      return { pricePrecision: 3, volumePrecision: 3, minMove: 0.001 }
    }
    return { pricePrecision: 2, volumePrecision: 4, minMove: 0.01 }
  }
  if (cat === 'indices') return { pricePrecision: 2, volumePrecision: 0, minMove: 0.1 }
  return { pricePrecision: 2, volumePrecision: 2, minMove: 0.01 }
}

export function resolveNewsImage(
  title: string = '',
  summary: string = '',
  category: string = '',
  index: number = 0
): string {
  const text = `${title} ${summary} ${category}`.toLowerCase()

  if (
    text.includes('bitcoin') ||
    text.includes('crypto') ||
    text.includes('btc') ||
    text.includes('eth') ||
    text.includes('solana') ||
    text.includes('blockchain') ||
    text.includes('token')
  ) {
    return 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=80'
  }
  if (
    text.includes('gold') ||
    text.includes('bullion') ||
    text.includes('silver') ||
    text.includes('metal') ||
    text.includes('xau')
  ) {
    return 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=500&auto=format&fit=crop&q=80'
  }
  if (
    text.includes('oil') ||
    text.includes('crude') ||
    text.includes('energy') ||
    text.includes('opec') ||
    text.includes('gas') ||
    text.includes('brent') ||
    text.includes('wti')
  ) {
    return 'https://images.unsplash.com/photo-1518331647614-7a1f04cd34cf?w=500&auto=format&fit=crop&q=80'
  }
  if (
    text.includes('fed') ||
    text.includes('inflation') ||
    text.includes('cpi') ||
    text.includes('rate') ||
    text.includes('powell') ||
    text.includes('treasury') ||
    text.includes('yield') ||
    text.includes('macro') ||
    text.includes('central bank')
  ) {
    return 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=500&auto=format&fit=crop&q=80'
  }
  if (
    text.includes('dollar') ||
    text.includes('forex') ||
    text.includes('currency') ||
    text.includes('euro') ||
    text.includes('yen') ||
    text.includes('fx')
  ) {
    return 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=500&auto=format&fit=crop&q=80'
  }

  const editorialList = [
    'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1565372195458-9de0b320ef04?w=500&auto=format&fit=crop&q=80'
  ]
  return editorialList[Math.abs(index) % editorialList.length]
}
