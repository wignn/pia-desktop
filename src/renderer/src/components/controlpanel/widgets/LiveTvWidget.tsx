import React, { useState, useRef, useMemo, useEffect } from 'react'
import {
  parseYouTubeId,
  buildYouTubeEmbedUrl,
  sendYouTubePlayerCommand
} from '../../../utils/youtube'

interface StreamChannel {
  id: string
  name: string
  youtubeId: string
  badge: string
}

const CHANNELS: StreamChannel[] = [
  { id: 'bloomberg_live', name: 'Bloomberg Live', youtubeId: 'QB5BNdBFujE', badge: 'LIVE' },
  { id: 'cnbc', name: 'CNBC', youtubeId: '9NyxcX14vhk', badge: 'US' },
  { id: 'cnbc_id', name: 'CNBC ID', youtubeId: 'XMjM1m3jXkc', badge: 'ID' },
  { id: 'idx_live', name: 'IDX Channel', youtubeId: 'W1Y_L9c_9lA', badge: 'IDX' },
  { id: 'yahoo', name: 'Yahoo Finance', youtubeId: '141xLq6wY4k', badge: 'US' }
]

function resolveChannel(rawId?: string): { isCustom: boolean; customId: string; activeId: string } {
  if (rawId?.startsWith('custom:')) {
    const parsedCustom = parseYouTubeId(rawId.slice(7))
    if (parsedCustom) {
      return { isCustom: true, customId: parsedCustom, activeId: 'custom' }
    }
  }
  const matched = CHANNELS.find((c) => c.id === rawId)
  return {
    isCustom: false,
    customId: 'QB5BNdBFujE',
    activeId: matched ? matched.id : CHANNELS[0].id
  }
}

export const LiveTvWidget: React.FC<{
  channelId?: string
  onUpdateChannel?: (id: string) => void
}> = ({ channelId = 'bloomberg_live', onUpdateChannel }) => {
  const [prevPropChannelId, setPrevPropChannelId] = useState(channelId)
  const [activeChannelId, setActiveChannelId] = useState<string>(
    () => resolveChannel(channelId).activeId
  )
  const [customYtId, setCustomYtId] = useState<string>(() => resolveChannel(channelId).customId)
  const [isCustomInputOpen, setIsCustomInputOpen] = useState(false)
  const [customInputVal, setCustomInputVal] = useState('')
  const [isMuted, setIsMuted] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const hasMountedRef = useRef(false)

  // React to prop updates and restore custom:<id> correctly during render
  if (channelId !== prevPropChannelId) {
    setPrevPropChannelId(channelId)
    const resolved = resolveChannel(channelId)
    setActiveChannelId(resolved.activeId)
    if (resolved.isCustom) {
      setCustomYtId(resolved.customId)
    }
  }

  const activeChannel = CHANNELS.find((c) => c.id === activeChannelId)
  const currentVideoId =
    activeChannelId === 'custom' ? customYtId : activeChannel?.youtubeId || CHANNELS[0].youtubeId

  // Track initial mute for currently mounted video ID so mute toggles do not reload iframe
  const [videoSession, setVideoSession] = useState(() => ({
    videoId: currentVideoId,
    initialMuted: isMuted
  }))

  if (videoSession.videoId !== currentVideoId) {
    setVideoSession({
      videoId: currentVideoId,
      initialMuted: isMuted
    })
  }

  const embedSrc = useMemo(() => {
    return buildYouTubeEmbedUrl(videoSession.videoId, {
      muted: videoSession.initialMuted,
      autoplay: true,
      controls: true,
      modestbranding: true,
      rel: false,
      playsinline: true,
      enablejsapi: true
    })
  }, [videoSession.videoId, videoSession.initialMuted])

  // Mute / unmute via ref postMessage without reload
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }
    sendYouTubePlayerCommand(iframeRef.current, isMuted ? 'mute' : 'unMute')
  }, [isMuted])

  const handleSelectChannel = (id: string): void => {
    setIsPlaying(false)
    setActiveChannelId(id)
    if (onUpdateChannel) onUpdateChannel(id)
  }

  const handleApplyCustomUrl = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!customInputVal.trim()) return
    const vid = parseYouTubeId(customInputVal)
    if (!vid) return
    setCustomYtId(vid)
    setActiveChannelId('custom')
    setIsCustomInputOpen(false)
    setIsPlaying(true)
    if (onUpdateChannel) onUpdateChannel(`custom:${vid}`)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#000000'
      }}
    >
      {/* Top Channel Navigation Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 8px',
          backgroundColor: '#131722',
          borderBottom: '1px solid #2a2e39',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          flexShrink: 0
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#f23645',
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f23645' }} />
          LIVE
        </span>

        {CHANNELS.map((ch) => {
          const isActive = ch.id === activeChannelId
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => handleSelectChannel(ch.id)}
              style={{
                padding: '2px 7px',
                borderRadius: 3,
                fontSize: 10,
                fontWeight: isActive ? 700 : 500,
                border: isActive ? '1px solid #2962ff' : '1px solid #2a2e39',
                backgroundColor: isActive ? 'rgba(41, 98, 255, 0.2)' : '#1e222d',
                color: isActive ? '#2962ff' : '#d1d4dc',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {ch.name}
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => setIsCustomInputOpen((prev) => !prev)}
          title="Paste custom YouTube link"
          style={{
            padding: '2px 7px',
            borderRadius: 3,
            fontSize: 10,
            fontWeight: activeChannelId === 'custom' ? 700 : 500,
            border: activeChannelId === 'custom' ? '1px solid #089981' : '1px solid #2a2e39',
            backgroundColor: activeChannelId === 'custom' ? 'rgba(8, 153, 129, 0.2)' : '#1e222d',
            color: activeChannelId === 'custom' ? '#089981' : '#787b86',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          🔗 Custom URL
        </button>

        <button
          type="button"
          onClick={() => setIsPlaying((playing) => !playing)}
          title={isPlaying ? 'Stop and unload stream' : 'Play stream'}
          style={{
            marginLeft: 'auto',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 600,
            border: '1px solid #2a2e39',
            backgroundColor: '#1e222d',
            color: isPlaying ? '#f23645' : '#089981',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          {isPlaying ? '■ STOP' : '▶ PLAY'}
        </button>

        <button
          type="button"
          onClick={() => setIsMuted((prev) => !prev)}
          disabled={!isPlaying}
          title={isMuted ? 'Click to Unmute Audio' : 'Click to Mute Audio'}
          style={{
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 600,
            border: isMuted ? '1px solid #f23645' : '1px solid #089981',
            backgroundColor: isMuted ? 'rgba(242, 54, 69, 0.15)' : 'rgba(8, 153, 129, 0.15)',
            color: isMuted ? '#f23645' : '#089981',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          {isMuted ? '🔇 MUTED' : '🔊 SOUND'}
        </button>

        <a
          href={`https://www.youtube.com/watch?v=${currentVideoId}`}
          target="_blank"
          rel="noreferrer"
          title="Open stream in external browser window"
          style={{
            padding: '2px 6px',
            borderRadius: 3,
            fontSize: 10,
            color: '#787b86',
            border: '1px solid #2a2e39',
            backgroundColor: '#1e222d',
            textDecoration: 'none',
            cursor: 'pointer'
          }}
        >
          ↗
        </a>
      </div>

      {/* Custom URL Input Bar */}
      {isCustomInputOpen && (
        <form
          onSubmit={handleApplyCustomUrl}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            backgroundColor: '#181d28',
            borderBottom: '1px solid #2a2e39'
          }}
        >
          <input
            type="text"
            value={customInputVal}
            onChange={(e) => setCustomInputVal(e.target.value)}
            placeholder="Paste YouTube live link (e.g. https://www.youtube.com/live/...)"
            style={{
              flex: 1,
              backgroundColor: '#131722',
              border: '1px solid #2a2e39',
              borderRadius: 3,
              padding: '3px 8px',
              fontSize: 10,
              color: '#ffffff',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            style={{
              padding: '3px 8px',
              borderRadius: 3,
              backgroundColor: '#089981',
              color: '#ffffff',
              border: 'none',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Play
          </button>
        </form>
      )}

      {/* Responsive YouTube Embed */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          width: '100%',
          minHeight: 0,
          backgroundColor: '#000'
        }}
      >
        {isPlaying ? (
          <iframe
            ref={iframeRef}
            key={currentVideoId}
            src={embedSrc}
            title="Financial Live Broadcast"
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
        ) : (
          <button
            type="button"
            onClick={() => setIsPlaying(true)}
            style={{
              position: 'absolute',
              inset: 0,
              margin: 'auto',
              width: 120,
              height: 38,
              border: '1px solid #2962ff',
              borderRadius: 4,
              backgroundColor: '#1e222d',
              color: '#ffffff',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            ▶ Play Stream
          </button>
        )}
      </div>
    </div>
  )
}

export default LiveTvWidget
