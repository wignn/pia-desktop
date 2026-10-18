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

export function mapPiaAssetTypeToCategory(assetType: string, symbol: string): AssetCategory {
  const cleanSym = symbol.toUpperCase()
  const cleanType = (assetType || '').toLowerCase()

  if (
    cleanSym.startsWith('XAU') ||
    cleanSym.startsWith('XAG') ||
    cleanSym.startsWith('XPT') ||
    cleanSym.startsWith('XPD') ||
    cleanSym.includes('GOLD') ||
    cleanSym.includes('SILVER')
  ) {
    return 'metals'
  }

  if (
    cleanType === 'commodity' ||
    cleanSym.includes('OIL') ||
    cleanSym.includes('GAS') ||
    ['WTI', 'BRENT', 'COPPER', 'CORN', 'WHEAT'].includes(cleanSym)
  ) {
    return 'commodities'
  }

  if (
    cleanType === 'index' ||
    [
      'SPX',
      'NDX',
      'DJI',
      'DAX',
      'FTSE',
      'NIKKEI',
      'HSI',
      'JCI',
      'IHSG',
      'SSEC',
      'RUT',
      'N225',
      'NIFTY50',
      'STI',
      'FCHI',
      'GDAXI',
      'DXY',
      'VIX',
      'ASX200',
      'KOSPI',
      'SENSEX'
    ].includes(cleanSym)
  ) {
    return 'indices'
  }

  if (
    cleanType === 'fx' ||
    cleanType === 'forex' ||
    (cleanSym.length === 6 &&
      (cleanSym.endsWith('USD') ||
        cleanSym.startsWith('USD') ||
        cleanSym.startsWith('EUR') ||
        cleanSym.startsWith('GBP') ||
        cleanSym.endsWith('JPY') ||
        cleanSym.endsWith('GBP')))
  ) {
    return 'forex'
  }

  if (cleanType === 'stock' || cleanType === 'equity') return 'stocks'
  return 'crypto'
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
