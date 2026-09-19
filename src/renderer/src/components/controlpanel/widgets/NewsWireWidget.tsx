import React, { useState, useEffect } from 'react'
import type { NewsArticle } from '@shared/types'

export const NewsWireWidget: React.FC = () => {
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    window.api.news
      .get({ limit: 20 })
      .then((res) => {
        if (cancelled) return
        const list = Array.isArray(res) ? res : (res as any)?.items || (res as any)?.articles || []
        setArticles(list)
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
        backgroundColor: '#131722',
        overflowY: 'auto'
      }}
    >
      {isLoading && (
        <div style={{ fontSize: 11, color: '#787b86', textAlign: 'center', padding: 20 }}>
          Streaming news wire...
        </div>
      )}
      {articles.map((art) => (
        <div
          key={art.id}
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid #1e222d',
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
              color: '#787b86'
            }}
          >
            <span style={{ fontWeight: 600, color: '#2962ff' }}>{art.source}</span>
            <span>
              {new Date(art.publishedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#ffffff', lineHeight: '15px' }}>
            {art.title}
          </div>
        </div>
      ))}
    </div>
  )
}
