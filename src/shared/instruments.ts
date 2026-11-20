/**
 * PIA Terminal - Curated Instruments Directory
 * Standardized manual classification and metadata for all supported instruments.
 * Clients and Desktop discover exact verified instruments without guessing.
 */

import type { AssetCategory, MarketCapabilities, SymbolInfo } from './types'
import { capabilitiesForSymbol } from './market-utils'

export interface InstrumentMetadata {
  symbol: string
  name: string
  category: AssetCategory
  provider: string
  pricePrecision: number
  volumePrecision: number
  minMove: number
  country?: string
  description?: string
  isPopular?: boolean
}

export const KNOWN_INSTRUMENTS: Record<string, InstrumentMetadata> = {
  // =========================================================================
  // 1. INDICES (Finnhub OANDA CFDs & Global Benchmarks)
  // =========================================================================
  FH_SPX500: {
    symbol: 'FH_SPX500',
    name: 'S&P 500 Index Cash CFD',
    category: 'indices',
    provider: 'Finnhub/OANDA',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.05,
    country: 'US',
    description: 'Standard & Poor 500 US Large Cap Benchmark',
    isPopular: true
  },
  FH_NAS100: {
    symbol: 'FH_NAS100',
    name: 'Nasdaq 100 Index Cash CFD',
    category: 'indices',
    provider: 'Finnhub/OANDA',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.1,
    country: 'US',
    description: 'Nasdaq 100 Tech Heavy Benchmark',
    isPopular: true
  },
  FH_US30: {
    symbol: 'FH_US30',
    name: 'Dow Jones Industrial Average 30 CFD',
    category: 'indices',
    provider: 'Finnhub/OANDA',
    pricePrecision: 1,
    volumePrecision: 2,
    minMove: 0.5,
    country: 'US',
    description: 'Dow Jones 30 Blue Chip Industrial Average',
    isPopular: true
  },
  FH_US2000: {
    symbol: 'FH_US2000',
    name: 'Russell 2000 Index CFD',
    category: 'indices',
    provider: 'Finnhub/OANDA',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.05,
    country: 'US',
    description: 'US Small-Cap Equities Benchmark',
    isPopular: true
  },
  FH_JP225: {
    symbol: 'FH_JP225',
    name: 'Nikkei 225 Tokyo Index CFD',
    category: 'indices',
    provider: 'Finnhub/OANDA',
    pricePrecision: 1,
    volumePrecision: 2,
    minMove: 1.0,
    country: 'JP',
    description: 'Japan Tokyo Stock Exchange Benchmark',
    isPopular: true
  },
  FH_AU200: {
    symbol: 'FH_AU200',
    name: 'S&P/ASX 200 Australia Index CFD',
    category: 'indices',
    provider: 'Finnhub/OANDA',
    pricePrecision: 1,
    volumePrecision: 2,
    minMove: 0.5,
    country: 'AU',
    description: 'Australian Securities Exchange 200 Benchmark',
    isPopular: true
  },
  FH_UK100: {
    symbol: 'FH_UK100',
    name: 'FTSE 100 UK Index CFD',
    category: 'indices',
    provider: 'Finnhub/OANDA',
    pricePrecision: 1,
    volumePrecision: 2,
    minMove: 0.5,
    country: 'GB',
    description: 'London Stock Exchange FTSE 100 Benchmark',
    isPopular: true
  },
  FH_DE30: {
    symbol: 'FH_DE30',
    name: 'DAX 40 Germany Index CFD',
    category: 'indices',
    provider: 'Finnhub/OANDA',
    pricePrecision: 1,
    volumePrecision: 2,
    minMove: 0.5,
    country: 'DE',
    description: 'Frankfurt Stock Exchange DAX 40 Benchmark',
    isPopular: true
  },
  FH_FR40: {
    symbol: 'FH_FR40',
    name: 'CAC 40 France Index CFD',
    category: 'indices',
    provider: 'Finnhub/OANDA',
    pricePrecision: 1,
    volumePrecision: 2,
    minMove: 0.5,
    country: 'FR',
    description: 'Euronext Paris CAC 40 Benchmark',
    isPopular: true
  },
  FH_EU50: {
    symbol: 'FH_EU50',
    name: 'EURO STOXX 50 Index CFD',
    category: 'indices',
    provider: 'Finnhub/OANDA',
    pricePrecision: 1,
    volumePrecision: 2,
    minMove: 0.5,
    country: 'EU',
    description: 'Eurozone Blue-Chip 50 Benchmark',
    isPopular: true
  },
  FH_HK33: {
    symbol: 'FH_HK33',
    name: 'Hang Seng Hong Kong 33 CFD',
    category: 'indices',
    provider: 'Finnhub/OANDA',
    pricePrecision: 1,
    volumePrecision: 2,
    minMove: 1.0,
    country: 'HK',
    description: 'Hong Kong Exchanges Hang Seng Benchmark',
    isPopular: true
  },
  FH_CN50: {
    symbol: 'FH_CN50',
    name: 'FTSE China A50 Index CFD',
    category: 'indices',
    provider: 'Finnhub/OANDA',
    pricePrecision: 1,
    volumePrecision: 2,
    minMove: 1.0,
    country: 'CN',
    description: 'China Mainland A-Shares Top 50 Benchmark',
    isPopular: true
  },
  FH_SG30: {
    symbol: 'FH_SG30',
    name: 'Straits Times Singapore 30 CFD',
    category: 'indices',
    provider: 'Finnhub/OANDA',
    pricePrecision: 1,
    volumePrecision: 2,
    minMove: 0.1,
    country: 'SG',
    description: 'Singapore Exchange Straits Times Benchmark',
    isPopular: false
  },
  FH_NL25: {
    symbol: 'FH_NL25',
    name: 'AEX 25 Netherlands Index CFD',
    category: 'indices',
    provider: 'Finnhub/OANDA',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.05,
    country: 'NL',
    description: 'Euronext Amsterdam AEX 25 Benchmark',
    isPopular: false
  },

  // cTrader / MT5 Alternative Index Feeds
  US30: {
    symbol: 'US30',
    name: 'Dow Jones Wall St 30 Cash',
    category: 'indices',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.1,
    country: 'US',
    isPopular: true
  },
  US500: {
    symbol: 'US500',
    name: 'S&P 500 Index Cash',
    category: 'indices',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US',
    isPopular: true
  },
  USTEC: {
    symbol: 'USTEC',
    name: 'Nasdaq 100 Index Cash',
    category: 'indices',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US',
    isPopular: true
  },
  DE30: {
    symbol: 'DE30',
    name: 'Germany DAX 40 Cash',
    category: 'indices',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.1,
    country: 'DE',
    isPopular: true
  },
  UK100: {
    symbol: 'UK100',
    name: 'UK FTSE 100 Cash',
    category: 'indices',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.1,
    country: 'GB'
  },
  JP225: {
    symbol: 'JP225',
    name: 'Japan Nikkei 225 Cash',
    category: 'indices',
    provider: 'cTrader/MT5',
    pricePrecision: 1,
    volumePrecision: 2,
    minMove: 1.0,
    country: 'JP'
  },
  AUS200: {
    symbol: 'AUS200',
    name: 'Australia S&P/ASX 200 Cash',
    category: 'indices',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.1,
    country: 'AU'
  },
  HK50: {
    symbol: 'HK50',
    name: 'Hong Kong Hang Seng 50 Cash',
    category: 'indices',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.5,
    country: 'HK'
  },
  FR40: {
    symbol: 'FR40',
    name: 'France CAC 40 Cash',
    category: 'indices',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.1,
    country: 'FR'
  },
  STOXX50: {
    symbol: 'STOXX50',
    name: 'Euro Stoxx 50 Cash',
    category: 'indices',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.1,
    country: 'EU'
  },
  DXY: {
    symbol: 'DXY',
    name: 'US Dollar Currency Index',
    category: 'indices',
    provider: 'TVC',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.005,
    country: 'US',
    isPopular: true
  },
  VIX: {
    symbol: 'VIX',
    name: 'CBOE Volatility Index',
    category: 'indices',
    provider: 'CBOE',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US',
    isPopular: true
  },

  // =========================================================================
  // 2. METALS (Precious & Industrial Metals)
  // =========================================================================
  XAUUSD: {
    symbol: 'XAUUSD',
    name: 'Gold Spot / U.S. Dollar',
    category: 'metals',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    description: 'Spot Gold per Troy Ounce in USD',
    isPopular: true
  },
  XAGUSD: {
    symbol: 'XAGUSD',
    name: 'Silver Spot / U.S. Dollar',
    category: 'metals',
    provider: 'cTrader/MT5',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.001,
    description: 'Spot Silver per Troy Ounce in USD',
    isPopular: true
  },
  XPTUSD: {
    symbol: 'XPTUSD',
    name: 'Platinum Spot / U.S. Dollar',
    category: 'metals',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    description: 'Spot Platinum per Troy Ounce in USD'
  },
  XPDUSD: {
    symbol: 'XPDUSD',
    name: 'Palladium Spot / U.S. Dollar',
    category: 'metals',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    description: 'Spot Palladium per Troy Ounce in USD'
  },
  XCUUSD: {
    symbol: 'XCUUSD',
    name: 'Copper Spot / U.S. Dollar',
    category: 'metals',
    provider: 'cTrader/MT5',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.001,
    description: 'High Grade Copper Spot in USD'
  },
  XALUSD: {
    symbol: 'XALUSD',
    name: 'Aluminium Spot / U.S. Dollar',
    category: 'metals',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01
  },
  XNIUSD: {
    symbol: 'XNIUSD',
    name: 'Nickel Spot / U.S. Dollar',
    category: 'metals',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01
  },
  XPBUSD: {
    symbol: 'XPBUSD',
    name: 'Lead Spot / U.S. Dollar',
    category: 'metals',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01
  },
  XZNUSD: {
    symbol: 'XZNUSD',
    name: 'Zinc Spot / U.S. Dollar',
    category: 'metals',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01
  },
  XAUEUR: {
    symbol: 'XAUEUR',
    name: 'Gold Spot / Euro',
    category: 'metals',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01
  },
  XAUGBP: {
    symbol: 'XAUGBP',
    name: 'Gold Spot / British Pound',
    category: 'metals',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01
  },
  XAUAUD: {
    symbol: 'XAUAUD',
    name: 'Gold Spot / Australian Dollar',
    category: 'metals',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01
  },

  // =========================================================================
  // 3. COMMODITIES (Energies & Agriculture)
  // =========================================================================
  USOIL: {
    symbol: 'USOIL',
    name: 'Crude Oil WTI Cash Spot',
    category: 'commodities',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    description: 'West Texas Intermediate Light Sweet Crude',
    isPopular: true
  },
  UKOIL: {
    symbol: 'UKOIL',
    name: 'Brent Crude Oil Cash Spot',
    category: 'commodities',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    description: 'Brent North Sea Crude Oil Cash Spot',
    isPopular: true
  },
  XNGUSD: {
    symbol: 'XNGUSD',
    name: 'Natural Gas Spot / U.S. Dollar',
    category: 'commodities',
    provider: 'cTrader/MT5',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.001,
    description: 'Henry Hub Natural Gas Cash Spot',
    isPopular: true
  },
  WTI: {
    symbol: 'WTI',
    name: 'WTI Crude Oil',
    category: 'commodities',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01
  },
  BRENT: {
    symbol: 'BRENT',
    name: 'Brent Crude Oil',
    category: 'commodities',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01
  },

  // =========================================================================
  // 4. FOREX (Majors & Liquid Crosses)
  // =========================================================================
  EURUSD: {
    symbol: 'EURUSD',
    name: 'Euro / U.S. Dollar',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 5,
    volumePrecision: 2,
    minMove: 0.00001,
    isPopular: true
  },
  GBPUSD: {
    symbol: 'GBPUSD',
    name: 'British Pound / U.S. Dollar',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 5,
    volumePrecision: 2,
    minMove: 0.00001,
    isPopular: true
  },
  USDJPY: {
    symbol: 'USDJPY',
    name: 'U.S. Dollar / Japanese Yen',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.001,
    isPopular: true
  },
  AUDUSD: {
    symbol: 'AUDUSD',
    name: 'Australian Dollar / U.S. Dollar',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 5,
    volumePrecision: 2,
    minMove: 0.00001,
    isPopular: true
  },
  USDCAD: {
    symbol: 'USDCAD',
    name: 'U.S. Dollar / Canadian Dollar',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 5,
    volumePrecision: 2,
    minMove: 0.00001,
    isPopular: true
  },
  USDCHF: {
    symbol: 'USDCHF',
    name: 'U.S. Dollar / Swiss Franc',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 5,
    volumePrecision: 2,
    minMove: 0.00001,
    isPopular: true
  },
  NZDUSD: {
    symbol: 'NZDUSD',
    name: 'New Zealand Dollar / U.S. Dollar',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 5,
    volumePrecision: 2,
    minMove: 0.00001,
    isPopular: true
  },
  EURGBP: {
    symbol: 'EURGBP',
    name: 'Euro / British Pound',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 5,
    volumePrecision: 2,
    minMove: 0.00001
  },
  EURJPY: {
    symbol: 'EURJPY',
    name: 'Euro / Japanese Yen',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.001,
    isPopular: true
  },
  GBPJPY: {
    symbol: 'GBPJPY',
    name: 'British Pound / Japanese Yen',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.001,
    isPopular: true
  },
  AUDJPY: {
    symbol: 'AUDJPY',
    name: 'Australian Dollar / Japanese Yen',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.001
  },
  CADJPY: {
    symbol: 'CADJPY',
    name: 'Canadian Dollar / Japanese Yen',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.001
  },
  CHFJPY: {
    symbol: 'CHFJPY',
    name: 'Swiss Franc / Japanese Yen',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.001
  },
  NZDJPY: {
    symbol: 'NZDJPY',
    name: 'New Zealand Dollar / Japanese Yen',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.001
  },
  EURAUD: {
    symbol: 'EURAUD',
    name: 'Euro / Australian Dollar',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 5,
    volumePrecision: 2,
    minMove: 0.00001
  },
  EURCAD: {
    symbol: 'EURCAD',
    name: 'Euro / Canadian Dollar',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 5,
    volumePrecision: 2,
    minMove: 0.00001
  },
  EURCHF: {
    symbol: 'EURCHF',
    name: 'Euro / Swiss Franc',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 5,
    volumePrecision: 2,
    minMove: 0.00001
  },
  GBPAUD: {
    symbol: 'GBPAUD',
    name: 'British Pound / Australian Dollar',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 5,
    volumePrecision: 2,
    minMove: 0.00001
  },
  GBPCAD: {
    symbol: 'GBPCAD',
    name: 'British Pound / Canadian Dollar',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 5,
    volumePrecision: 2,
    minMove: 0.00001
  },
  AUDCAD: {
    symbol: 'AUDCAD',
    name: 'Australian Dollar / Canadian Dollar',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 5,
    volumePrecision: 2,
    minMove: 0.00001
  },
  AUDNZD: {
    symbol: 'AUDNZD',
    name: 'Australian Dollar / New Zealand Dollar',
    category: 'forex',
    provider: 'cTrader/MT5',
    pricePrecision: 5,
    volumePrecision: 2,
    minMove: 0.00001
  },

  // =========================================================================
  // 5. CRYPTO (Major L1s, L2s & Memes)
  // =========================================================================
  BTCUSD: {
    symbol: 'BTCUSD',
    name: 'Bitcoin / U.S. Dollar',
    category: 'crypto',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 4,
    minMove: 0.01,
    isPopular: true
  },
  ETHUSD: {
    symbol: 'ETHUSD',
    name: 'Ethereum / U.S. Dollar',
    category: 'crypto',
    provider: 'cTrader/MT5',
    pricePrecision: 2,
    volumePrecision: 4,
    minMove: 0.01,
    isPopular: true
  },
  BTCUSDT: {
    symbol: 'BTCUSDT',
    name: 'Bitcoin / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 2,
    volumePrecision: 4,
    minMove: 0.01,
    isPopular: true
  },
  ETHUSDT: {
    symbol: 'ETHUSDT',
    name: 'Ethereum / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 2,
    volumePrecision: 4,
    minMove: 0.01,
    isPopular: true
  },
  SOLUSDT: {
    symbol: 'SOLUSDT',
    name: 'Solana / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 2,
    volumePrecision: 3,
    minMove: 0.01,
    isPopular: true
  },
  BNBUSDT: {
    symbol: 'BNBUSDT',
    name: 'BNB / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 2,
    volumePrecision: 3,
    minMove: 0.01,
    isPopular: true
  },
  XRPUSDT: {
    symbol: 'XRPUSDT',
    name: 'Ripple / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 4,
    volumePrecision: 2,
    minMove: 0.0001,
    isPopular: true
  },
  DOGEUSDT: {
    symbol: 'DOGEUSDT',
    name: 'Dogecoin / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 5,
    volumePrecision: 1,
    minMove: 0.00001,
    isPopular: true
  },
  ADAUSDT: {
    symbol: 'ADAUSDT',
    name: 'Cardano / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 4,
    volumePrecision: 2,
    minMove: 0.0001
  },
  AVAXUSDT: {
    symbol: 'AVAXUSDT',
    name: 'Avalanche / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 2,
    volumePrecision: 3,
    minMove: 0.01
  },
  LINKUSDT: {
    symbol: 'LINKUSDT',
    name: 'Chainlink / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.001
  },
  SUIUSDT: {
    symbol: 'SUIUSDT',
    name: 'Sui Network / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 4,
    volumePrecision: 2,
    minMove: 0.0001
  },
  NEARUSDT: {
    symbol: 'NEARUSDT',
    name: 'NEAR Protocol / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.001
  },
  APTUSDT: {
    symbol: 'APTUSDT',
    name: 'Aptos / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.001
  },
  PEPEUSDT: {
    symbol: 'PEPEUSDT',
    name: 'Pepe / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 8,
    volumePrecision: 0,
    minMove: 0.00000001
  },
  DOTUSDT: {
    symbol: 'DOTUSDT',
    name: 'Polkadot / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 3,
    volumePrecision: 2,
    minMove: 0.001
  },
  LTCUSDT: {
    symbol: 'LTCUSDT',
    name: 'Litecoin / TetherUS',
    category: 'crypto',
    provider: 'Binance',
    pricePrecision: 2,
    volumePrecision: 3,
    minMove: 0.01
  },

  // =========================================================================
  // 6. STOCKS (US Mega Caps & Top Indonesian Equities)
  // =========================================================================
  AAPL: {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    category: 'stocks',
    provider: 'NASDAQ',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US',
    isPopular: true
  },
  MSFT: {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    category: 'stocks',
    provider: 'NASDAQ',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US',
    isPopular: true
  },
  NVDA: {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    category: 'stocks',
    provider: 'NASDAQ',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US',
    isPopular: true
  },
  GOOGL: {
    symbol: 'GOOGL',
    name: 'Alphabet Inc. (Google)',
    category: 'stocks',
    provider: 'NASDAQ',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US',
    isPopular: true
  },
  AMZN: {
    symbol: 'AMZN',
    name: 'Amazon.com Inc.',
    category: 'stocks',
    provider: 'NASDAQ',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US',
    isPopular: true
  },
  META: {
    symbol: 'META',
    name: 'Meta Platforms Inc.',
    category: 'stocks',
    provider: 'NASDAQ',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US',
    isPopular: true
  },
  TSLA: {
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    category: 'stocks',
    provider: 'NASDAQ',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US',
    isPopular: true
  },
  AVGO: {
    symbol: 'AVGO',
    name: 'Broadcom Inc.',
    category: 'stocks',
    provider: 'NASDAQ',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US'
  },
  BRKB: {
    symbol: 'BRKB',
    name: 'Berkshire Hathaway Inc.',
    category: 'stocks',
    provider: 'NYSE',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US'
  },
  JPM: {
    symbol: 'JPM',
    name: 'JPMorgan Chase & Co.',
    category: 'stocks',
    provider: 'NYSE',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US'
  },
  V: {
    symbol: 'V',
    name: 'Visa Inc.',
    category: 'stocks',
    provider: 'NYSE',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US'
  },
  LLY: {
    symbol: 'LLY',
    name: 'Eli Lilly and Company',
    category: 'stocks',
    provider: 'NYSE',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US'
  },
  WMT: {
    symbol: 'WMT',
    name: 'Walmart Inc.',
    category: 'stocks',
    provider: 'NYSE',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US'
  },
  UNH: {
    symbol: 'UNH',
    name: 'UnitedHealth Group Inc.',
    category: 'stocks',
    provider: 'NYSE',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US'
  },
  COST: {
    symbol: 'COST',
    name: 'Costco Wholesale Corp.',
    category: 'stocks',
    provider: 'NASDAQ',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US'
  },
  AMD: {
    symbol: 'AMD',
    name: 'Advanced Micro Devices Inc.',
    category: 'stocks',
    provider: 'NASDAQ',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US'
  },
  NFLX: {
    symbol: 'NFLX',
    name: 'Netflix Inc.',
    category: 'stocks',
    provider: 'NASDAQ',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'US'
  },
  BABA: {
    symbol: 'BABA',
    name: 'Alibaba Group Holding Ltd.',
    category: 'stocks',
    provider: 'NYSE',
    pricePrecision: 2,
    volumePrecision: 2,
    minMove: 0.01,
    country: 'CN'
  },

  // Indonesian Blue Chips (IDX)
  BBCA: {
    symbol: 'BBCA',
    name: 'Bank Central Asia Tbk',
    category: 'stocks',
    provider: 'IDX',
    pricePrecision: 0,
    volumePrecision: 2,
    minMove: 25,
    country: 'ID',
    isPopular: true
  },
  BBRI: {
    symbol: 'BBRI',
    name: 'Bank Rakyat Indonesia Tbk',
    category: 'stocks',
    provider: 'IDX',
    pricePrecision: 0,
    volumePrecision: 2,
    minMove: 10,
    country: 'ID',
    isPopular: true
  },
  BMRI: {
    symbol: 'BMRI',
    name: 'Bank Mandiri (Persero) Tbk',
    category: 'stocks',
    provider: 'IDX',
    pricePrecision: 0,
    volumePrecision: 2,
    minMove: 25,
    country: 'ID',
    isPopular: true
  },
  BBNI: {
    symbol: 'BBNI',
    name: 'Bank Negara Indonesia Tbk',
    category: 'stocks',
    provider: 'IDX',
    pricePrecision: 0,
    volumePrecision: 2,
    minMove: 25,
    country: 'ID'
  },
  TLKM: {
    symbol: 'TLKM',
    name: 'Telkom Indonesia (Persero) Tbk',
    category: 'stocks',
    provider: 'IDX',
    pricePrecision: 0,
    volumePrecision: 2,
    minMove: 10,
    country: 'ID',
    isPopular: true
  },
  ASII: {
    symbol: 'ASII',
    name: 'Astra International Tbk',
    category: 'stocks',
    provider: 'IDX',
    pricePrecision: 0,
    volumePrecision: 2,
    minMove: 25,
    country: 'ID'
  },
  ADRO: {
    symbol: 'ADRO',
    name: 'Adaro Energy Indonesia Tbk',
    category: 'stocks',
    provider: 'IDX',
    pricePrecision: 0,
    volumePrecision: 2,
    minMove: 10,
    country: 'ID'
  },
  ANTM: {
    symbol: 'ANTM',
    name: 'Aneka Tambang Tbk',
    category: 'stocks',
    provider: 'IDX',
    pricePrecision: 0,
    volumePrecision: 2,
    minMove: 10,
    country: 'ID'
  }
}

/**
 * Returns clean metadata for a known symbol, if registered.
 */
export function getKnownInstrument(symbol: string): InstrumentMetadata | undefined {
  if (!symbol) return undefined
  const clean = symbol.trim().toUpperCase()
  return KNOWN_INSTRUMENTS[clean]
}

/**
 * Converts the static instrument catalog into SymbolInfo records ready for stores & discovery.
 */
export function getAllKnownInstruments(): SymbolInfo[] {
  return Object.values(KNOWN_INSTRUMENTS).map((meta) => ({
    symbol: meta.symbol,
    name: meta.name,
    category: meta.category,
    exchange: meta.provider,
    providerSymbol: meta.symbol,
    capabilities: capabilitiesForSymbol(meta.symbol, meta.category),
    pricePrecision: meta.pricePrecision,
    volumePrecision: meta.volumePrecision,
    minMove: meta.minMove
  }))
}
