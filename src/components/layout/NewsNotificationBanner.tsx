import React from 'react'
import type { NewsArticle } from '@shared/types'
import { THEME_TOKENS } from '../../theme/tokens'

interface NewsNotificationBannerProps {
  article: NewsArticle
  onOpen: () => void
  onDismiss: () => void
}

export function NewsNotificationBanner({ article, onOpen, onDismiss }: NewsNotificationBannerProps): React.JSX.Element {
  return (
    <div role="status" aria-live="polite" style={{
      position: 'fixed', bottom: 42, right: 50, zIndex: 150,
      width: 'min(360px, calc(100vw - 72px))', display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 14px', borderRadius: 6,
      backgroundColor: THEME_TOKENS.colors.bgSurface,
      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
    }}>
      <button type="button" onClick={onOpen} aria-label={`Open news: ${article.title}`}
        style={{ flex: 1, minWidth: 0, background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', padding: 0, color: THEME_TOKENS.colors.textBright }}>
        <span style={{ display: 'block', fontSize: 11, color: THEME_TOKENS.colors.textSecondary, marginBottom: 4 }}>New news · {article.source}</span>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{article.title}</span>
      </button>
      <button type="button" onClick={onDismiss} className="tv-btn" aria-label="Dismiss news notification"
        style={{ padding: '4px 8px', fontSize: 16, color: THEME_TOKENS.colors.textSecondary }}>×</button>
    </div>
  )
}
