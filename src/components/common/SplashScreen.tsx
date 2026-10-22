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
  version = '3.0.4',
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
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        backgroundColor: '#07090E',
        backgroundImage:
          'radial-gradient(circle at 50% 45%, rgba(212, 175, 55, 0.05) 0%, rgba(13, 17, 26, 0.8) 55%, #07090E 100%)',
        color: '#F4F6FC',
        fontFamily: THEME_TOKENS.typography.fontSans,
        userSelect: 'none',
        overflow: 'hidden',
        position: 'relative',
        padding: 20,
        boxSizing: 'border-box'
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

      {/* Focused Splash & Update Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 390,
          backgroundColor: '#0D111A',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          borderRadius: 12,
          padding: '36px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 1px 1px rgba(255, 255, 255, 0.04)',
          position: 'relative',
          zIndex: 10
        }}
      >
        {/* Glowing Geometric PIA Emblem */}
        <div
          style={{
            animation: 'piaLogoPulse 2.8s ease-in-out infinite',
            marginTop: 4,
            marginBottom: 2
          }}
        >
          <svg width="68" height="68" viewBox="0 0 68 68" fill="none">
            {/* Outer Diamond */}
            <rect
              x="34"
              y="4"
              width="42.4"
              height="42.4"
              transform="rotate(45 34 4)"
              stroke="url(#piaGoldGrad)"
              strokeWidth="2.5"
              fill="rgba(212, 175, 55, 0.06)"
            />
            {/* Inner Core Diamond */}
            <rect
              x="34"
              y="16"
              width="25.4"
              height="25.4"
              transform="rotate(45 34 16)"
              fill="url(#piaGoldGrad)"
            />
            {/* Center Terminal Accent */}
            <circle cx="34" cy="34" r="3.5" fill="#07090E" />
            <defs>
              <linearGradient id="piaGoldGrad" x1="0" y1="0" x2="68" y2="68" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FDE68A" />
                <stop offset="0.5" stopColor="#D4AF37" />
                <stop offset="1" stopColor="#B45309" />
              </linearGradient>
            </defs>
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
          <span style={{ color: '#D4AF37', fontSize: 13 }}>◈</span>
          <span
            style={{
              fontWeight: 700,
              fontSize: 12,
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
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: '#FFFFFF',
              margin: '0 0 6px 0'
            }}
          >
            {cardTitle}
          </h1>
          <p
            style={{
              fontSize: 12,
              color: isDownloading ? '#10B981' : '#838896',
              margin: 0,
              lineHeight: 1.5,
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

        {/* Security & Engine Footnote */}
        <div
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            paddingTop: 12,
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
    </div>
  )
}
