import React, { useState, useEffect } from 'react'
import { THEME_TOKENS } from '../../theme/tokens'
import { useMarketStore } from '../../stores/useMarketStore'

interface SnapshotModalProps {
  isOpen: boolean
  onClose: () => void
  dataUrl: string | null
}

export const SnapshotModal: React.FC<SnapshotModalProps> = ({ isOpen, onClose, dataUrl }) => {
  const { symbol, timeframe } = useMarketStore()
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [cloudUrl, setCloudUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setCopyStatus(null)
      setIsUploading(false)
      setCloudUrl(null)
    }
  }, [isOpen])

  if (!isOpen || !dataUrl) return null

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `PIA_${symbol || 'Chart'}_${timeframe}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setCopyStatus('Image downloaded!')
    setTimeout(() => onClose(), 1500)
  }

  const handleCopyImage = async () => {
    try {
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCopyStatus('Image copied to clipboard!')
        setTimeout(() => onClose(), 1500)
      } else {
        setCopyStatus('Clipboard API not supported')
      }
    } catch {
      setCopyStatus('Failed to copy image')
    }
  }

  const handleCopyLink = async () => {
    setIsUploading(true)
    setCopyStatus('Generating public chart link...')
    try {
      const res = await window.api.market.uploadSnapshot({
        image: dataUrl,
        symbol: symbol || undefined,
        timeframe
      })
      if (res && res.url) {
        setCloudUrl(res.url)
        await navigator.clipboard.writeText(res.url)
        setCopyStatus('Link copied to clipboard!')
      } else {
        setCopyStatus('Failed to upload snapshot')
      }
    } catch {
      setCopyStatus('Network error uploading snapshot')
    } finally {
      setIsUploading(false)
    }
  }

  const handleTweet = () => {
    const text = encodeURIComponent(`Trading analysis on $${symbol || 'MARKET'} (${timeframe}) via @PIATerminal\n\n`)
    const url = encodeURIComponent(cloudUrl || 'https://terminal.wign.dev')
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank')
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 480,
          backgroundColor: THEME_TOKENS.colors.bgSurface,
          border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
          borderRadius: 8,
          boxShadow: '0 16px 40px rgba(0,0,0,0.75)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={THEME_TOKENS.colors.accent}
              strokeWidth="2"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span style={{ fontWeight: 700, fontSize: 13, color: THEME_TOKENS.colors.textBright }}>
              Chart Snapshot ({symbol} · {timeframe})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: THEME_TOKENS.colors.textSecondary,
              cursor: 'pointer',
              fontSize: 16
            }}
          >
            ✕
          </button>
        </div>

        {/* Preview Thumbnail */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#0a0d14',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            maxHeight: 220,
            overflow: 'hidden'
          }}
        >
          <img
            src={dataUrl}
            alt="Chart Snapshot"
            style={{
              maxWidth: '100%',
              maxHeight: 200,
              borderRadius: 4,
              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              objectFit: 'contain'
            }}
          />
        </div>

        {/* Status Banner */}
        {copyStatus && (
          <div
            style={{
              padding: '6px 16px',
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: 'rgba(8, 153, 129, 0.15)',
              color: THEME_TOKENS.colors.bullish,
              textAlign: 'center'
            }}
          >
            {copyStatus}
          </div>
        )}

        {/* Action Menu Items (TradingView Standard) */}
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* 1. Copy Link */}
          <button
            type="button"
            onClick={handleCopyLink}
            disabled={isUploading}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: 'transparent',
              color: THEME_TOKENS.colors.textPrimary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'background-color 0.15s'
            }}
            className="tv-btn"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>Copy link to the chart image</div>
                <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                  {cloudUrl || 'Uploads and generates public shareable link'}
                </div>
              </div>
            </div>
            <span style={{ fontSize: 10, color: THEME_TOKENS.colors.accent, fontWeight: 700 }}>
              {isUploading ? 'Uploading...' : 'Link'}
            </span>
          </button>

          {/* 2. Download Image */}
          <button
            type="button"
            onClick={handleDownload}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: 'transparent',
              color: THEME_TOKENS.colors.textPrimary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
            className="tv-btn"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>Download image</div>
                <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                  Save high-resolution PNG to your computer
                </div>
              </div>
            </div>
            <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>PNG</span>
          </button>

          {/* 3. Copy Image */}
          <button
            type="button"
            onClick={handleCopyImage}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: 'transparent',
              color: THEME_TOKENS.colors.textPrimary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
            className="tv-btn"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>Copy chart image</div>
                <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                  Directly paste into Telegram, Discord, or WhatsApp (Ctrl+V)
                </div>
              </div>
            </div>
            <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>Clipboard</span>
          </button>

          {/* 4. Tweet / Share on X */}
          <button
            type="button"
            onClick={handleTweet}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: 'transparent',
              color: THEME_TOKENS.colors.textPrimary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
            className="tv-btn"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>Share on X (Twitter)</div>
                <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                  Tweet chart analysis with ticker
                </div>
              </div>
            </div>
            <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>Post</span>
          </button>
        </div>
      </div>
    </div>
  )
}
