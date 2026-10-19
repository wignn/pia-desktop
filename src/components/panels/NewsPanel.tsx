import React, { useState, useEffect } from 'react'
import { useNewsStore } from '../../stores/useNewsStore'
import { THEME_TOKENS } from '../../theme/tokens'
import type { NewsArticle } from '@shared/types'

const CATEGORIES = ['All', 'Macro', 'Crypto', 'Stocks', 'Commodities', 'Energy']

export interface NewsPanelProps {
  customArticles?: NewsArticle[]
}

export const NewsPanel: React.FC<NewsPanelProps> = ({ customArticles }) => {
  const storeArticles = useNewsStore((state) => state.articles)
  const isLoading = useNewsStore((state) => state.isLoading)
  const category = useNewsStore((state) => state.category)
  const fetchNews = useNewsStore((state) => state.fetchNews)
  const setCategory = useNewsStore((state) => state.setCategory)

  const articles = customArticles ?? storeArticles
  const [currentTimestamp, setCurrentTimestamp] = useState<number>(() => Date.now())
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetchNews()
  }, [fetchNews])

  // Periodic clock tick to refresh relative time without impure Date.now() during render
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimestamp(Date.now())
    }, 30000)
    return (): void => clearInterval(timer)
  }, [])

  const handleOpenLink = (url?: string): void => {
    if (!url) return
    window.api.system.openExternal(url).catch((err) => {
      console.error('Failed to open external link:', err)
    })
  }

  const handleImageError = (id: string): void => {
    setFailedImages((prev) => ({ ...prev, [id]: true }))
  }

  const formatTimeAgo = (timestamp: number | string, nowMs: number): string => {
    try {
      const ms = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime()
      const diffSec = Math.floor((nowMs - ms) / 1000)
      if (diffSec < 60) return `${Math.max(0, diffSec)}s ago`
      const diffMin = Math.floor(diffSec / 60)
      if (diffMin < 60) return `${diffMin}m ago`
      const diffHours = Math.floor(diffMin / 60)
      if (diffHours < 24) return `${diffHours}h ago`
      return `${Math.floor(diffHours / 24)}d ago`
    } catch {
      return String(timestamp)
    }
  }

  const activeCategory = category || 'All'

  // ponytail: News feed view with rich thumbnails; upgrade to full-text reader modal when offline article caching is requested.
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        fontSize: 12
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 12px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: THEME_TOKENS.colors.textBright }}>
            Financial News
          </span>
          <span
            style={{
              fontSize: 10,
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              color: THEME_TOKENS.colors.bullish,
              padding: '1px 6px',
              borderRadius: 10,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <span className="live-beacon" style={{ width: 5, height: 5 }} />
            LIVE
          </span>
        </div>
        <button
          type="button"
          onClick={(): void => {
            fetchNews()
          }}
          className="tv-btn"
          title="Refresh news"
          disabled={isLoading}
          style={{ padding: 4 }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }}
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      {/* Category Pills Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          overflowX: 'auto',
          scrollbarWidth: 'none'
        }}
      >
        {CATEGORIES.map((cat) => {
          const isSelected = activeCategory.toLowerCase() === cat.toLowerCase()
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat === 'All' ? undefined : cat)}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontWeight: isSelected ? 600 : 500,
                backgroundColor: isSelected ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.bgApp,
                color: isSelected ? '#ffffff' : THEME_TOKENS.colors.textSecondary,
                transition: 'all 0.12s ease'
              }}
            >
              {cat}
            </button>
          )
        })}
      </div>

      {/* Articles List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading && articles.length === 0 && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            Fetching latest market news...
          </div>
        )}

        {!isLoading && articles.length === 0 && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            No news articles available.
          </div>
        )}

        {articles.map((item, index) => {
          const hasImage = Boolean(item.imageUrl && !failedImages[item.id])
          const isHero = index === 0

          return (
            <div
              key={item.id}
              onClick={(): void => handleOpenLink(item.url)}
              style={{
                padding: '12px',
                borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                cursor: item.url ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: isHero ? 'column' : 'row',
                gap: 10,
                transition: 'background 0.12s ease'
              }}
              onMouseEnter={(e): void => {
                if (item.url) e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
              }}
              onMouseLeave={(e): void => {
                if (item.url) e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              {/* Hero Banner (Top Article) */}
              {isHero && (
                <div
                  style={{
                    width: '100%',
                    height: 120,
                    borderRadius: 4,
                    overflow: 'hidden',
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    marginBottom: 2
                  }}
                >
                  {hasImage ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      onError={() => handleImageError(item.id)}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block'
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background:
                          'linear-gradient(135deg, rgba(41, 98, 255, 0.2) 0%, rgba(19, 23, 34, 0.95) 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8
                      }}
                    >
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={THEME_TOKENS.colors.accent}
                        strokeWidth="2"
                      >
                        <path d="M23 6l-9.5 9.5-5-5L1 18" />
                        <path d="M17 6h6v6" />
                      </svg>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: THEME_TOKENS.colors.textBright
                        }}
                      >
                        {item.source || 'FINANCIAL WIRE'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Text Content */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  minWidth: 0
                }}
              >
                {/* Meta row: Source & Time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        item.source?.toLowerCase().includes('fxstreet')
                          ? THEME_TOKENS.colors.gold
                          : THEME_TOKENS.colors.accent
                    }}
                  >
                    {item.source}
                  </span>
                  <span style={{ color: THEME_TOKENS.colors.textMuted }}>•</span>
                  <span style={{ color: THEME_TOKENS.colors.textSecondary }}>
                    {formatTimeAgo(item.publishedAt, currentTimestamp)}
                  </span>
                  {item.category && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.03em',
                        textTransform: 'uppercase',
                        color: THEME_TOKENS.colors.textSecondary,
                        backgroundColor: THEME_TOKENS.colors.bgApp,
                        border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                        padding: '1px 5px',
                        borderRadius: 3
                      }}
                    >
                      {item.category}
                    </span>
                  )}
                </div>

                {/* Title */}
                <div
                  style={{
                    fontWeight: 600,
                    color: THEME_TOKENS.colors.textBright,
                    lineHeight: 1.35,
                    fontSize: isHero ? 13 : 12
                  }}
                >
                  {item.title}
                </div>

                {/* Summary preview */}
                {item.summary && (
                  <div
                    style={{
                      color: THEME_TOKENS.colors.textSecondary,
                      fontSize: 11,
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: isHero ? 2 : 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {item.summary}
                  </div>
                )}
              </div>

              {/* Right Thumbnail Image (Subsequent Articles) */}
              {!isHero && (
                <div
                  style={{
                    width: 76,
                    height: 56,
                    borderRadius: 4,
                    overflow: 'hidden',
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    flexShrink: 0
                  }}
                >
                  {hasImage ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      onError={() => handleImageError(item.id)}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block'
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background:
                          'linear-gradient(135deg, rgba(41, 98, 255, 0.18) 0%, rgba(19, 23, 34, 0.95) 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={THEME_TOKENS.colors.accent}
                        strokeWidth="2"
                      >
                        <path d="M23 6l-9.5 9.5-5-5L1 18" />
                        <path d="M17 6h6v6" />
                      </svg>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: THEME_TOKENS.colors.textSecondary
                        }}
                      >
                        {(item.source || 'WIRE').slice(0, 4).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
