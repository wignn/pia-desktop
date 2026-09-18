import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, ChevronUp, RefreshCw } from 'lucide-react'
import type {
  CandleBar,
  CountryMacroData,
  NewsArticle,
  PriceQuote,
  SocialPostItemData,
  YieldCurveResult,
  YieldSpreadResult
} from '@shared/types'
import { THEME_TOKENS } from '../../theme/tokens'
import { useMarketStore } from '../../stores/useMarketStore'
import { parseYouTubeId } from '../../utils/youtube'

interface MacroCardsSectionProps {
  macroData: CountryMacroData[]
  onScrollToTop: () => void
  onSelectSymbol: (symbol: string) => void
}

interface VideoSettings {
  url: string
  title: string
}

const BENCHMARKS = ['XAUUSD', 'DXY', 'SPX', 'WTI', 'BTCUSD']
const VIDEO_SETTINGS_KEY = 'pia-macro-video'

function loadVideoSettings(): VideoSettings | null {
  try {
    const value = localStorage.getItem(VIDEO_SETTINGS_KEY)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<VideoSettings>
    return typeof parsed.url === 'string' && parseYouTubeId(parsed.url) !== null
      ? { url: parsed.url, title: parsed.title || 'Market live stream' }
      : null
  } catch {
    return null
  }
}

function Sparkline({
  candles,
  positive
}: {
  candles: CandleBar[]
  positive?: boolean
}): React.JSX.Element {
  const points = useMemo(() => {
    if (candles.length < 2) return ''
    const values = candles.map((candle) => candle.close)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * 160
        const y = 30 - ((value - min) / range) * 24
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [candles])

  return (
    <svg
      width="100%"
      height="34"
      viewBox="0 0 160 34"
      preserveAspectRatio="none"
      aria-label="Price trend"
    >
      <line x1="0" y1="30" x2="160" y2="30" stroke={THEME_TOKENS.colors.borderSubtle} />
      {points && (
        <polyline
          points={points}
          fill="none"
          stroke={positive === false ? THEME_TOKENS.colors.bearish : THEME_TOKENS.colors.bullish}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

function formatValue(value?: number, digits = 2): string {
  return value === undefined || !Number.isFinite(value)
    ? 'Unavailable'
    : value.toLocaleString(undefined, {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits
      })
}

const cardStyle: React.CSSProperties = {
  backgroundColor: THEME_TOKENS.colors.bgSurface,
  border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
  borderRadius: 6,
  padding: 12,
  minWidth: 0
}

export const MacroCardsSection: React.FC<MacroCardsSectionProps> = ({
  macroData,
  onScrollToTop,
  onSelectSymbol
}) => {
  const { prices, symbols } = useMarketStore()
  const [benchmarkCandles, setBenchmarkCandles] = useState<Record<string, CandleBar[]>>({})
  const [yieldCurve, setYieldCurve] = useState<YieldCurveResult | null>(null)
  const [yieldSpreads, setYieldSpreads] = useState<YieldSpreadResult | null>(null)
  const [inflation, setInflation] = useState<number | undefined>()
  const [videos, setVideos] = useState<NewsArticle[]>([])
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([])
  const [socialPosts, setSocialPosts] = useState<SocialPostItemData[]>([])
  const [videoSettings, setVideoSettings] = useState<VideoSettings | null>(loadVideoSettings)
  const [videoInput, setVideoInput] = useState(videoSettings?.url || '')
  const [videoTitleInput, setVideoTitleInput] = useState(videoSettings?.title || '')
  const [showVideoSettings, setShowVideoSettings] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const loadCards = useCallback(async () => {
    setIsLoading(true)
    const availableSymbols = new Set(symbols.map((item) => item.symbol.toUpperCase()))
    const benchmarkSymbols = BENCHMARKS.filter(
      (benchmark) => benchmark === 'DXY' || availableSymbols.has(benchmark)
    )

    const candleResults = await Promise.all(
      benchmarkSymbols.map(async (benchmark) => {
        try {
          const candles = await window.api.market.getCandles({
            symbol: benchmark,
            timeframe: '1d',
            limit: 30
          })
          return [benchmark, candles] as const
        } catch {
          return [benchmark, []] as const
        }
      })
    )

    const [curve, spreads, inflationMap, news, socialPostsResult] = await Promise.all([
      window.api.fixedIncome.getYieldCurve().catch(() => null),
      window.api.fixedIncome.getSpreads().catch(() => null),
      window.api.macro
        .getMap({ indicator: 'inflation', period: String(new Date().getFullYear()) })
        .catch(() => null),
      window.api.news.get({ limit: 20 }).catch(() => []),
      window.api.social.getFeed({ limit: 12 }).catch(() => [])
    ])

    setBenchmarkCandles(Object.fromEntries(candleResults))
    setYieldCurve(curve)
    setYieldSpreads(spreads)
    setInflation(
      inflationMap?.countries.find((country) => country.id.toUpperCase() === 'US')?.value
    )
    setVideos(news.filter((article) => parseYouTubeId(article.url) !== null).slice(0, 3))
    setNewsArticles(news)
    setSocialPosts(socialPostsResult)
    setIsLoading(false)
  }, [symbols])

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      if (cancelled) return
      await loadCards()
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [loadCards])

  useEffect(() => {
    void window.api.market.subscribePrice('DXY')
    return () => {
      void window.api.market.unsubscribePrice('DXY')
    }
  }, [])

  const tenYearYield = yieldCurve?.points.find(
    (point) => point.tenor.toUpperCase() === '10Y'
  )?.yield
  const realYield =
    tenYearYield !== undefined && inflation !== undefined ? tenYearYield - inflation : undefined
  const dxyQuote: PriceQuote | undefined = prices.DXY
  const selectedVideo = videoSettings || videos[0]
  const selectedVideoUrl = selectedVideo && 'url' in selectedVideo ? selectedVideo.url : ''
  const selectedVideoId = selectedVideoUrl ? parseYouTubeId(selectedVideoUrl) : null

  const saveVideoSettings = (): void => {
    const url = videoInput.trim()
    const videoId = parseYouTubeId(url)
    if (!videoId) return
    const nextSettings = {
      url,
      title: videoTitleInput.trim() || 'Market live stream'
    }
    try {
      localStorage.setItem(VIDEO_SETTINGS_KEY, JSON.stringify(nextSettings))
    } catch {
      // Keep the current session setting if browser storage is unavailable.
    }
    setVideoSettings(nextSettings)
    setShowVideoSettings(false)
  }

  const clearVideoSettings = (): void => {
    try {
      localStorage.removeItem(VIDEO_SETTINGS_KEY)
    } catch {
      // Ignore unavailable browser storage.
    }
    setVideoSettings(null)
    setVideoInput('')
    setVideoTitleInput('')
  }

  return (
    <section
      style={{
        padding: '18px 16px 24px',
        backgroundColor: THEME_TOKENS.colors.bgApp,
        borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12
        }}
      >
        <div>
          <div style={{ color: THEME_TOKENS.colors.textBright, fontSize: 14, fontWeight: 700 }}>
            Macro Pulse
          </div>
          <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 11, marginTop: 3 }}>
            Market context below the map · provider data only
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="tv-btn"
            onClick={() => void loadCards()}
            title="Refresh macro cards"
            style={{ padding: 6 }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : undefined} />
          </button>
          <button
            type="button"
            className="tv-btn"
            onClick={onScrollToTop}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 9px',
              fontSize: 11
            }}
          >
            <ChevronUp size={14} /> Back to Map
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 10
        }}
      >
        <article style={cardStyle}>
          <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 10, fontWeight: 700 }}>
            DXY · US DOLLAR INDEX
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginTop: 7
            }}
          >
            <strong style={{ color: THEME_TOKENS.colors.textBright, fontSize: 20 }}>
              {formatValue(dxyQuote?.price, 2)}
            </strong>
            <span
              style={{
                color:
                  (dxyQuote?.change24hPercent ?? 0) >= 0
                    ? THEME_TOKENS.colors.bullish
                    : THEME_TOKENS.colors.bearish,
                fontSize: 11
              }}
            >
              {dxyQuote?.change24hPercent === undefined
                ? '--'
                : `${dxyQuote.change24hPercent >= 0 ? '+' : ''}${dxyQuote.change24hPercent.toFixed(2)}%`}
            </span>
          </div>
          <Sparkline
            candles={benchmarkCandles.DXY || []}
            positive={(dxyQuote?.change24hPercent ?? 0) >= 0}
          />
          <button
            type="button"
            className="tv-btn"
            onClick={() => onSelectSymbol('DXY')}
            style={{ width: '100%', fontSize: 10, padding: '4px 7px' }}
          >
            Open DXY chart <ArrowUpRight size={12} />
          </button>
        </article>

        <article style={cardStyle}>
          <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 10, fontWeight: 700 }}>
            US 10Y · REAL YIELD
          </div>
          <div style={{ marginTop: 7, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong
              style={{
                color:
                  realYield === undefined
                    ? THEME_TOKENS.colors.textSecondary
                    : realYield >= 0
                      ? THEME_TOKENS.colors.bullish
                      : THEME_TOKENS.colors.bearish,
                fontSize: 20
              }}
            >
              {realYield === undefined
                ? 'Unavailable'
                : `${realYield >= 0 ? '+' : ''}${realYield.toFixed(2)}%`}
            </strong>
            <span style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 10 }}>
              nominal − inflation
            </span>
          </div>
          <div
            style={{
              marginTop: 9,
              display: 'flex',
              justifyContent: 'space-between',
              color: THEME_TOKENS.colors.textSecondary,
              fontSize: 10
            }}
          >
            <span>10Y {formatValue(tenYearYield)}%</span>
            <span>2Y–10Y {formatValue(yieldSpreads?.spread2Y10Y)}%</span>
          </div>
          <div
            style={{
              marginTop: 8,
              color: yieldSpreads?.isInverted
                ? THEME_TOKENS.colors.bearish
                : THEME_TOKENS.colors.textMuted,
              fontSize: 10
            }}
          >
            {yieldSpreads
              ? yieldSpreads.isInverted
                ? 'Curve inverted'
                : 'Curve normal'
              : 'Live yield data unavailable'}
          </div>
        </article>

        {BENCHMARKS.filter((benchmark) => benchmark !== 'DXY').map((benchmark) => {
          const quote = prices[benchmark]
          const candles = benchmarkCandles[benchmark] || []
          const isAvailable = candles.length > 0 || quote !== undefined
          return (
            <article key={benchmark} style={cardStyle}>
              <div
                style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 10, fontWeight: 700 }}
              >
                {benchmark} · MARKET
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginTop: 7
                }}
              >
                <strong style={{ color: THEME_TOKENS.colors.textBright, fontSize: 18 }}>
                  {isAvailable
                    ? formatValue(quote?.price ?? candles[candles.length - 1]?.close, 2)
                    : 'Unavailable'}
                </strong>
                {quote?.change24hPercent !== undefined && (
                  <span
                    style={{
                      color:
                        quote.change24hPercent >= 0
                          ? THEME_TOKENS.colors.bullish
                          : THEME_TOKENS.colors.bearish,
                      fontSize: 11
                    }}
                  >
                    {quote.change24hPercent >= 0 ? '+' : ''}
                    {quote.change24hPercent.toFixed(2)}%
                  </span>
                )}
              </div>
              <Sparkline candles={candles} positive={(quote?.change24hPercent ?? 0) >= 0} />
              {isAvailable && (
                <button
                  type="button"
                  className="tv-btn"
                  onClick={() => onSelectSymbol(benchmark)}
                  style={{ width: '100%', fontSize: 10, padding: '4px 7px' }}
                >
                  View chart <ArrowUpRight size={12} />
                </button>
              )}
            </article>
          )
        })}

        <article style={{ ...cardStyle, gridColumn: 'span 2' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8
            }}
          >
            <div
              style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 10, fontWeight: 700 }}
            >
              MARKET VIDEO · YOUTUBE
            </div>
            <button
              type="button"
              className="tv-btn"
              onClick={() => setShowVideoSettings((open) => !open)}
              style={{ fontSize: 10, padding: '3px 7px' }}
            >
              {showVideoSettings ? 'Close' : 'Set video'}
            </button>
          </div>

          {showVideoSettings && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 9 }}>
              <input
                value={videoInput}
                onChange={(event) => setVideoInput(event.target.value)}
                placeholder="Paste YouTube live or recording link"
                style={{
                  backgroundColor: THEME_TOKENS.colors.bgApp,
                  border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
                  borderRadius: 4,
                  padding: '6px 8px',
                  color: THEME_TOKENS.colors.textBright,
                  fontSize: 11
                }}
              />
              <input
                value={videoTitleInput}
                onChange={(event) => setVideoTitleInput(event.target.value)}
                placeholder="Video title (optional)"
                style={{
                  backgroundColor: THEME_TOKENS.colors.bgApp,
                  border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
                  borderRadius: 4,
                  padding: '6px 8px',
                  color: THEME_TOKENS.colors.textBright,
                  fontSize: 11
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="tv-btn"
                  onClick={saveVideoSettings}
                  style={{ fontSize: 10, padding: '4px 8px' }}
                >
                  Save video
                </button>
                {videoSettings && (
                  <button
                    type="button"
                    className="tv-btn"
                    onClick={clearVideoSettings}
                    style={{ fontSize: 10, padding: '4px 8px' }}
                  >
                    Use provider videos
                  </button>
                )}
              </div>
            </div>
          )}

          {selectedVideoId ? (
            <div style={{ marginTop: 9 }}>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16 / 9',
                  backgroundColor: THEME_TOKENS.colors.bgApp,
                  borderRadius: 5,
                  overflow: 'hidden'
                }}
              >
                <iframe
                  title={
                    selectedVideo && 'title' in selectedVideo ? selectedVideo.title : 'Market video'
                  }
                  src={`https://www.youtube-nocookie.com/embed/${selectedVideoId}`}
                  style={{ width: '100%', height: '100%', border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginTop: 6
                }}
              >
                <span
                  style={{
                    color: THEME_TOKENS.colors.textBright,
                    fontSize: 11,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {selectedVideo && 'title' in selectedVideo
                    ? selectedVideo.title
                    : 'Market live stream'}
                </span>
                <button
                  type="button"
                  className="tv-btn"
                  onClick={() => void window.api.system.openExternal(selectedVideoUrl)}
                  style={{ fontSize: 10, padding: '3px 7px', flexShrink: 0 }}
                >
                  Open YouTube <ArrowUpRight size={12} />
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12, color: THEME_TOKENS.colors.textSecondary, fontSize: 11 }}>
              No YouTube video selected. Paste a live stream or recording link above.
            </div>
          )}
        </article>

        <article style={{ ...cardStyle, gridColumn: 'span 2' }}>
          <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 10, fontWeight: 700 }}>
            NEWS · MARKET FEED
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 9 }}>
            {newsArticles.slice(0, 3).map((article) => (
              <button
                key={article.id}
                type="button"
                onClick={() => void window.api.system.openExternal(article.url)}
                style={{
                  display: 'block',
                  border: 0,
                  padding: 0,
                  background: 'none',
                  color: THEME_TOKENS.colors.textBright,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 11
                }}
              >
                <span
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {article.title}
                </span>
                <span
                  style={{
                    display: 'block',
                    color: THEME_TOKENS.colors.textMuted,
                    fontSize: 10,
                    marginTop: 2
                  }}
                >
                  {article.source} · {article.category || 'News'}
                </span>
              </button>
            ))}
            {socialPosts.slice(0, 3).map((post) => (
              <div
                key={post.id}
                style={{
                  borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  paddingTop: 6
                }}
              >
                <div
                  style={{ color: THEME_TOKENS.colors.textBright, fontSize: 11, lineHeight: 1.35 }}
                >
                  {post.content}
                </div>
                <div style={{ color: THEME_TOKENS.colors.textMuted, fontSize: 10, marginTop: 2 }}>
                  {post.source} · @{post.handle || post.author}
                </div>
              </div>
            ))}
            {newsArticles.length === 0 && socialPosts.length === 0 && (
              <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 11 }}>
                News and social feed unavailable from provider.
              </div>
            )}
          </div>
        </article>
      </div>

      {macroData.length === 0 && (
        <div style={{ marginTop: 12, color: THEME_TOKENS.colors.textMuted, fontSize: 10 }}>
          Country macro data is unavailable for the selected period.
        </div>
      )}
    </section>
  )
}
export default MacroCardsSection
