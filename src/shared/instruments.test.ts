import { describe, it, expect } from 'vitest'
import {
  KNOWN_INSTRUMENTS,
  getKnownInstrument,
  getAllKnownInstruments
} from './instruments'
import { mapPiaAssetTypeToCategory, getSymbolPrecision } from './market-utils'
import { resolveSymbolTokens, LOCAL_ALIAS_MAP, INDEX_FLAG_MAP } from '../components/common/SymbolLogo'
import { LOCAL_SYMBOL_ICONS } from '../components/common/local-symbol-icons'

describe('Curated Instruments Directory & Category Standards', () => {
  it('contains verified instruments across all 6 core categories', () => {
    const instruments = Object.values(KNOWN_INSTRUMENTS)
    const categories = new Set(instruments.map((i) => i.category))

    expect(categories.has('indices')).toBe(true)
    expect(categories.has('forex')).toBe(true)
    expect(categories.has('crypto')).toBe(true)
    expect(categories.has('metals')).toBe(true)
    expect(categories.has('commodities')).toBe(true)
    expect(categories.has('stocks')).toBe(true)
  })

  it('correctly registers all 14 Finnhub OANDA Index CFDs under indices category', () => {
    const finnhubIndices = [
      'FH_SPX500', 'FH_NAS100', 'FH_US30', 'FH_US2000',
      'FH_JP225', 'FH_AU200', 'FH_UK100', 'FH_DE30',
      'FH_FR40', 'FH_EU50', 'FH_HK33', 'FH_CN50',
      'FH_SG30', 'FH_NL25'
    ]

    for (const sym of finnhubIndices) {
      const meta = getKnownInstrument(sym)
      expect(meta, `Expected ${sym} to exist in KNOWN_INSTRUMENTS`).toBeDefined()
      expect(meta?.category).toBe('indices')
      expect(meta?.name.length).toBeGreaterThan(5)
      expect(mapPiaAssetTypeToCategory('', sym)).toBe('indices')
    }
  })

  it('ensures all 14 Finnhub indices have corresponding pre-bundled local icons', () => {
    const finnhubIndices = [
      'FH_SPX500', 'FH_NAS100', 'FH_US30', 'FH_US2000',
      'FH_JP225', 'FH_AU200', 'FH_UK100', 'FH_DE30',
      'FH_FR40', 'FH_EU50', 'FH_HK33', 'FH_CN50',
      'FH_SG30', 'FH_NL25'
    ]

    for (const sym of finnhubIndices) {
      expect(LOCAL_SYMBOL_ICONS.has(sym), `Expected ${sym} to be in LOCAL_SYMBOL_ICONS`).toBe(true)
      expect(LOCAL_ALIAS_MAP[sym], `Expected ${sym} to have an alias mapping`).toBeDefined()
    }
  })

  it('strips FH_ prefix in resolveSymbolTokens to produce clean index tokens', () => {
    const spx = resolveSymbolTokens('FH_SPX500')
    expect(spx.cleanSym).toBe('SPX500')

    const nas = resolveSymbolTokens('FH_NAS100')
    expect(nas.cleanSym).toBe('NAS100')

    const us30 = resolveSymbolTokens('FH_US30')
    expect(us30.cleanSym).toBe('US30')
  })

  it('correctly maps major global assets into their manual categories', () => {
    expect(mapPiaAssetTypeToCategory('', 'XAUUSD')).toBe('metals')
    expect(mapPiaAssetTypeToCategory('', 'XAGUSD')).toBe('metals')
    expect(mapPiaAssetTypeToCategory('', 'USOIL')).toBe('commodities')
    expect(mapPiaAssetTypeToCategory('', 'UKOIL')).toBe('commodities')
    expect(mapPiaAssetTypeToCategory('', 'EURUSD')).toBe('forex')
    expect(mapPiaAssetTypeToCategory('', 'USDJPY')).toBe('forex')
    expect(mapPiaAssetTypeToCategory('', 'BTCUSDT')).toBe('crypto')
    expect(mapPiaAssetTypeToCategory('', 'SOLUSDT')).toBe('crypto')
    expect(mapPiaAssetTypeToCategory('', 'AAPL')).toBe('stocks')
    expect(mapPiaAssetTypeToCategory('', 'BBCA')).toBe('stocks')
  })

  it('getAllKnownInstruments returns complete SymbolInfo instances with precision and capabilities', () => {
    const all = getAllKnownInstruments()
    expect(all.length).toBeGreaterThanOrEqual(70)

    for (const item of all) {
      expect(item.symbol).toBeTruthy()
      expect(item.name).toBeTruthy()
      expect(item.category).toBeTruthy()
      expect(item.capabilities).toBeDefined()
      expect(item.pricePrecision).toBeGreaterThanOrEqual(0)
      expect(item.volumePrecision).toBeGreaterThanOrEqual(0)
      expect(item.minMove).toBeGreaterThan(0)
    }
  })

  it('provides country flag fallbacks for all regional index CFDs', () => {
    expect(INDEX_FLAG_MAP['FH_CN50']).toBe('cn')
    expect(INDEX_FLAG_MAP['FH_NL25']).toBe('nl')
    expect(INDEX_FLAG_MAP['FH_JP225']).toBe('jp')
    expect(INDEX_FLAG_MAP['FH_UK100']).toBe('gb')
    expect(INDEX_FLAG_MAP['FH_DE30']).toBe('de')
    expect(INDEX_FLAG_MAP['FH_FR40']).toBe('fr')
    expect(INDEX_FLAG_MAP['AUSTRALIA 200']).toBe('au')
    expect(INDEX_FLAG_MAP['GERMANY 40']).toBe('de')
    expect(INDEX_FLAG_MAP['UK 100']).toBe('gb')
  })

  it('accurately categorizes cTrader word-form symbols without misclassifying stocks as commodities or metals', () => {
    // Equities that contain metal or commodity words must NOT be misclassified
    expect(mapPiaAssetTypeToCategory('unknown', 'GOLDMAN SACHS')).toBe('stocks')
    expect(mapPiaAssetTypeToCategory('unknown', 'ROYAL GOLD')).toBe('stocks')
    expect(mapPiaAssetTypeToCategory('unknown', 'AIRGAS')).toBe('stocks')
    expect(mapPiaAssetTypeToCategory('unknown', 'TOKYO GAS')).toBe('stocks')
    expect(mapPiaAssetTypeToCategory('unknown', 'OIL SEARCH')).toBe('stocks')
    expect(mapPiaAssetTypeToCategory('unknown', 'TESLA MOTORS')).toBe('stocks')

    // cTrader indices with spaces
    expect(mapPiaAssetTypeToCategory('unknown', 'US 500')).toBe('indices')
    expect(mapPiaAssetTypeToCategory('unknown', 'US 30')).toBe('indices')
    expect(mapPiaAssetTypeToCategory('unknown', 'US TECH 100')).toBe('indices')
    expect(mapPiaAssetTypeToCategory('unknown', 'AUSTRALIA 200')).toBe('indices')
    expect(mapPiaAssetTypeToCategory('unknown', 'GERMANY 40')).toBe('indices')
    expect(mapPiaAssetTypeToCategory('unknown', 'FRANCE 40')).toBe('indices')
    expect(mapPiaAssetTypeToCategory('unknown', 'JAPAN 225')).toBe('indices')
    expect(mapPiaAssetTypeToCategory('unknown', 'EUROPE 50')).toBe('indices')
    expect(mapPiaAssetTypeToCategory('unknown', 'MSCI JAPAN')).toBe('indices')

    // cTrader commodities
    expect(mapPiaAssetTypeToCategory('unknown', 'XBRUSD')).toBe('commodities')
    expect(mapPiaAssetTypeToCategory('unknown', 'XTIUSD')).toBe('commodities')
    expect(mapPiaAssetTypeToCategory('unknown', 'NAT.GAS')).toBe('commodities')
    expect(mapPiaAssetTypeToCategory('unknown', 'NATGAS')).toBe('commodities')
    expect(mapPiaAssetTypeToCategory('unknown', 'DB OIL FUND')).toBe('commodities')

    // Metals taking priority over BUSD crypto suffix
    expect(mapPiaAssetTypeToCategory('unknown', 'XPBUSD')).toBe('metals')
    expect(mapPiaAssetTypeToCategory('unknown', 'XPBUSDM')).toBe('metals')
    expect(mapPiaAssetTypeToCategory('unknown', 'XCUUSD')).toBe('metals')
    expect(mapPiaAssetTypeToCategory('unknown', 'XALUSD')).toBe('metals')
    expect(mapPiaAssetTypeToCategory('unknown', 'XZNUSD')).toBe('metals')
    expect(mapPiaAssetTypeToCategory('unknown', 'XAUUSD247')).toBe('metals')

    // Forex micro contracts
    expect(mapPiaAssetTypeToCategory('unknown', 'EURUSDM')).toBe('forex')
    expect(mapPiaAssetTypeToCategory('unknown', 'GBPJPYM')).toBe('forex')

    // Stock tickers from broker that were falsely tagged with forex asset_type
    expect(mapPiaAssetTypeToCategory('forex', 'ABBV')).toBe('stocks')
    expect(mapPiaAssetTypeToCategory('forex', 'AMD')).toBe('stocks')
    expect(mapPiaAssetTypeToCategory('forex', 'ADBE')).toBe('stocks')
  })
})
