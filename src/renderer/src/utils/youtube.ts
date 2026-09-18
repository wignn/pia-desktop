export const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com'

const EXACT_YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/

/**
 * Parses bare 11-char video IDs and standard YouTube URLs
 * (youtu.be, watch?v=, embed, live, shorts).
 * Returns the exact 11-character video ID, or null if invalid.
 */
export function parseYouTubeId(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null

  // 1. Bare 11-character YouTube video ID
  if (EXACT_YOUTUBE_ID_REGEX.test(trimmed)) {
    return trimmed
  }

  // 2. Parse URL formats
  let parsed: URL
  try {
    parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  const hostname = parsed.hostname.toLowerCase()

  // youtu.be/<id>
  if (hostname === 'youtu.be' || hostname.endsWith('.youtu.be')) {
    const firstSegment = parsed.pathname.split('/').filter(Boolean)[0]
    return firstSegment && EXACT_YOUTUBE_ID_REGEX.test(firstSegment) ? firstSegment : null
  }

  // youtube.com / youtube-nocookie.com
  if (
    hostname === 'youtube.com' ||
    hostname.endsWith('.youtube.com') ||
    hostname === 'youtube-nocookie.com' ||
    hostname.endsWith('.youtube-nocookie.com')
  ) {
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (segments.length === 0) return null

    // /watch?v=<id>
    if (segments[0] === 'watch') {
      const v = parsed.searchParams.get('v')
      return v && EXACT_YOUTUBE_ID_REGEX.test(v) ? v : null
    }

    // /embed/<id>, /live/<id>, /shorts/<id>
    if (segments[0] === 'embed' || segments[0] === 'live' || segments[0] === 'shorts') {
      const id = segments[1]
      return id && EXACT_YOUTUBE_ID_REGEX.test(id) ? id : null
    }
  }

  return null
}

/**
 * Builds standard embed URL with initial mute state and JavaScript API enabled.
 */
export function buildYouTubeEmbedUrl(
  videoId: string,
  options: {
    muted?: boolean
    autoplay?: boolean
    controls?: boolean
    modestbranding?: boolean
    rel?: boolean
    playsinline?: boolean
    enablejsapi?: boolean
  } = {}
): string {
  const {
    muted = true,
    autoplay = true,
    controls = true,
    modestbranding = true,
    rel = false,
    playsinline = true,
    enablejsapi = true
  } = options

  const params = new URLSearchParams()
  if (autoplay) params.set('autoplay', '1')
  params.set('mute', muted ? '1' : '0')
  if (controls) params.set('controls', '1')
  if (modestbranding) params.set('modestbranding', '1')
  params.set('rel', rel ? '1' : '0')
  if (playsinline) params.set('playsinline', '1')
  if (enablejsapi) params.set('enablejsapi', '1')

  return `${YOUTUBE_ORIGIN}/embed/${videoId}?${params.toString()}`
}

/**
 * Sends a player command to a YouTube iframe via postMessage without reloading.
 */
export function sendYouTubePlayerCommand(
  iframe: HTMLIFrameElement | null,
  command: 'mute' | 'unMute' | string,
  args: unknown[] = [],
  origin: string = YOUTUBE_ORIGIN
): void {
  if (!iframe?.contentWindow) return
  iframe.contentWindow.postMessage(
    JSON.stringify({
      event: 'command',
      func: command,
      args
    }),
    origin
  )
}
