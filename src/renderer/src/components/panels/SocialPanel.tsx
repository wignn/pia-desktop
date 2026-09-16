import React, { useState, useEffect, useCallback } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'
import type { SocialPostItemData } from '@shared/types'

export const SocialPanel: React.FC = () => {
  const { symbol, setSymbol } = useMarketStore()
  const [posts, setPosts] = useState<SocialPostItemData[]>([])
  const [filterBySymbol, setFilterBySymbol] = useState<boolean>(false)
  const [selectedSentiment, setSelectedSentiment] = useState<'all' | 'bullish' | 'bearish'>('all')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [currentTimestamp, setCurrentTimestamp] = useState<number>(() => Date.now())

  const loadPosts = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) setIsLoading(true)
        const data = await window.api.social.getPosts({
          symbol: filterBySymbol ? (symbol ?? undefined) : undefined,
          sentiment: selectedSentiment !== 'all' ? selectedSentiment : undefined
        })
        setPosts(data)
      } catch (err) {
        console.error('[SocialPanel] Failed to fetch social posts:', err)
      } finally {
        setIsLoading(false)
      }
    },
    [symbol, filterBySymbol, selectedSentiment]
  )

  useEffect(() => {
    let cancelled = false
    window.api.social
      .getPosts({
        symbol: filterBySymbol ? (symbol ?? undefined) : undefined,
        sentiment: selectedSentiment !== 'all' ? selectedSentiment : undefined
      })
      .then((data) => {
        if (!cancelled) {
          setPosts(data)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[SocialPanel] Failed to fetch social posts:', err)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [symbol, filterBySymbol, selectedSentiment])

  // Periodic clock tick for relative timestamps without impure Date.now() during render
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimestamp(Date.now())
    }, 30000)
    return () => clearInterval(timer)
  }, [])

  const handleOpenUrl = (url?: string): void => {
    if (!url) return
    window.api.system.openExternal(url).catch((err) => {
      console.error('[SocialPanel] Failed to open external URL:', err)
    })
  }

  const getSentimentColor = (sentiment: string): string => {
    if (sentiment === 'bullish') return THEME_TOKENS.colors.bullish
    if (sentiment === 'bearish') return THEME_TOKENS.colors.bearish
    return THEME_TOKENS.colors.textSecondary
  }

  const formatTimeAgo = (ts: number): string => {
    const diffSec = Math.floor((currentTimestamp - ts) / 1000)
    if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return `${Math.floor(diffHr / 24)}d ago`
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
          Social Sentiment Feed
        </span>

        <button
          type="button"
          onClick={() => loadPosts(true)}
          className="tv-btn"
          title="Refresh Social Feed"
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
            style={{
              animation: isLoading ? 'spin 1s linear infinite' : 'none'
            }}
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          backgroundColor: THEME_TOKENS.colors.bgApp,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <button
          type="button"
          onClick={() => setFilterBySymbol(!filterBySymbol)}
          className={`tv-btn ${filterBySymbol ? 'active' : ''}`}
          style={{ fontSize: 11, padding: '3px 8px' }}
        >
          {filterBySymbol ? `Filter: ${symbol}` : 'All Tickers'}
        </button>

        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'bullish', 'bearish'] as const).map((sent) => (
            <button
              key={sent}
              type="button"
              onClick={() => setSelectedSentiment(sent)}
              className={`tv-btn ${selectedSentiment === sent ? 'active' : ''}`}
              style={{
                fontSize: 10,
                padding: '2px 6px',
                textTransform: 'capitalize'
              }}
            >
              {sent}
            </button>
          ))}
        </div>
      </div>

      {/* Posts Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {posts.length === 0 && !isLoading && (
          <div
            style={{ textAlign: 'center', color: THEME_TOKENS.colors.textSecondary, padding: 24 }}
          >
            No social posts found for criteria.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {posts.map((p) => (
            <div
              key={p.id}
              style={{
                backgroundColor: THEME_TOKENS.colors.bgApp,
                padding: 10,
                borderRadius: 4,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
              }}
            >
              {/* Top metadata */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
                    {p.author}
                  </span>
                  {p.handle && (
                    <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                      {p.handle}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 9,
                      padding: '1px 4px',
                      borderRadius: 2,
                      backgroundColor: THEME_TOKENS.colors.bgSurface,
                      color: THEME_TOKENS.colors.accent,
                      fontWeight: 600
                    }}
                  >
                    {p.source}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 5px',
                      borderRadius: 3,
                      textTransform: 'uppercase',
                      backgroundColor: `${getSentimentColor(p.sentiment)}22`,
                      color: getSentimentColor(p.sentiment)
                    }}
                  >
                    {p.sentiment}
                  </span>
                  <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                    {formatTimeAgo(p.timestamp)}
                  </span>
                  {p.url && (
                    <button
                      type="button"
                      onClick={() => handleOpenUrl(p.url)}
                      title="Open original post in browser"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '1px 3px',
                        color: THEME_TOKENS.colors.textSecondary,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: 11,
                        lineHeight: 1
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = THEME_TOKENS.colors.accent
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = THEME_TOKENS.colors.textSecondary
                      }}
                    >
                      ↗
                    </button>
                  )}
                </div>
              </div>

              {/* Content Body */}
              <div
                style={{
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: THEME_TOKENS.colors.textPrimary,
                  marginBottom: 8
                }}
              >
                {p.content}
              </div>

              {/* Attached Media (Screenshots / Charts) */}
              {p.mediaUrls && p.mediaUrls.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      p.mediaUrls.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 6,
                    marginBottom: 8
                  }}
                >
                  {p.mediaUrls.map((mediaUrl, mIdx) => (
                    <div
                      key={`${p.id}-media-${mIdx}`}
                      style={{
                        position: 'relative',
                        borderRadius: 4,
                        overflow: 'hidden',
                        border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                        backgroundColor: THEME_TOKENS.colors.bgSurface,
                        maxHeight: p.mediaUrls && p.mediaUrls.length === 1 ? 220 : 130,
                        cursor: 'pointer'
                      }}
                      onClick={() => handleOpenUrl(mediaUrl)}
                      title="Click to open media"
                    >
                      <img
                        src={mediaUrl}
                        alt="attachment"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        style={{
                          width: '100%',
                          height: '100%',
                          maxHeight: p.mediaUrls && p.mediaUrls.length === 1 ? 220 : 130,
                          objectFit: 'cover',
                          display: 'block'
                        }}
                        onError={(e) => {
                          const target = e.currentTarget
                          target.style.display = 'none'
                          if (target.parentElement) {
                            target.parentElement.style.display = 'none'
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom bar: Tickers & engagement */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: 6,
                  borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                }}
              >
                <div style={{ display: 'flex', gap: 4 }}>
                  {p.symbols.map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setSymbol(sym)}
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: 2,
                        backgroundColor: THEME_TOKENS.colors.bgSurface,
                        border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                        color: THEME_TOKENS.colors.accent,
                        cursor: 'pointer'
                      }}
                    >
                      ${sym}
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    fontSize: 10,
                    color: THEME_TOKENS.colors.textSecondary
                  }}
                >
                  {p.likes !== undefined && <span>♥ {p.likes.toLocaleString()}</span>}
                  {p.reposts !== undefined && <span>↻ {p.reposts.toLocaleString()}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
