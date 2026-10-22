import React from 'react'
import { useUpdaterStore } from '../../stores/useUpdaterStore'
import { THEME_TOKENS } from '../../theme/tokens'

export const UpdateNotificationBanner: React.FC<{ top?: number }> = ({ top = 52 }) => {
  const status = useUpdaterStore((state) => state.status)
  const isBannerDismissed = useUpdaterStore((state) => state.isBannerDismissed)
  const dismissBanner = useUpdaterStore((state) => state.dismissBanner)
  const installUpdate = useUpdaterStore((state) => state.installUpdate)
  const checkForUpdates = useUpdaterStore((state) => state.checkForUpdates)

  // Only show when there is an active event (available, downloading, downloaded, or error)
  const isVisible =
    !isBannerDismissed &&
    (status.state === 'available' ||
      status.state === 'downloading' ||
      status.state === 'downloaded' ||
      status.state === 'error')

  if (!isVisible) {
    return null
  }

  const percent = Math.min(100, Math.max(0, status.progressPercent ?? 0))
  const version = status.availableVersion || 'latest'

  return (
    <div
      role="region"
      aria-label="App Update Notification"
      style={{
        position: 'fixed',
        top,
        right: 16,
        zIndex: 9999,
        width: 320,
        backgroundColor: 'rgba(19, 23, 34, 0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${
          status.state === 'downloaded'
            ? 'rgba(38, 166, 154, 0.6)'
            : status.state === 'error'
              ? 'rgba(239, 83, 80, 0.6)'
              : 'rgba(41, 98, 255, 0.5)'
        }`,
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        padding: '12px 14px',
        color: THEME_TOKENS.colors.textPrimary,
        fontFamily: THEME_TOKENS.typography.fontSans,
        fontSize: 12,
        animation: 'fadeInSlide 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <style>{`
        @keyframes fadeInSlide {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmerPulse {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulseDownload {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.15); opacity: 1; }
        }
      `}</style>

      {/* Header Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Status Icon */}
          {status.state === 'downloaded' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                borderRadius: '50%',
                backgroundColor: 'rgba(38, 166, 154, 0.2)',
                color: THEME_TOKENS.colors.bullish,
                fontSize: 11,
                fontWeight: 700
              }}
            >
              ✓
            </span>
          ) : status.state === 'error' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 83, 80, 0.2)',
                color: THEME_TOKENS.colors.bearish,
                fontSize: 11,
                fontWeight: 700
              }}
            >
              !
            </span>
          ) : (
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: THEME_TOKENS.colors.accent,
                boxShadow: `0 0 8px ${THEME_TOKENS.colors.accent}`,
                animation: 'pulseDownload 1.5s infinite ease-in-out'
              }}
            />
          )}

          <span style={{ fontWeight: 600, fontSize: 12 }}>
            {status.state === 'downloaded'
              ? 'Update Ready'
              : status.state === 'error'
                ? 'Update Failed'
                : 'Update Available'}
          </span>

          <span
            style={{
              fontSize: 10,
              padding: '1px 5px',
              borderRadius: 3,
              backgroundColor:
                status.state === 'downloaded'
                  ? 'rgba(38, 166, 154, 0.2)'
                  : 'rgba(41, 98, 255, 0.2)',
              color:
                status.state === 'downloaded'
                  ? THEME_TOKENS.colors.bullish
                  : THEME_TOKENS.colors.accent,
              fontWeight: 600
            }}
          >
            v{version}
          </span>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={dismissBanner}
          title="Dismiss notification"
          style={{
            background: 'none',
            border: 'none',
            color: THEME_TOKENS.colors.textMuted,
            cursor: 'pointer',
            padding: '2px 4px',
            fontSize: 13,
            lineHeight: 1,
            borderRadius: 3
          }}
        >
          ✕
        </button>
      </div>

      {/* Body / Content */}
      {(status.state === 'available' || status.state === 'downloading') && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              color: THEME_TOKENS.colors.textSecondary,
              marginBottom: 6
            }}
          >
            <span>Downloading update...</span>
            <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.accent }}>
              {percent}%
            </span>
          </div>

          {/* Animated Shimmer Progress Bar */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 5,
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 3,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                width: `${percent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #2962ff 0%, #00bcd4 50%, #2962ff 100%)',
                backgroundSize: '200% 100%',
                borderRadius: 3,
                boxShadow: '0 0 10px rgba(0, 188, 212, 0.5)',
                transition: 'width 0.25s ease-out',
                animation: 'shimmerPulse 2s linear infinite'
              }}
            />
          </div>
        </div>
      )}

      {status.state === 'downloaded' && (
        <div>
          <p
            style={{
              margin: '0 0 10px 0',
              fontSize: 11,
              color: THEME_TOKENS.colors.textSecondary,
              lineHeight: 1.4
            }}
          >
            PIA Terminal v{version} has been downloaded and verified. Restart to apply update.
          </p>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={dismissBanner}
              style={{
                background: 'none',
                border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
                borderRadius: 4,
                padding: '4px 10px',
                color: THEME_TOKENS.colors.textSecondary,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              Later
            </button>
            <button
              type="button"
              onClick={() => void installUpdate()}
              style={{
                background: THEME_TOKENS.colors.bullish,
                border: 'none',
                borderRadius: 4,
                padding: '4px 12px',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(38, 166, 154, 0.4)'
              }}
            >
              Restart & Install
            </button>
          </div>
        </div>
      )}

      {status.state === 'error' && (
        <div>
          <p
            style={{
              margin: '0 0 8px 0',
              fontSize: 11,
              color: THEME_TOKENS.colors.bearish,
              lineHeight: 1.4
            }}
          >
            {status.error || 'Failed to download update.'}
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              onClick={() => void checkForUpdates()}
              style={{
                background: THEME_TOKENS.colors.accent,
                border: 'none',
                borderRadius: 4,
                padding: '4px 10px',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
