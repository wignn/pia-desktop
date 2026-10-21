import React from 'react'
import { THEME_TOKENS } from '../../theme/tokens'

interface SplashScreenProps {
  statusText?: string
  progressPercent?: number
  isIndeterminate?: boolean
  version?: string
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  statusText = 'Initializing terminal...',
  progressPercent,
  isIndeterminate = true,
  version = '3.0.3'
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#080A0F',
        fontFamily: THEME_TOKENS.typography.fontSans,
        userSelect: 'none',
        overflow: 'hidden',
        position: 'relative'
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

      {/* Centered Discord / TradingView-style Splash Window */}
      <div
        style={{
          width: 340,
          backgroundColor: '#0C1017',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: '36px 32px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.85)',
          position: 'relative'
        }}
      >
        {/* Large Prominent PIA Emblem */}
        <div
          style={{
            animation: 'piaLogoPulse 2.8s ease-in-out infinite',
            marginBottom: 20
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
            <circle cx="34" cy="34" r="3.5" fill="#080A0F" />
            <defs>
              <linearGradient id="piaGoldGrad" x1="0" y1="0" x2="68" y2="68" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FDE68A" />
                <stop offset="0.5" stopColor="#D4AF37" />
                <stop offset="1" stopColor="#B45309" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: '0.14em',
            color: '#FFFFFF',
            textAlign: 'center',
            marginBottom: 6
          }}
        >
          PIA TERMINAL
        </div>

        {/* Subtitle / Status */}
        <div
          style={{
            fontSize: 12,
            color: '#838896',
            textAlign: 'center',
            height: 18,
            lineHeight: '18px',
            marginBottom: 22,
            fontFamily: THEME_TOKENS.typography.fontSans
          }}
        >
          {statusText}
        </div>

        {/* Minimal Progress Bar */}
        <div
          style={{
            width: '100%',
            height: 3,
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            borderRadius: 3,
            overflow: 'hidden',
            position: 'relative',
            marginBottom: 20
          }}
        >
          {isIndeterminate ? (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                backgroundColor: '#D4AF37',
                borderRadius: 3,
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
                width: `${Math.min(100, Math.max(0, progressPercent ?? 0))}%`,
                backgroundColor: '#10B981',
                borderRadius: 3,
                transition: 'width 0.2s ease-out'
              }}
            />
          )}
        </div>

        {/* Footer Version Tag */}
        <div
          style={{
            fontSize: 10,
            fontFamily: THEME_TOKENS.typography.fontMono,
            color: '#525766',
            letterSpacing: '0.04em'
          }}
        >
          v{version}
        </div>
      </div>
    </div>
  )
}
