import { describe, it, expect, vi } from 'vitest'
import {
  parseYouTubeId,
  buildYouTubeEmbedUrl,
  sendYouTubePlayerCommand,
  YOUTUBE_ORIGIN
} from './youtube'

describe('parseYouTubeId', () => {
  const validId = 'QB5BNdBFujE'

  it('parses bare 11-character video IDs', () => {
    expect(parseYouTubeId(validId)).toBe(validId)
    expect(parseYouTubeId('9NyxcX14vhk')).toBe('9NyxcX14vhk')
    expect(parseYouTubeId('XMjM1m3jXkc')).toBe('XMjM1m3jXkc')
    expect(parseYouTubeId('a-Z_0123459')).toBe('a-Z_0123459')
  })

  it('parses youtu.be URLs', () => {
    expect(parseYouTubeId(`https://youtu.be/${validId}`)).toBe(validId)
    expect(parseYouTubeId(`https://youtu.be/${validId}?t=120`)).toBe(validId)
    expect(parseYouTubeId(`http://youtu.be/${validId}`)).toBe(validId)
    expect(parseYouTubeId(`youtu.be/${validId}`)).toBe(validId)
    expect(parseYouTubeId(`https://youtu.be/${validId}/`)).toBe(validId)
  })

  it('parses youtube.com watch URLs with query parameters', () => {
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${validId}`)).toBe(validId)
    expect(parseYouTubeId(`https://youtube.com/watch?v=${validId}`)).toBe(validId)
    expect(parseYouTubeId(`https://m.youtube.com/watch?v=${validId}`)).toBe(validId)
    expect(parseYouTubeId(`www.youtube.com/watch?v=${validId}`)).toBe(validId)
    expect(parseYouTubeId(`https://www.youtube.com/watch?feature=shared&v=${validId}&t=45`)).toBe(
      validId
    )
  })

  it('parses youtube embed URLs', () => {
    expect(parseYouTubeId(`https://www.youtube.com/embed/${validId}`)).toBe(validId)
    expect(parseYouTubeId(`https://www.youtube-nocookie.com/embed/${validId}`)).toBe(validId)
    expect(parseYouTubeId(`https://youtube.com/embed/${validId}?autoplay=1`)).toBe(validId)
  })

  it('parses youtube live URLs', () => {
    expect(parseYouTubeId(`https://www.youtube.com/live/${validId}`)).toBe(validId)
    expect(parseYouTubeId(`https://youtube.com/live/${validId}?feature=share`)).toBe(validId)
    expect(parseYouTubeId(`youtube.com/live/${validId}`)).toBe(validId)
  })

  it('parses youtube shorts URLs', () => {
    expect(parseYouTubeId(`https://www.youtube.com/shorts/${validId}`)).toBe(validId)
    expect(parseYouTubeId(`youtube.com/shorts/${validId}`)).toBe(validId)
  })

  it('returns null for invalid inputs', () => {
    expect(parseYouTubeId('')).toBeNull()
    expect(parseYouTubeId('   ')).toBeNull()
    expect(parseYouTubeId(null)).toBeNull()
    expect(parseYouTubeId(undefined)).toBeNull()
    expect(parseYouTubeId('tooShort')).toBeNull()
    expect(parseYouTubeId('wayTooLongVideoId12345')).toBeNull()
    expect(parseYouTubeId('invalid!char')).toBeNull()
    expect(parseYouTubeId('https://example.com/watch?v=QB5BNdBFujE')).toBeNull()
    expect(parseYouTubeId('https://www.youtube.com/feed/trending')).toBeNull()
    expect(parseYouTubeId('https://www.youtube.com/watch?v=')).toBeNull()
    expect(parseYouTubeId('https://www.youtube.com/watch')).toBeNull()
    expect(parseYouTubeId('https://youtu.be/')).toBeNull()
    expect(parseYouTubeId('https://www.youtube.com/embed/')).toBeNull()
    expect(parseYouTubeId('https://www.youtube.com/live/')).toBeNull()
    expect(parseYouTubeId('https://www.youtube.com/shorts/')).toBeNull()
  })
})

describe('buildYouTubeEmbedUrl', () => {
  it('builds nocookie embed URL with initial mute and jsapi enabled', () => {
    const url = buildYouTubeEmbedUrl('QB5BNdBFujE', { muted: true })
    expect(url).toContain('https://www.youtube-nocookie.com/embed/QB5BNdBFujE')
    expect(url).toContain('mute=1')
    expect(url).toContain('enablejsapi=1')
    expect(url).toContain('autoplay=1')
  })

  it('supports unmuted initial state', () => {
    const url = buildYouTubeEmbedUrl('QB5BNdBFujE', { muted: false })
    expect(url).toContain('mute=0')
  })
})

describe('sendYouTubePlayerCommand', () => {
  it('sends JSON postMessage command to iframe contentWindow', () => {
    const postMessage = vi.fn()
    const mockIframe = {
      contentWindow: { postMessage }
    } as unknown as HTMLIFrameElement

    sendYouTubePlayerCommand(mockIframe, 'unMute')

    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'command',
        func: 'unMute',
        args: []
      }),
      YOUTUBE_ORIGIN
    )
  })

  it('safely handles null iframe or contentWindow', () => {
    expect(() => sendYouTubePlayerCommand(null, 'mute')).not.toThrow()
    expect(() =>
      sendYouTubePlayerCommand({ contentWindow: null } as unknown as HTMLIFrameElement, 'mute')
    ).not.toThrow()
  })
})
