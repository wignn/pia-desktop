import React, { useState, useEffect, useId } from 'react'
import { THEME_TOKENS } from '../../theme/tokens'

interface StreamChannel {
  id: string
  name: string
  category: 'markets' | 'news' | 'macro'
  youtubeId: string
  description: string
}

const PRESET_CHANNELS: StreamChannel[] = [
  {
    id: 'user_live',
    name: 'Global Financial Live',
    category: 'markets',
    youtubeId: 'QB5BNdBFujE',
    description: '24/7 Live Financial News & Market Coverage'
  },
  {
    id: 'bloomberg',
    name: 'Bloomberg Television',
    category: 'markets',
    youtubeId: 'dp8PhLsUcFE',
    description: '24/7 Global Business, Markets & Economic News'
  },
  {
    id: 'cnbc',
    name: 'CNBC International',
    category: 'news',
    youtubeId: '9NyxcX14vhk',
    description: 'Live Financial News, Wall St Opening & Closing Bell'
  },
  {
    id: 'yahoo_finance',
    name: 'Yahoo Finance Live',
    category: 'markets',
    youtubeId: '141xLq6wY4k',
    description: 'US Equity Action, Ticker Breakdown & Earnings Coverage'
  },
  {
    id: 'fed_reserve',
    name: 'Federal Reserve Live',
    category: 'macro',
    youtubeId: '19106093498',
    description: 'FOMC Rate Decisions & Fed Chair Press Conferences'
  },
  {
    id: 'cnbc_indonesia',
    name: 'CNBC Indonesia Live',
    category: 'markets',
    youtubeId: 'XMjM1m3jXkc',
    description: 'Pasar Saham Indonesia, IHSG, Berita Finansial & Makro'
  },
  {
    id: 'idx_channel',
    name: 'IDX Channel Live',
    category: 'markets',
    youtubeId: 'hjCkB9XRpkU',
    description: 'Siaran Langsung Bursa Efek Indonesia, Perdagangan & Emiten'
  }
]

export const LiveStreamPanel: React.FC = () => {
  const customInputId = useId()
  const [selectedChannel, setSelectedChannel] = useState<string>('bloomberg')
  const [customYoutubeId, setCustomYoutubeId] = useState<string>('')
  const [customInput, setCustomInput] = useState<string>('')
  const [isMuted, setIsMuted] = useState<boolean>(true)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pia-live-stream')
      if (saved) setSelectedChannel(saved)
      const savedCustom = localStorage.getItem('pia-live-custom')
      if (savedCustom) {
        setCustomYoutubeId(savedCustom)
        setCustomInput(savedCustom)
      }
    } catch {
      // ignore
    }
  }, [])

  const handleSelectChannel = (id: string) => {
    setSelectedChannel(id)
    try {
      localStorage.setItem('pia-live-stream', id)
    } catch {
      // ignore
    }
  }

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = extractYoutubeId(customInput)
    if (clean) {
      setCustomYoutubeId(clean)
      setSelectedChannel('custom')
      try {
        localStorage.setItem('pia-live-stream', 'custom')
        localStorage.setItem('pia-live-custom', clean)
      } catch {
        // ignore
      }
    }
  }

  const extractYoutubeId = (urlOrId: string): string => {
    const trimmed = urlOrId.trim()
    if (!trimmed) return ''
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed
    const match = trimmed.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|live\/|shorts\/))([a-zA-Z0-9_-]{11})/
    )
    return match ? match[1] : trimmed
  }

  const activeChannel = PRESET_CHANNELS.find((c) => c.id === selectedChannel)
  const currentVideoId =
    selectedChannel === 'custom'
      ? customYoutubeId || PRESET_CHANNELS[0].youtubeId
      : activeChannel?.youtubeId || PRESET_CHANNELS[0].youtubeId

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        color: THEME_TOKENS.colors.textPrimary,
        fontSize: 12,
        userSelect: 'none'
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 40,
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: THEME_TOKENS.colors.bearish, fontWeight: 700, fontSize: 13 }}>
            ●
          </span>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.02em' }}>
            Live Broadcast
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 3,
              backgroundColor: 'rgba(242, 54, 69, 0.15)',
              color: THEME_TOKENS.colors.bearish
            }}
          >
            LIVE
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: isMuted ? THEME_TOKENS.colors.bearish : THEME_TOKENS.colors.bullish,
              fontSize: 13,
              fontWeight: 600
            }}
          >
            {isMuted ? '🔇 Muted' : '🔊 Audio'}
          </button>
          <a
            href={`https://www.youtube.com/watch?v=${currentVideoId}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Browser"
            style={{
              color: THEME_TOKENS.colors.textSecondary,
              textDecoration: 'none',
              fontSize: 12
            }}
          >
            ↗
          </a>
        </div>
      </div>

      {/* Preset Channel Pills */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          backgroundColor: THEME_TOKENS.colors.bgApp,
          flexShrink: 0,
          scrollbarWidth: 'none'
        }}
      >
        {PRESET_CHANNELS.map((ch) => {
          const isActive = selectedChannel === ch.id
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => handleSelectChannel(ch.id)}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: isActive
                  ? THEME_TOKENS.colors.accent
                  : THEME_TOKENS.colors.bgSurfaceHover,
                color: isActive ? '#ffffff' : THEME_TOKENS.colors.textSecondary
              }}
            >
              {ch.name}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => handleSelectChannel('custom')}
          style={{
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            border: 'none',
            cursor: 'pointer',
            backgroundColor:
              selectedChannel === 'custom'
                ? THEME_TOKENS.colors.accent
                : THEME_TOKENS.colors.bgSurfaceHover,
            color: selectedChannel === 'custom' ? '#ffffff' : THEME_TOKENS.colors.textSecondary
          }}
        >
          Custom
        </button>
      </div>

      {/* Custom Stream Input Form */}
      {selectedChannel === 'custom' && (
        <form
          onSubmit={handleCustomSubmit}
          style={{
            padding: '8px 10px',
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            display: 'flex',
            gap: 6,
            backgroundColor: THEME_TOKENS.colors.bgSurface
          }}
        >
          <label htmlFor={customInputId} style={{ display: 'none' }}>
            YouTube URL
          </label>
          <input
            id={customInputId}
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Paste YouTube Live URL or ID..."
            style={{
              flex: 1,
              padding: '4px 8px',
              borderRadius: 4,
              fontSize: 11,
              outline: 'none',
              border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
              backgroundColor: THEME_TOKENS.colors.bgApp,
              color: THEME_TOKENS.colors.textPrimary
            }}
          />
          <button
            type="submit"
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: THEME_TOKENS.colors.accent,
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Load
          </button>
        </form>
      )}

      {/* Video IFrame Container */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          backgroundColor: '#000000',
          overflow: 'hidden'
        }}
      >
        <iframe
          key={`${currentVideoId}-${isMuted}`}
          src={`https://www.youtube-nocookie.com/embed/${currentVideoId}?autoplay=1&mute=${
            isMuted ? '1' : '0'
          }&playsinline=1&rel=0&modestbranding=1&enablejsapi=1`}
          title={activeChannel?.name || 'YouTube Live'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 'none'
          }}
        />
      </div>

      {/* Footer Info */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: THEME_TOKENS.colors.bgSurface,
          flexShrink: 0
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 11 }}>
          {selectedChannel === 'custom' ? 'Custom Live Stream' : activeChannel?.name}
        </div>
        <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
          {isMuted ? 'Audio Muted' : 'Audio Active'}
        </div>
      </div>
    </div>
  )
}
