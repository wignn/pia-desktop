import React, { useEffect } from 'react'
import { useNewsStore } from '../../../stores/useNewsStore'
import { THEME_TOKENS } from '../../../theme/tokens'

export const NewsWireWidget: React.FC = () => {
  const articles = useNewsStore((state) => state.articles)
  const isLoading = useNewsStore((state) => state.isLoading)
  const startRealtimeSync = useNewsStore((state) => state.startRealtimeSync)

  useEffect(() => {
    return startRealtimeSync(15_000)
  }, [startRealtimeSync])

  const visibleArticles = articles.slice(0, 20)

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
      {isLoading && visibleArticles.length === 0 && (
        <div style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary, textAlign: 'center', padding: 20 }}>
          Streaming news wire...
        </div>
      )}
      {visibleArticles.map((art) => (
        <div
          key={art.id}
          style={{
            padding: '8px 12px',
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 3
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 10,
              color: THEME_TOKENS.colors.textSecondary
            }}
          >
            <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.accent }}>{art.source}</span>
            <span>
              {new Date(art.publishedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: THEME_TOKENS.colors.textBright, lineHeight: '15px' }}>
            {art.title}
          </div>
        </div>
      ))}
    </div>
  )
}
