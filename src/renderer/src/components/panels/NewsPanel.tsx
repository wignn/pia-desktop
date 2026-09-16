import React, { useState, useEffect } from 'react'
import { useNewsStore } from '../../stores/useNewsStore'
import { THEME_TOKENS } from '../../theme/tokens'

export const NewsPanel: React.FC = () => {
  const { articles, isLoading, fetchNews } = useNewsStore()
  const [currentTimestamp, setCurrentTimestamp] = useState<number>(() => Date.now())

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
        <span style={{ fontWeight: 700, fontSize: 13, color: THEME_TOKENS.colors.textBright }}>
          Financial News
        </span>
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

        {articles.map((item) => (
          <div
            key={item.id}
            onClick={(): void => handleOpenLink(item.url)}
            style={{
              padding: '12px',
              borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              cursor: item.url ? 'pointer' : 'default',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              transition: 'background 0.12s ease'
            }}
            onMouseEnter={(e): void => {
              if (item.url)
                e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
            }}
            onMouseLeave={(e): void => {
              if (item.url) e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            {/* Meta row: Source & Time */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.accent }}>
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
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: THEME_TOKENS.colors.accent,
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    padding: '1px 5px',
                    borderRadius: 3
                  }}
                >
                  {item.category}
                </span>
              )}
            </div>

            {/* Title (Plain text safe rendering) */}
            <div
              style={{
                fontWeight: 600,
                color: THEME_TOKENS.colors.textBright,
                lineHeight: 1.3,
                fontSize: 12
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
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}
              >
                {item.summary}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
