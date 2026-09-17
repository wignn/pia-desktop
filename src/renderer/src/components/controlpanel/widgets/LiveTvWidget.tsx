import React, { useState } from 'react'

interface StreamChannel {
  id: string
  name: string
  youtubeId: string
  badge: string
}

const CHANNELS: StreamChannel[] = [
  { id: 'bloomberg', name: 'Bloomberg TV', youtubeId: 'dp8PhLsUcFE', badge: 'US' },
  { id: 'cnbc', name: 'CNBC Live', youtubeId: '9NyxcX14vhk', badge: 'US' },
  { id: 'cnbc_id', name: 'CNBC Indonesia', youtubeId: 'XMjM1m3jXkc', badge: 'ID' },
  { id: 'idx_live', name: 'IDX Channel', youtubeId: 'W1Y_L9c_9lA', badge: 'IDX' },
  { id: 'yahoo', name: 'Yahoo Finance', youtubeId: '141xLq6wY4k', badge: 'US' },
  { id: 'fed', name: 'Fed Live', youtubeId: '19106093498', badge: 'FED' }
]

export const LiveTvWidget: React.FC<{
  channelId?: string
  onUpdateChannel?: (id: string) => void
}> = ({ channelId = 'bloomberg', onUpdateChannel }) => {
  const [activeChannelId, setActiveChannelId] = useState(channelId)
  const [isMuted, setIsMuted] = useState(true)

  const activeChannel = CHANNELS.find((c) => c.id === activeChannelId) || CHANNELS[0]

  const handleSelectChannel = (id: string) => {
    setActiveChannelId(id)
    if (onUpdateChannel) onUpdateChannel(id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', backgroundColor: '#000000' }}>
      {/* Top Channel Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          backgroundColor: '#131722',
          borderBottom: '1px solid #2a2e39',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          flexShrink: 0
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: '#f23645', display: 'flex', alignItems: 'center', gap: 4 }}>
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
                padding: '2px 8px',
                borderRadius: 3,
                fontSize: 10,
                fontWeight: isActive ? 700 : 500,
                border: isActive ? '1px solid #2962ff' : '1px solid #2a2e39',
                backgroundColor: isActive ? 'rgba(41, 98, 255, 0.18)' : '#1e222d',
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
          onClick={() => setIsMuted((prev) => !prev)}
          title={isMuted ? 'Click to Unmute Audio' : 'Click to Mute Audio'}
          style={{
            marginLeft: 'auto',
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
          {isMuted ? '🔇 MUTED' : '🔊 LIVE SOUND'}
        </button>
      </div>

      {/* Responsive YouTube Embed */}
      <div style={{ flex: 1, position: 'relative', width: '100%', minHeight: 0, backgroundColor: '#000' }}>
        <iframe
          key={`${activeChannel.youtubeId}-${isMuted ? 'm' : 'u'}`}
          src={`https://www.youtube-nocookie.com/embed/${activeChannel.youtubeId}?autoplay=1&mute=${isMuted ? '1' : '0'}&controls=1&modestbranding=1&rel=0`}
          title={activeChannel.name}
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
    </div>
  )
}
