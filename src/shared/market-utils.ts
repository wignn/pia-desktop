/**
 * Provider-backed market metadata utilities.
 * These helpers classify and format symbols; they do not contain market data.
 */

import type { AssetCategory, MarketCapabilities } from './types'

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
  'ASX200', 'AUS200', 'AUS200M', 'KOSPI', 'SENSEX', 'HK50', 'HK50M',
  'US30', 'US30M', 'US30X10', 'US30_X10M', 'US500', 'US500M', 'US500X100', 'US500_X100M',
  'USTEC', 'USTECM', 'USTECX100', 'USTEC_X100M', 'DE30', 'DE30M', 'FR40', 'FR40M',
  'UK100', 'UK100M', 'STOXX50', 'STOXX50M', 'JP225', 'JP225M'
])

const FOREX_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'HKD', 'SEK', 'NOK',
  'TRY', 'ZAR', 'MXN', 'PLN', 'CZK', 'HUF', 'ILS', 'DKK', 'CNH', 'THB', 'RUB', 'CNY', 'IDR'
])

export function mapPiaAssetTypeToCategory(assetType: string, symbol: string): AssetCategory {
  const cleanSym = symbol.toUpperCase()
  const cleanType = (assetType || '').toLowerCase()

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
    cleanSym.includes('GOLD') ||
    cleanSym.includes('SILVER') ||
    cleanSym.includes('COPPER')
  ) {
    return 'metals'
  }

  if (
    cleanType === 'commodity' ||
    cleanSym.includes('OIL') ||
    cleanSym.includes('GAS') ||
    cleanSym.startsWith('XNG') ||
    ['WTI', 'BRENT', 'CORN', 'WHEAT'].includes(cleanSym)
  ) {
    return 'commodities'
  }

  if (cleanType === 'index' || KNOWN_INDICES.has(cleanSym)) {
    return 'indices'
  }

  if (
    cleanType === 'crypto' ||
    cleanSym.endsWith('USDT') ||
    cleanSym.endsWith('BTC') ||
    cleanSym.startsWith('BTC') ||
    cleanSym.startsWith('ETH')
  ) {
    return 'crypto'
  }

  // Currency pairs (standard 6-letter or micro pairs like EURUSDM)
  const base = cleanSym.endsWith('M') && cleanSym.length === 7 ? cleanSym.slice(0, 6) : cleanSym
  if (base.length === 6) {
    const c1 = base.slice(0, 3)
    const c2 = base.slice(3, 6)
    if (FOREX_CURRENCIES.has(c1) && FOREX_CURRENCIES.has(c2)) {
      return 'forex'
    }
  }

  if (cleanType === 'stock' || cleanType === 'equity') return 'stocks'
  return 'stocks'
}

export function getSymbolPrecision(
  symbol: string,
  category?: AssetCategory,
  currentPrice?: number
): { pricePrecision: number; volumePrecision: number; minMove: number } {
  const cleanSym = (symbol || '').toUpperCase()
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
