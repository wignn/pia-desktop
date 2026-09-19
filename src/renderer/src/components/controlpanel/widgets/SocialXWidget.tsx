import React, { useState, useEffect } from 'react'
import type { SocialPostItemData } from '@shared/types'
import { THEME_TOKENS } from '../../../theme/tokens'

export const SocialXWidget: React.FC = () => {
  const [posts, setPosts] = useState<SocialPostItemData[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    window.api.social
      .getFeed({ limit: 15 })
      .then((res) => {
        if (cancelled) return
        const list = Array.isArray(res) ? res : (res as any)?.items || (res as any)?.data || []
        setPosts(list)
        setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        overflowY: 'auto'
      }}
    >
      {isLoading && (
        <div style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary, textAlign: 'center', padding: 20 }}>
          Streaming X sentiment...
        </div>
      )}
      {posts.map((p) => {
        const isBull = p.sentiment === 'bullish'
        const isBear = p.sentiment === 'bearish'
        return (
          <div
            key={p.id}
            style={{
              padding: '8px 12px',
              borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
                  @{p.handle || p.author}
                </span>
                <span style={{ fontSize: 9, color: THEME_TOKENS.colors.textSecondary }}>
                  {new Date(p.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              {p.sentiment && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '1px 4px',
                    borderRadius: 2,
                    backgroundColor: isBull
                      ? 'rgba(8, 153, 129, 0.2)'
                      : isBear
                        ? 'rgba(242, 54, 69, 0.2)'
                        : THEME_TOKENS.colors.bgApp,
                    color: isBull ? THEME_TOKENS.colors.bullish : isBear ? THEME_TOKENS.colors.bearish : THEME_TOKENS.colors.textSecondary
                  }}
                >
                  {p.sentiment.toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: THEME_TOKENS.colors.textPrimary, lineHeight: '15px' }}>{p.content}</div>
          </div>
        )
      })}
    </div>
  )
}
