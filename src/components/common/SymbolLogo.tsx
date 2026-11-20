import React, { useState } from 'react'
import { LOCAL_SYMBOL_ICONS } from './local-symbol-icons'

export interface SymbolLogoProps {
  symbol?: string | null
  size?: number
  style?: React.CSSProperties
  className?: string
  forceFallback?: boolean
  preferLocal?: boolean
}

const FIAT_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD',
  'CNY', 'CNH', 'HKD', 'SGD', 'SEK', 'NOK', 'DKK', 'ZAR',
  'TRY', 'MXN', 'INR', 'BRL', 'KRW', 'PLN', 'THB', 'IDR',
  'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'AED', 'SAR', 'MYR'
])

const CURRENCY_COUNTRY_MAP: Record<string, { country: string; symbol: string }> = {
  USD: { country: 'us', symbol: '$' },
  EUR: { country: 'eu', symbol: '€' },
  GBP: { country: 'gb', symbol: '£' },
  JPY: { country: 'jp', symbol: '¥' },
  AUD: { country: 'au', symbol: 'A$' },
  CAD: { country: 'ca', symbol: 'C$' },
  CHF: { country: 'ch', symbol: 'Fr' },
  NZD: { country: 'nz', symbol: 'NZ$' },
  CNY: { country: 'cn', symbol: '¥' },
  CNH: { country: 'cn', symbol: '¥' },
  HKD: { country: 'hk', symbol: 'HK$' },
  SGD: { country: 'sg', symbol: 'S$' },
  SEK: { country: 'se', symbol: 'kr' },
  NOK: { country: 'no', symbol: 'kr' },
  DKK: { country: 'dk', symbol: 'kr' },
  ZAR: { country: 'za', symbol: 'R' },
  TRY: { country: 'tr', symbol: '₺' },
  MXN: { country: 'mx', symbol: '$' },
  INR: { country: 'in', symbol: '₹' },
  BRL: { country: 'br', symbol: 'R$' },
  KRW: { country: 'kr', symbol: '₩' },
  PLN: { country: 'pl', symbol: 'zł' }
}

// ponytail: dual-currency forex resolver uses lipis flag SVGs; add composite dual-flag canvas renderer if offline SVG flag packaging is required.
export function parseForexPair(symbol: string): { base: string; quote: string } | null {
  if (!symbol || typeof symbol !== 'string') return null
  let s = symbol.trim().toUpperCase()
  if (s.includes(':')) {
    s = s.split(':').pop() || s
  }

  if (s.includes('/') || s.includes('-') || s.includes('_')) {
    const parts = s.split(/[/\\-_]/)
    if (parts.length >= 2 && FIAT_CURRENCIES.has(parts[0]) && FIAT_CURRENCIES.has(parts[1])) {
      return { base: parts[0], quote: parts[1] }
    }
  }

  if (s.length === 6) {
    const b = s.slice(0, 3)
    const q = s.slice(3, 6)
    if (FIAT_CURRENCIES.has(b) && FIAT_CURRENCIES.has(q)) {
      return { base: b, quote: q }
    }
  }

  return null
}

export function resolveSymbolTokens(rawSymbol: string): { coin: string; cleanSym: string } {
  if (!rawSymbol || typeof rawSymbol !== 'string') {
    return { coin: '', cleanSym: '' }
  }

  let s = rawSymbol.trim().toUpperCase()
  if (s.startsWith('FH_')) {
    s = s.slice(3)
  }
  if (s.includes(':')) {
    s = s.split(':').pop() || s
  }

  // 1. For word-format names with spaces, check alias mapping (e.g. 'TESLA MOTORS' -> TSLA, 'US 500' -> US500)
  if (s.includes(' ') && LOCAL_ALIAS_MAP[s]) {
    const alias = LOCAL_ALIAS_MAP[s]
    return {
      coin: alias.toLowerCase(),
      cleanSym: alias
    }
  }

  const fx = parseForexPair(s)
  if (fx) {
    return {
      coin: `${fx.base.toLowerCase()}${fx.quote.toLowerCase()}`,
      cleanSym: `${fx.base}${fx.quote}`
    }
  }

  if (s.includes('/') || s.includes('-') || s.includes('_')) {
    const parts = s.split(/[/\\-_]/)
    const base = parts[0] || s
    return {
      coin: base.toLowerCase(),
      cleanSym: base
    }
  }

  // 3. Known commodity & metal prefixes (e.g. XAUUSD, XAU, XAUU, XAGUSD, XPT, XPD)
  // Maps directly to base metal asset icon (e.g. nvstly forex_icons/XAU.png)
  if (s.startsWith('XAU')) return { coin: 'xau', cleanSym: 'XAU' }
  if (s.startsWith('XAG')) return { coin: 'xag', cleanSym: 'XAG' }
  if (s.startsWith('XPT')) return { coin: 'xpt', cleanSym: 'XPT' }
  if (s.startsWith('XPD')) return { coin: 'xpd', cleanSym: 'XPD' }
  if (s.startsWith('XAL')) return { coin: 'xal', cleanSym: 'XAL' }
  if (s.startsWith('XCU')) return { coin: 'xcu', cleanSym: 'XCU' }
  if (s.startsWith('XNI')) return { coin: 'xni', cleanSym: 'XNI' }
  if (s.startsWith('XPB')) return { coin: 'xpb', cleanSym: 'XPB' }
  if (s.startsWith('XZN')) return { coin: 'xzn', cleanSym: 'XZN' }
  if (s.startsWith('XNG')) return { coin: 'xng', cleanSym: 'XNGUSD' }
  if (s.startsWith('XBR')) return { coin: 'brent', cleanSym: 'BRENT' }
  if (s.startsWith('XTI')) return { coin: 'wti', cleanSym: 'WTI' }

  // 4. Quote currencies stripping: USDT, USDC, BUSD, PERP, USD, EUR, etc.
  const quoteSuffixes = [
    'USDT', 'USDC', 'BUSD', 'PERP', 'USD', 'EUR',
    'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'SGD', 'TRY'
  ]
  for (const suffix of quoteSuffixes) {
    if (s.length > suffix.length && s.endsWith(suffix)) {
      const candidateBase = s.slice(0, -suffix.length)
      if (candidateBase.length >= 2) {
        return {
          coin: candidateBase.toLowerCase(),
          cleanSym: candidateBase
        }
      }
    }
  }

  return {
    coin: s.toLowerCase(),
    cleanSym: s
  }
}

const R2_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_R2_CDN_URL) || ''
const CACHE_STORAGE_KEY = 'pia_symbol_logos_cache'

function loadPersistedLogoCache(): Map<string, string> {
  const cache = new Map<string, string>()
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CACHE_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'string') cache.set(k, v)
          }
        }
      }
    }
  } catch {
    // fallback clean
  }
  return cache
}

export const LOGO_SUCCESS_CACHE = loadPersistedLogoCache()
export const LOGO_FAILED_SET = new Set<string>()

function persistLogoCache(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const obj: Record<string, string> = {}
      for (const [k, v] of LOGO_SUCCESS_CACHE.entries()) {
        obj[k] = v
      }
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj))
    }
  } catch {
    // quota safe
  }
}

function isLikelyCryptoSymbol(raw: string, clean: string): boolean {
  const r = raw.toUpperCase()
  const c = clean.toUpperCase()
  if (
    r.endsWith('USDT') ||
    r.endsWith('USDC') ||
    r.endsWith('BUSD') ||
    r.endsWith('PERP') ||
    r.includes('/USD') ||
    r.includes('-USD')
  ) {
    return true
  }
  return [
    'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'BNB', 'AVAX', 'DOT',
    'LINK', 'NEAR', 'SUI', 'APT', 'MATIC', 'SHIB', 'TRX', 'UNI', 'LTC'
  ].includes(c)
}

const SYMBOL_ALIASES: Record<string, string[]> = {
  XAU: ['GOLD', 'XAUT'],
  GOLD: ['XAU', 'XAUT'],
  XAG: ['SILVER', 'SLV'],
  SILVER: ['XAG', 'SLV'],
  WTI: ['OIL', 'USO'],
  BRENT: ['OIL', 'BNO'],
  OIL: ['WTI', 'USO'],
  SPX: ['SPY', 'US500'],
  SPX500: ['SPX', 'SPY', 'US500'],
  NDX: ['QQQ', 'USTEC'],
  NAS100: ['NDX', 'QQQ', 'USTEC'],
  DJI: ['DIA', 'US30'],
  US30: ['DJI', 'DIA'],
  RUT: ['IWM', 'US2000'],
  US2000: ['RUT', 'IWM'],
  JP225: ['NIKKEI', 'N225'],
  AU200: ['AUS200', 'ASX200'],
  UK100: ['FTSE'],
  DE30: ['DAX', 'GDAXI'],
  FR40: ['CAC40'],
  EU50: ['STOXX50', 'SX5E'],
  HK33: ['HK50', 'HSI'],
  CN50: ['A50'],
  SG30: ['STI'],
  NL25: ['AEX']
}

export const LOCAL_ALIAS_MAP: Record<string, string> = {
  FH_SPX500: 'US500',
  SPX500: 'US500',
  FH_NAS100: 'USTEC',
  NAS100: 'USTEC',
  FH_US30: 'US30',
  FH_US2000: 'RUT',
  US2000: 'RUT',
  FH_JP225: 'JP225',
  FH_AU200: 'AUS200',
  AU200: 'AUS200',
  FH_UK100: 'UK100',
  FH_DE30: 'DE30',
  FH_FR40: 'FR40',
  FH_EU50: 'STOXX50',
  EU50: 'STOXX50',
  FH_HK33: 'HK50',
  HK33: 'HK50',
  FH_CN50: 'CN50',
  FH_SG30: 'STI',
  SG30: 'STI',
  FH_NL25: 'NL25',
  SPX: 'SPX',
  NDX: 'USTEC',
  DJI: 'DJI',

  // cTrader word-form indices & benchmarks
  'AUSTRALIA 200': 'AUS200',
  'EUROPE 50': 'STOXX50',
  'FRANCE 40': 'FR40',
  'GERMANY 40': 'DE30',
  'HONG KONG 50': 'HK50',
  'JAPAN 225': 'JP225',
  'NETHERLANDS 25': 'NL25',
  'UK 100': 'UK100',
  'US 30': 'US30',
  'US 500': 'US500',
  'US TECH 100': 'USTEC',
  'CORE S&P 500': 'US500',
  'S&P 500 LOW VOLATILITY': 'US500',

  // Commodities
  XBRUSD: 'BRENT',
  XTIUSD: 'WTI',
  'NAT.GAS': 'XNGUSD',
  NATGAS: 'XNGUSD',

  // Equities & Corporate CFDs with local icons
  'TESLA MOTORS': 'TSLA',
  APPLE: 'AAPL',
  MICROSOFT: 'MSFT',
  AMAZON: 'AMZN',
  ALPHABET: 'GOOGL',
  GOOGLE: 'GOOGL',
  NVIDIA: 'NVDA',
  'WALT DISNEY': 'DIS',
  BOEING: 'BA',
  'GOLDMAN SACHS': 'GS',
  'FORD MOTOR': 'F',
  'HOME DEPOT': 'HD',
  'BANK OF AMERICA': 'BAC',
  'WELLS FARGO': 'WFC',
  INTEL: 'INTC',
  CISCO: 'CSCO',
  ORACLE: 'ORCL',
  WALMART: 'WMT',
  VISA: 'V',
  MASTERCARD: 'MA',
  'AMERICAN EXPRESS': 'AXP',
  CITIGROUP: 'C',
  'MC DONALDS': 'MCD',
  NIKE: 'NKE',
  STARBUCKS: 'SBUX',
  'COCA-COLA': 'KO',
  PEPSICO: 'PEP'
}

export const INDEX_FLAG_MAP: Record<string, string> = {
  FH_CN50: 'cn',
  CN50: 'cn',
  FH_NL25: 'nl',
  NL25: 'nl',
  'NETHERLANDS 25': 'nl',
  FH_JP225: 'jp',
  JP225: 'jp',
  'JAPAN 225': 'jp',
  FH_AU200: 'au',
  AU200: 'au',
  'AUSTRALIA 200': 'au',
  FH_UK100: 'gb',
  UK100: 'gb',
  'UK 100': 'gb',
  FH_DE30: 'de',
  DE30: 'de',
  'GERMANY 40': 'de',
  FH_FR40: 'fr',
  FR40: 'fr',
  'FRANCE 40': 'fr',
  FH_EU50: 'eu',
  EU50: 'eu',
  'EUROPE 50': 'eu',
  FH_HK33: 'hk',
  HK33: 'hk',
  'HONG KONG 50': 'hk',
  FH_SG30: 'sg',
  SG30: 'sg',
  'ITALY 40': 'it',
  'SPAIN 35': 'es',
  'SWITZERLAND 20': 'ch',
  'LATIN AMERICA 40': 'br',
  'CHINA LARGE-CAP': 'cn'
}

// ponytail: multi-tier CDN candidates support optional Cloudflare R2 URL via VITE_R2_CDN_URL; falls back to category-optimized jsdelivr CDN with zero waterfall delay.
export function getSymbolLogoCandidates(symbol: string): string[] {
  if (!symbol || typeof symbol !== 'string') return []
  const { coin, cleanSym } = resolveSymbolTokens(symbol)
  if (!coin || !cleanSym) return []

  const urls: string[] = []

  // 1. Cloudflare R2 / Custom CDN prefix if configured
  if (R2_BASE) {
    const cleanBase = R2_BASE.replace(/\/$/, '')
    urls.push(`${cleanBase}/${cleanSym}.png`, `${cleanBase}/${coin}.svg`)
  }

  // 2. Metals & Commodities (XAU, XAG, GOLD, SILVER) -> forex_icons first
  if (cleanSym === 'XAU' || cleanSym.startsWith('XAU')) {
    urls.push(
      'https://cdn.jsdelivr.net/gh/nvstly/icons@main/forex_icons/XAU.png',
      'https://cdn.jsdelivr.net/gh/nvstly/icons@main/ticker_icons/GOLD.png',
      'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/gold.svg'
    )
  } else if (cleanSym === 'XAG' || cleanSym.startsWith('XAG')) {
    urls.push(
      'https://cdn.jsdelivr.net/gh/nvstly/icons@main/forex_icons/XAG.png',
      'https://cdn.jsdelivr.net/gh/nvstly/icons@main/ticker_icons/SILVER.png',
      'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/slv.svg'
    )
  } else if (isLikelyCryptoSymbol(symbol, cleanSym)) {
    // 3. Crypto -> spothq SVG first, then nvstly crypto_icons, then ticker_icons
    urls.push(
      `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${coin}.svg`,
      `https://cdn.jsdelivr.net/gh/nvstly/icons@main/crypto_icons/${cleanSym}.png`,
      `https://cdn.jsdelivr.net/gh/nvstly/icons@main/ticker_icons/${cleanSym}.png`,
      `https://cdn.jsdelivr.net/gh/ahmeterenodaci/Nasdaq-Stock-Exchange-including-Symbols-and-Logos@main/logos/${cleanSym}.png`
    )
  } else {
    // 4. Stocks / Indices / Equities -> nvstly ticker_icons & Nasdaq stock logos first!
    urls.push(
      `https://cdn.jsdelivr.net/gh/nvstly/icons@main/ticker_icons/${cleanSym}.png`,
      `https://cdn.jsdelivr.net/gh/ahmeterenodaci/Nasdaq-Stock-Exchange-including-Symbols-and-Logos@main/logos/${cleanSym}.png`,
      `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${coin}.svg`
    )
  }

  // Aliases (e.g. WTI -> OIL, SPX -> SPY)
  const aliases = SYMBOL_ALIASES[cleanSym] || []
  for (const a of aliases) {
    urls.push(
      `https://cdn.jsdelivr.net/gh/nvstly/icons@main/ticker_icons/${a}.png`,
      `https://cdn.jsdelivr.net/gh/nvstly/icons@main/forex_icons/${a}.png`,
      `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${a.toLowerCase()}.svg`
    )
  }

  return Array.from(new Set(urls))
}

function getDeterministicCategoryColor(symbol: string): { bg: string; text: string } {
  const s = symbol.toUpperCase().trim()

  if (
    s.endsWith('USDT') ||
    s.endsWith('USDC') ||
    s.endsWith('BUSD') ||
    s.endsWith('PERP') ||
    ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'BNB', 'AVAX', 'DOT', 'LINK'].some((c) => s.includes(c))
  ) {
    return { bg: '#f7931a', text: '#ffffff' }
  }

  if (s.startsWith('XAU') || s.startsWith('XAG') || s.includes('GOLD') || s.includes('SILVER')) {
    return { bg: '#d97706', text: '#ffffff' }
  }

  if (s.includes('OIL') || s.includes('GAS') || ['WTI', 'BRENT', 'COPPER'].includes(s)) {
    return { bg: '#ea580c', text: '#ffffff' }
  }

  if (
    ['SPX', 'NDX', 'DJI', 'DAX', 'DXY', 'VIX', 'RUT'].includes(s) ||
    s.startsWith('FH_') ||
    s.includes('500') ||
    s.includes('100') ||
    s.includes('2000')
  ) {
    return { bg: '#6366f1', text: '#ffffff' }
  }

  if (parseForexPair(s)) {
    return { bg: '#2962ff', text: '#ffffff' }
  }

  const hues = [
    '#089981', '#2962ff', '#7c3aed', '#0284c7',
    '#059669', '#d97706', '#ec4899', '#f23645'
  ]
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i)
    hash |= 0
  }
  const color = hues[Math.abs(hash) % hues.length]
  return { bg: color, text: '#ffffff' }
}

export const SymbolLogo: React.FC<SymbolLogoProps> = ({
  symbol,
  size = 20,
  style,
  className,
  forceFallback = false,
  preferLocal = true
}) => {
  const normSym = (symbol || '').trim().toUpperCase()
  const cachedUrl = LOGO_SUCCESS_CACHE.get(normSym)

  const [prevSymbol, setPrevSymbol] = useState(symbol)
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [isExhausted, setIsExhausted] = useState(() => !forceFallback && LOGO_FAILED_SET.has(normSym))
  const [baseFlagError, setBaseFlagError] = useState(false)
  const [quoteFlagError, setQuoteFlagError] = useState(false)
  const [localFailed, setLocalFailed] = useState(false)

  if (prevSymbol !== symbol) {
    setPrevSymbol(symbol)
    setLocalFailed(false)
    setCandidateIndex(0)
    setIsExhausted(LOGO_FAILED_SET.has(normSym))
    setBaseFlagError(false)
    setQuoteFlagError(false)
  }

  if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
    return (
      <div
        data-testid="symbol-logo-empty"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: '#2a2e39',
          display: 'inline-block',
          flexShrink: 0,
          ...style
        }}
        className={className}
      />
    )
  }

  // 1. Instant local symbol icon resolution from pre-bundled assets
  const localTarget = LOCAL_SYMBOL_ICONS.has(normSym)
    ? normSym
    : LOCAL_ALIAS_MAP[normSym] && LOCAL_SYMBOL_ICONS.has(LOCAL_ALIAS_MAP[normSym])
      ? LOCAL_ALIAS_MAP[normSym]
      : null

  if (preferLocal && !localFailed && !forceFallback && localTarget) {
    return (
      <img
        src={`/symbol-icons/${localTarget}.png`}
        alt={symbol}
        loading="lazy"
        decoding="async"
        onError={() => setLocalFailed(true)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'contain',
          display: 'inline-block',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          flexShrink: 0,
          boxSizing: 'border-box',
          verticalAlign: 'middle',
          ...style
        }}
        className={className}
        data-testid="symbol-logo-image"
      />
    )
  }

  // Forex dual-flag rendering
  const forex = parseForexPair(symbol)
  if (forex) {
    const subSize = Math.max(10, Math.round(size * 0.7))
    const baseMeta = CURRENCY_COUNTRY_MAP[forex.base]
    const quoteMeta = CURRENCY_COUNTRY_MAP[forex.quote]
    const baseCountry = baseMeta?.country || forex.base.slice(0, 2).toLowerCase()
    const quoteCountry = quoteMeta?.country || forex.quote.slice(0, 2).toLowerCase()

    return (
      <div
        data-testid="symbol-logo-dual"
        style={{
          position: 'relative',
          width: size,
          height: size,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
          ...style
        }}
        className={className}
        title={symbol}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: subSize,
            height: subSize,
            borderRadius: '50%',
            overflow: 'hidden',
            zIndex: 2,
            border: '1.5px solid rgba(30, 34, 45, 0.9)',
            backgroundColor: '#2a2e39',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.max(7, Math.round(subSize * 0.45)),
            fontWeight: 700,
            color: '#ffffff',
            boxSizing: 'border-box'
          }}
        >
          {!baseFlagError ? (
            <img
              src={`https://cdn.jsdelivr.net/gh/lipis/flag-icons@main/flags/4x3/${baseCountry}.svg`}
              alt={forex.base}
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              onError={() => setBaseFlagError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <span>{baseMeta?.symbol || forex.base.slice(0, 2)}</span>
          )}
        </div>

        <div
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: subSize,
            height: subSize,
            borderRadius: '50%',
            overflow: 'hidden',
            zIndex: 1,
            border: '1px solid rgba(0, 0, 0, 0.3)',
            backgroundColor: '#2a2e39',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.max(7, Math.round(subSize * 0.45)),
            fontWeight: 700,
            color: '#ffffff',
            boxSizing: 'border-box'
          }}
        >
          {!quoteFlagError ? (
            <img
              src={`https://cdn.jsdelivr.net/gh/lipis/flag-icons@main/flags/4x3/${quoteCountry}.svg`}
              alt={forex.quote}
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              onError={() => setQuoteFlagError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <span>{quoteMeta?.symbol || forex.quote.slice(0, 2)}</span>
          )}
        </div>
      </div>
    )
  }

  const candidates = getSymbolLogoCandidates(symbol)
  const { cleanSym } = resolveSymbolTokens(symbol)

  if (forceFallback || isExhausted || candidates.length === 0) {
    if (!forceFallback && INDEX_FLAG_MAP[normSym]) {
      const flagCountry = INDEX_FLAG_MAP[normSym]
      return (
        <img
          src={`https://cdn.jsdelivr.net/gh/lipis/flag-icons@main/flags/4x3/${flagCountry}.svg`}
          alt={symbol}
          crossOrigin="anonymous"
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'inline-block',
            flexShrink: 0,
            ...style
          }}
          className={className}
          title={symbol}
          data-testid="symbol-logo-flag"
        />
      )
    }

    const color = getDeterministicCategoryColor(symbol)
    const initials = cleanSym ? cleanSym.slice(0, Math.min(cleanSym.length, 2)) : '?'

    return (
      <div
        data-testid="symbol-logo-fallback"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: color.bg,
          color: color.text,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.max(8, Math.round(size * 0.45)),
          fontWeight: 700,
          letterSpacing: '-0.2px',
          lineHeight: 1,
          flexShrink: 0,
          userSelect: 'none',
          boxSizing: 'border-box',
          textTransform: 'uppercase',
          ...style
        }}
        className={className}
        title={symbol}
      >
        {initials}
      </div>
    )
  }

  const currentCandidateUrl = cachedUrl || candidates[candidateIndex]

  return (
    <img
      src={currentCandidateUrl}
      alt={symbol}
      loading="lazy"
      decoding="async"
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      onLoad={() => {
        if (normSym && currentCandidateUrl) {
          LOGO_SUCCESS_CACHE.set(normSym, currentCandidateUrl)
          persistLogoCache()
        }
      }}
      onError={() => {
        if (cachedUrl) {
          LOGO_SUCCESS_CACHE.delete(normSym)
          persistLogoCache()
        }
        if (candidateIndex < candidates.length - 1) {
          setCandidateIndex((i) => i + 1)
        } else {
          setIsExhausted(true)
          if (normSym) LOGO_FAILED_SET.add(normSym)
        }
      }}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'contain',
        display: 'inline-block',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        flexShrink: 0,
        boxSizing: 'border-box',
        verticalAlign: 'middle',
        ...style
      }}
      className={className}
      data-testid="symbol-logo-image"
    />
  )
}
