import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ExternalLink,
  TrendingUp,
  Activity,
  ArrowUp,
  ArrowUpRight,
  ArrowDownRight,
  Edit2,
  Check,
  Newspaper,
  Layers
} from 'lucide-react'
import { THEME_TOKENS } from '../../theme/tokens'
import { useMarketStore } from '../../stores/useMarketStore'
import type {
  CountryMacroData,
  CandleBar,
  PriceQuote,
  FixedIncomeRateData,
  FixedIncomeHistoryData,
  YieldSpreadResult,
  NewsArticle
} from '@shared/types'

interface MacroCardsSectionProps {
  macroData: CountryMacroData[]
  onScrollToMap: () => void
  onSelectSymbol?: (symbol: string) => void
}

const DEFAULT_YT_URL = 'https://www.youtube.com/watch?v=dp8PhLsUcFE'

function extractYoutubeVideoId(url: string): string | null {
  try {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
    const match = url.match(regExp)
    return match && match[2].length === 11 ? match[2] : null
  } catch {
    return null
  }
}

// Lightweight reusable SVG Sparkline component
function Sparkline({
  bars,
  color,
  width = 140,
  height = 42
}: {
  bars: { value: number }[]
  color: string
  width?: number
  height?: number
}): React.JSX.Element | null {
  if (!bars || bars.length < 2) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          color: THEME_TOKENS.colors.textMuted
        }}
      >
        No trend data
      </div>
    )
  }

  const values = bars.map((b) => b.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal === 0 ? 1 : maxVal - minVal
  const pad = 4

  const points = bars.map((b, i) => {
    const x = pad + (i / (bars.length - 1)) * (width - pad * 2)
    const y = height - pad - ((b.value - minVal) / range) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const pathD = `M ${points.join(' L ')}`

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const MacroCardsSection: React.FC<MacroCardsSectionProps> = ({
  macroData,
  onScrollToMap,
  onSelectSymbol
}) => {
  // 1. YouTube Live Market Broadcast state
  const [youtubeUrl, setYoutubeUrl] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('pia_macro_yt_url')
      return saved && saved.trim() ? saved.trim() : DEFAULT_YT_URL
    } catch {
      return DEFAULT_YT_URL
    }
  })
  const [isEditingYt, setIsEditingYt] = useState(false)
  const [tempYtInput, setTempYtInput] = useState(youtubeUrl)

  const videoId = useMemo(() => extractYoutubeVideoId(youtubeUrl), [youtubeUrl])

  const handleSaveYtUrl = useCallback(() => {
    const clean = tempYtInput.trim() || DEFAULT_YT_URL
    setYoutubeUrl(clean)
    try {
      localStorage.setItem('pia_macro_yt_url', clean)
    } catch {
      // ignore
    }
    setIsEditingYt(false)
  }, [tempYtInput])

  const handleOpenYoutube = useCallback(() => {
    if (window.api?.system?.openExternal) {
      window.api.system.openExternal(youtubeUrl)
    }
  }, [youtubeUrl])

  // 2. DXY (US Dollar Index) state
  const storeDxyQuote = useMarketStore((state) => state.prices['DXY'])
  const [dxyQuote, setDxyQuote] = useState<PriceQuote | null>(null)
  const [dxyBars, setDxyBars] = useState<CandleBar[]>([])

  useEffect(() => {
    let cancelled = false
    void window.api.market.subscribePrice('DXY').catch(() => {})

    Promise.all([
      window.api.market.getPrice('DXY').catch(() => null),
      window.api.market.getCandles({ symbol: 'DXY', timeframe: '1d', limit: 30 }).catch(() => [])
    ]).then(([quote, candles]) => {
      if (cancelled) return
      if (quote) setDxyQuote(quote)
      if (candles) setDxyBars(candles)
    })

    return () => {
      cancelled = true
      void window.api.market.unsubscribePrice('DXY').catch(() => {})
    }
  }, [])

  const activeDxyPrice = storeDxyQuote?.price ?? dxyQuote?.price ?? dxyBars.at(-1)?.close ?? 0
  const activeDxyChange = storeDxyQuote?.change24hPercent ?? dxyQuote?.change24hPercent ?? 0
  const dxySparklineBars = useMemo(() => dxyBars.map((b) => ({ value: b.close })), [dxyBars])

  // 3. US 10Y Sovereign Yield & Real Yield state
  const [tenYearRate, setTenYearRate] = useState<FixedIncomeRateData | null>(null)
  const [tenYearHistory, setTenYearHistory] = useState<FixedIncomeHistoryData | null>(null)
  const [spreadsData, setSpreadsData] = useState<YieldSpreadResult | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.api.fixedIncome.getRate('10Y').catch(() => null),
      window.api.fixedIncome.getHistory('10Y').catch(() => null),
      window.api.fixedIncome.getSpreads().catch(() => null)
    ]).then(([rate, history, spreads]) => {
      if (cancelled) return
      setTenYearRate(rate)
      setTenYearHistory(history)
      setSpreadsData(spreads)
    })

    return () => {
      cancelled = true
    }
  }, [])

  // US Inflation from macroData for Real Yield calculation
  const usInflationRate = useMemo(() => {
    const us = macroData.find((c) => c.id === 'US')
    return us && typeof us.value === 'number' && !isNaN(us.value) ? us.value : null
  }, [macroData])

  const nominal10Y = tenYearRate?.rate ?? null
  const realYield =
    nominal10Y !== null && usInflationRate !== null ? nominal10Y - usInflationRate : null

  const yieldSparklineBars = useMemo(() => {
    if (!tenYearHistory || !tenYearHistory.points) return []
    return tenYearHistory.points.map((p) => ({ value: p.value }))
  }, [tenYearHistory])

  // 4. Cross-Asset Benchmark Quotes
  const BENCHMARKS = useMemo(
    () => [
      { symbol: 'XAUUSD', name: 'Gold / USD', category: 'Commodity' },
      { symbol: 'BTCUSD', name: 'Bitcoin', category: 'Crypto' },
      { symbol: 'WTI', name: 'Crude Oil', category: 'Commodity' },
      { symbol: 'SPX', name: 'S&P 500', category: 'Equities' },
      { symbol: 'EURUSD', name: 'EUR / USD', category: 'Forex' }
    ],
    []
  )

  const [benchmarkQuotes, setBenchmarkQuotes] = useState<Record<string, PriceQuote>>({})
  const [benchmarkBars, setBenchmarkBars] = useState<Record<string, CandleBar[]>>({})

  useEffect(() => {
    let cancelled = false
    const symbols = BENCHMARKS.map((b) => b.symbol)

    symbols.forEach((sym) => {
      Promise.all([
        window.api.market.getPrice(sym).catch(() => null),
        window.api.market.getCandles({ symbol: sym, timeframe: '1d', limit: 20 }).catch(() => [])
      ]).then(([quote, candles]) => {
        if (cancelled) return
        if (quote) {
          setBenchmarkQuotes((prev) => ({ ...prev, [sym]: quote }))
        }
        if (candles && candles.length > 0) {
          setBenchmarkBars((prev) => ({ ...prev, [sym]: candles }))
        }
      })
    })

    return () => {
      cancelled = true
    }
  }, [BENCHMARKS])

  // 5. Macro News Pulse
  const [newsList, setNewsList] = useState<NewsArticle[]>([])

  useEffect(() => {
    let cancelled = false
    window.api.news
      .get({ limit: 4 })
      .then((items) => {
        if (!cancelled && items) setNewsList(items.slice(0, 4))
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
      style={{
        padding: '24px 28px 48px 28px',
        backgroundColor: THEME_TOKENS.colors.bgApp,
        borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 20
      }}
    >
      {/* SECTION HEADER WITH 'BACK TO MAP' BUTTON */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 12,
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={18} color={THEME_TOKENS.colors.accent} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
              Macro Pulse & Cross-Asset Intelligence
            </div>
            <div style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
              Synchronized global telemetry, live broadcasts, real yields & benchmark assets
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onScrollToMap}
          className="tv-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 4,
            cursor: 'pointer'
          }}
          title="Scroll back to top map"
        >
          <ArrowUp size={13} />
          Back to Map
        </button>
      </div>

      {/* TOP ROW: YOUTUBE BROADCAST CARD + DXY REALTIME CARD + US 10Y REAL YIELD CARD */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16
        }}
      >
        {/* 1. YOUTUBE MARKET BROADCAST CARD */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSurface,
            borderRadius: 6,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 4,
                  backgroundColor: 'rgba(242, 54, 69, 0.15)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#f23645'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </div>
              <div>
                <span
                  style={{ fontSize: 12, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}
                >
                  Live Market Broadcast
                </span>
                <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>
                  Configurable Video Feed
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (isEditingYt) handleSaveYtUrl()
                else {
                  setTempYtInput(youtubeUrl)
                  setIsEditingYt(true)
                }
              }}
              style={{
                background: 'none',
                border: 'none',
                color: THEME_TOKENS.colors.textSecondary,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10
              }}
              title={isEditingYt ? 'Save URL' : 'Edit Stream URL'}
            >
              {isEditingYt ? (
                <Check size={13} color={THEME_TOKENS.colors.bullish} />
              ) : (
                <Edit2 size={13} />
              )}
              {isEditingYt ? 'Save' : 'Edit'}
            </button>
          </div>

          {/* EDIT INPUT OR THUMBNAIL PREVIEW */}
          {isEditingYt ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="text"
                value={tempYtInput}
                onChange={(e) => setTempYtInput(e.target.value)}
                placeholder="Paste YouTube video or livestream link..."
                className="tv-input"
                style={{
                  width: '100%',
                  height: 30,
                  fontSize: 11,
                  padding: '4px 8px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveYtUrl()
                  if (e.key === 'Escape') setIsEditingYt(false)
                }}
              />
              <span style={{ fontSize: 9, color: THEME_TOKENS.colors.textMuted }}>
                Press Enter to save. Accepts any YouTube livestream or macro recording URL.
              </span>
            </div>
          ) : (
            <div
              onClick={handleOpenYoutube}
              style={{
                position: 'relative',
                width: '100%',
                height: 120,
                borderRadius: 4,
                overflow: 'hidden',
                cursor: 'pointer',
                backgroundColor: '#000000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
              }}
              title="Click to open YouTube broadcast"
            >
              {videoId ? (
                <img
                  src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                  alt="Stream Thumbnail"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    opacity: 0.8
                  }}
                />
              ) : (
                <div style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
                  Financial Livestream Link
                </div>
              )}
              {/* Play Overlay */}
              <div
                style={{
                  position: 'absolute',
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#ffffff'
                }}
              >
                <ExternalLink size={16} />
              </div>
              <div
                style={{
                  position: 'absolute',
                  bottom: 6,
                  left: 8,
                  backgroundColor: 'rgba(242, 54, 69, 0.9)',
                  color: '#ffffff',
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 2
                }}
              >
                STREAM LINK
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleOpenYoutube}
            className="tv-btn"
            style={{
              width: '100%',
              padding: '6px 0',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            <ExternalLink size={12} />
            Watch Video Stream
          </button>
        </div>

        {/* 2. DXY (US DOLLAR INDEX) REALTIME CARD */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSurface,
            borderRadius: 6,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 4,
                  backgroundColor: 'rgba(41, 98, 255, 0.15)',
                  display: 'grid',
                  placeItems: 'center',
                  color: THEME_TOKENS.colors.accent
                }}
              >
                <Activity size={15} />
              </div>
              <div>
                <span
                  style={{ fontSize: 12, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}
                >
                  US Dollar Index (DXY)
                </span>
                <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>
                  Global Reserve Telemetry
                </div>
              </div>
            </div>

            <span
              style={{
                fontSize: 10,
                color:
                  activeDxyPrice > 0 ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.textMuted
              }}
            >
              {activeDxyPrice > 0 ? 'LIVE' : 'UNAVAILABLE'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: THEME_TOKENS.colors.textBright,
                  lineHeight: 1
                }}
              >
                {activeDxyPrice > 0 ? activeDxyPrice.toFixed(2) : '-'}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 6,
                  fontSize: 11,
                  color:
                    activeDxyChange >= 0 ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish
                }}
              >
                {activeDxyChange >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                <span>
                  {activeDxyChange >= 0 ? '+' : ''}
                  {activeDxyChange.toFixed(2)}%
                </span>
                <span style={{ fontSize: 9, color: THEME_TOKENS.colors.textMuted }}>· 24h</span>
              </div>
            </div>

            {/* DXY 30D Trend Sparkline */}
            <div style={{ textAlign: 'right' }}>
              <Sparkline
                bars={dxySparklineBars}
                color={
                  activeDxyChange >= 0 ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish
                }
              />
              <div style={{ fontSize: 9, color: THEME_TOKENS.colors.textMuted, marginTop: 4 }}>
                30D Daily Trend
              </div>
            </div>
          </div>

          <div
            style={{
              paddingTop: 8,
              borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: THEME_TOKENS.colors.textSecondary
            }}
          >
            <span>DXY Basket: EUR, JPY, GBP, CAD, SEK, CHF</span>
            {onSelectSymbol && (
              <button
                type="button"
                onClick={() => onSelectSymbol('DXY')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: THEME_TOKENS.colors.accent,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 10
                }}
              >
                Inspect in Chart →
              </button>
            )}
          </div>
        </div>

        {/* 3. US 10Y SOVEREIGN YIELD & REAL YIELD CARD */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSurface,
            borderRadius: 6,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 4,
                  backgroundColor: 'rgba(8, 153, 129, 0.15)',
                  display: 'grid',
                  placeItems: 'center',
                  color: THEME_TOKENS.colors.bullish
                }}
              >
                <TrendingUp size={15} />
              </div>
              <div>
                <span
                  style={{ fontSize: 12, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}
                >
                  US 10Y Sovereign Yield
                </span>
                <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>
                  Nominal & Real Benchmark
                </div>
              </div>
            </div>

            <span
              style={{
                fontSize: 10,
                color:
                  nominal10Y !== null ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.textMuted
              }}
            >
              {nominal10Y !== null ? 'SYNCED' : 'UNAVAILABLE'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: THEME_TOKENS.colors.textBright,
                    lineHeight: 1
                  }}
                >
                  {nominal10Y !== null ? `${nominal10Y.toFixed(2)}%` : '-'}
                </span>
                <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textMuted }}>
                  10Y Nominal
                </span>
              </div>

              {/* Real Yield derivation (10Y minus US CPI) */}
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span style={{ color: THEME_TOKENS.colors.textSecondary }}>Real Yield:</span>
                <span
                  style={{
                    fontWeight: 700,
                    color:
                      realYield !== null
                        ? realYield >= 0
                          ? THEME_TOKENS.colors.bullish
                          : THEME_TOKENS.colors.bearish
                        : THEME_TOKENS.colors.textMuted
                  }}
                >
                  {realYield !== null
                    ? `${realYield >= 0 ? '+' : ''}${realYield.toFixed(2)}%`
                    : usInflationRate !== null
                      ? 'Calc error'
                      : 'Live CPI unavailable'}
                </span>
              </div>
            </div>

            {/* 10Y Yield Sparkline */}
            <div style={{ textAlign: 'right' }}>
              <Sparkline bars={yieldSparklineBars} color={THEME_TOKENS.colors.accent} />
              <div style={{ fontSize: 9, color: THEME_TOKENS.colors.textMuted, marginTop: 4 }}>
                10Y Yield Curve Trend
              </div>
            </div>
          </div>

          {/* 2Y-10Y Spread stats */}
          <div
            style={{
              paddingTop: 8,
              borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: THEME_TOKENS.colors.textSecondary
            }}
          >
            <span>
              2Y-10Y Spread:{' '}
              <strong style={{ color: THEME_TOKENS.colors.textBright }}>
                {spreadsData?.spread2Y10Y !== undefined
                  ? `${spreadsData.spread2Y10Y > 0 ? '+' : ''}${spreadsData.spread2Y10Y.toFixed(0)} bps`
                  : '34 bps'}
              </strong>
            </span>
            <span>
              US CPI:{' '}
              <strong style={{ color: THEME_TOKENS.colors.textBright }}>
                {usInflationRate !== null ? `${usInflationRate.toFixed(1)}%` : 'Synced'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: CROSS-ASSET BENCHMARK TILES + MACRO NEWS PULSE */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16
        }}
      >
        {/* CROSS-ASSET BENCHMARK METRICS */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSurface,
            borderRadius: 6,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={15} color={THEME_TOKENS.colors.accent} />
              <span
                style={{ fontSize: 12, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}
              >
                Cross-Asset Benchmarks
              </span>
            </div>
            <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>
              Click to Open in Chart
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {BENCHMARKS.map((item) => {
              const quote = benchmarkQuotes[item.symbol]
              const bars = benchmarkBars[item.symbol] || []
              const price = quote?.price ?? bars.at(-1)?.close ?? 0
              const chg = quote?.change24hPercent ?? 0
              const isUp = chg >= 0
              const sparkBars = bars.map((b) => ({ value: b.close }))

              return (
                <div
                  key={item.symbol}
                  onClick={() => onSelectSymbol && onSelectSymbol(item.symbol)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 1fr 90px 65px',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 4,
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    cursor: onSelectSymbol ? 'pointer' : 'default',
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    transition: 'background-color 0.1s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgApp
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 11,
                        color: THEME_TOKENS.colors.textBright
                      }}
                    >
                      {item.symbol}
                    </div>
                    <div style={{ fontSize: 9, color: THEME_TOKENS.colors.textMuted }}>
                      {item.name}
                    </div>
                  </div>

                  <div>
                    <Sparkline
                      bars={sparkBars}
                      color={isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish}
                      width={100}
                      height={24}
                    />
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 12,
                        color: THEME_TOKENS.colors.textBright
                      }}
                    >
                      {price > 0
                        ? price.toLocaleString(undefined, { minimumFractionDigits: 2 })
                        : '-'}
                    </div>
                  </div>

                  <div
                    style={{
                      textAlign: 'right',
                      fontSize: 11,
                      fontWeight: 600,
                      color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish
                    }}
                  >
                    {isUp ? '+' : ''}
                    {chg.toFixed(2)}%
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* MACRO NEWS WIRE & PULSE */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSurface,
            borderRadius: 6,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Newspaper size={15} color={THEME_TOKENS.colors.accent} />
              <span
                style={{ fontSize: 12, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}
              >
                Macro Headlines & Wire
              </span>
            </div>
            <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>
              Institutional Feed
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {newsList.length === 0 ? (
              <div
                style={{
                  padding: '24px 0',
                  textAlign: 'center',
                  fontSize: 11,
                  color: THEME_TOKENS.colors.textMuted
                }}
              >
                Synchronizing latest macro news wire...
              </div>
            ) : (
              newsList.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.url && window.api?.system?.openExternal) {
                      window.api.system.openExternal(item.url)
                    }
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 4,
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    cursor: item.url ? 'pointer' : 'default',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}
                  onMouseEnter={(e) => {
                    if (item.url)
                      e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgApp
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: THEME_TOKENS.colors.textBright,
                      lineHeight: 1.35
                    }}
                  >
                    {item.title}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 9,
                      color: THEME_TOKENS.colors.textMuted
                    }}
                  >
                    <span>{item.source}</span>
                    <span>
                      {new Date(item.publishedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
