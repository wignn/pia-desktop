import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NewsNotificationBanner } from './NewsNotificationBanner'
import type { NewsArticle } from '@shared/types'

const article: NewsArticle = {
  id: 'gold', title: 'Gold rises after CPI', summary: 'Market update',
  source: 'Reuters', url: 'https://example.com/gold', publishedAt: 1794398400000
}

describe('news notification banner', () => {
  it('announces a headline and source with accessible open and dismiss actions', () => {
    const markup = renderToStaticMarkup(<NewsNotificationBanner article={article} onOpen={() => {}} onDismiss={() => {}} />)
    expect(markup).toContain('Gold rises after CPI')
    expect(markup).toContain('Reuters')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-label="Dismiss news notification"')
    expect(markup).toContain('aria-label="Open news: Gold rises after CPI"')
  })

  it('routes each action to the selected headline without opening external content', () => {
    const onOpen = vi.fn()
    const onDismiss = vi.fn()
    const element = NewsNotificationBanner({ article, onOpen, onDismiss })
    const buttons = element.props.children
    buttons[0].props.onClick()
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onDismiss).not.toHaveBeenCalled()
    buttons[1].props.onClick()
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
