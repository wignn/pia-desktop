import React from 'react'
import { THEME_TOKENS } from '../../theme/tokens'

interface SplashScreenProps {
  statusText?: string
  progressPercent?: number
  isIndeterminate?: boolean
  version?: string
  state?: string
  availableVersion?: string
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  statusText = 'Initializing terminal...',
  progressPercent,
  isIndeterminate = true,
  version = '3.0.5',
  state,
  availableVersion
}) => {
  const percent = Math.min(100, Math.max(0, progressPercent ?? 0))
  const isDownloading = state === 'downloading'
  const isDownloaded = state === 'downloaded'

  let cardTitle = 'Initializing Terminal'
  if (isDownloading) {
    cardTitle = `Downloading v${availableVersion || 'Update'}`
  } else if (isDownloaded) {
    cardTitle = 'Update Ready to Install'
  } else if (state === 'available') {
    cardTitle = `Update Available (v${availableVersion})`
  }

  return (
    <div
      data-tauri-drag-region
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#0D111A',
        color: '#F4F6FC',
        fontFamily: THEME_TOKENS.typography.fontSans,
        userSelect: 'none',
        overflow: 'hidden',
        position: 'relative',
        padding: '24px 22px 18px',
        boxSizing: 'border-box',
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}
    >
      <style>{`
        @keyframes piaLogoPulse {
          0%, 100% {
            transform: scale(1);
            filter: drop-shadow(0 0 16px rgba(212, 175, 55, 0.25));
          }
          50% {
            transform: scale(1.05);
            filter: drop-shadow(0 0 28px rgba(212, 175, 55, 0.45));
          }
        }
        @keyframes piaIndeterminateBar {
          0% {
            left: -40%;
            width: 40%;
          }
          50% {
            left: 30%;
            width: 60%;
          }
          100% {
            left: 100%;
            width: 40%;
          }
        }
      `}</style>

      {/* Custom Window Drag Handle & Close Button for Frameless Splash */}
      <div
        data-tauri-drag-region
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 36,
          cursor: 'grab',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 10,
          zIndex: 20
        }}
      >
        <button
          type="button"
          onClick={() => {
            window.api?.system?.closeApp?.()
          }}
          title="Close"
          aria-label="Close"
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: 'none',
            backgroundColor: 'transparent',
            color: '#64748B',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(244, 63, 94, 0.18)'
            e.currentTarget.style.color = '#F43F5E'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = '#64748B'
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Main Content Body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          width: '100%',
          marginTop: 8
        }}
      >
        {/* Animated Institutional PIA Terminal Glyph */}
        <div
          style={{
            position: 'relative',
            width: 72,
            height: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: -10,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(212, 175, 55, 0.22) 0%, transparent 70%)',
              filter: 'blur(8px)',
              pointerEvents: 'none'
            }}
          />

          <svg
            width="60"
            height="60"
            viewBox="0 0 100 100"
            fill="none"
            style={{
              animation: 'piaLogoPulse 2.8s ease-in-out infinite'
            }}
          >
            <polygon
              points="50,6 94,50 50,94 6,50"
              stroke="#D4AF37"
              strokeWidth="2.5"
              fill="rgba(212, 175, 55, 0.08)"
            />
            <polygon
              points="50,22 78,50 50,78 22,50"
              stroke="#FDE68A"
              strokeWidth="2"
              fill="rgba(212, 175, 55, 0.18)"
            />
            <polygon
              points="50,34 66,50 50,66 34,50"
              fill="#D4AF37"
            />
          </svg>
        </div>

        {/* Brand Header Pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 999
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 22 12 12 22 2 12" />
          </svg>
          <span
            style={{
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '0.1em',
              color: '#F4F6FC'
            }}
          >
            PIA TERMINAL
          </span>
          <span
            style={{
              fontSize: 10,
              fontFamily: THEME_TOKENS.typography.fontMono,
              color: '#64748B'
            }}
          >
            v{version}
          </span>
        </div>

        {/* Status Headings */}
        <div style={{ textAlign: 'center', width: '100%' }}>
          <h1
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: '#FFFFFF',
              margin: '0 0 4px 0'
            }}
          >
            {cardTitle}
          </h1>
          <p
            style={{
              fontSize: 11,
              color: isDownloading ? '#10B981' : '#838896',
              margin: 0,
              lineHeight: 1.4,
              minHeight: 18
            }}
          >
            {statusText}
          </p>
        </div>

        {/* Progress Bar & Percentage */}
        <div style={{ width: '100%' }}>
          <div
            style={{
              width: '100%',
              height: 4,
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              borderRadius: 4,
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            {isIndeterminate && !isDownloading ? (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  backgroundColor: '#D4AF37',
                  borderRadius: 4,
                  animation: 'piaIndeterminateBar 1.4s ease-in-out infinite'
                }}
              />
            ) : (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: `${percent}%`,
                  backgroundColor: '#10B981',
                  borderRadius: 4,
                  transition: 'width 0.25s ease-out'
                }}
              />
            )}
          </div>

          {isDownloading && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 8,
                fontSize: 11,
                fontFamily: THEME_TOKENS.typography.fontMono,
                color: '#64748B'
              }}
            >
              <span>Downloading update package</span>
              <span style={{ color: '#10B981', fontWeight: 600 }}>{percent}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Security & Engine Footnote */}
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          paddingTop: 10,
          width: '100%',
          textAlign: 'center',
          fontSize: 10,
          fontFamily: THEME_TOKENS.typography.fontMono,
          color: '#525766'
        }}
      >
        Quantitative Trading &amp; Real-time Engine
      </div>
    </div>
  )
}
