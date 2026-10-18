import React, { useEffect } from 'react'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useUpdaterStore } from '../../stores/useUpdaterStore'
import { THEME_TOKENS } from '../../theme/tokens'

const SettingsModalContent: React.FC = () => {
  const { setSettingsModalOpen } = useWorkspaceStore()
  const { credentials, loadCredentials } = useSettingsStore()

  const {
    status: updaterStatus,
    isChecking: isCheckingUpdate,
    checkForUpdates,
    installUpdate
  } = useUpdaterStore()

  useEffect(() => {
    loadCredentials()
  }, [loadCredentials])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: THEME_TOKENS.colors.modalBackdrop,
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '80px'
      }}
      onClick={(): void => setSettingsModalOpen(false)}
    >
      <div
        onClick={(e): void => e.stopPropagation()}
        style={{
          width: 500,
          backgroundColor: THEME_TOKENS.colors.bgSurface,
          border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
          borderRadius: 8,
          boxShadow: THEME_TOKENS.colors.modalShadow,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14, color: THEME_TOKENS.colors.textBright }}>
            Terminal Settings & System
          </span>
          <button
            type="button"
            onClick={(): void => setSettingsModalOpen(false)}
            className="tv-btn"
            style={{ padding: '2px 6px', fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}
          >
            ESC
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Engine Status Card */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 6,
              backgroundColor: THEME_TOKENS.colors.bgApp,
              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: THEME_TOKENS.colors.textPrimary }}>
                Core Engine Network:
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 3,
                  backgroundColor: 'rgba(8, 153, 129, 0.15)',
                  color: THEME_TOKENS.colors.bullish
                }}
              >
                ● Active (Managed)
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: THEME_TOKENS.colors.textSecondary
              }}
            >
              <span>Security Runtime:</span>
              <span style={{ color: THEME_TOKENS.colors.textPrimary, fontSize: 11 }}>
                {credentials?.isSecureStorage ? 'Hardware-Encrypted SafeStorage' : 'Memory Runtime'}
              </span>
            </div>
          </div>

          {/* Software Updates Card */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 6,
              backgroundColor: THEME_TOKENS.colors.bgApp,
              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: THEME_TOKENS.colors.textPrimary }}>
                Software Updates:
              </span>
              <span
                style={{
                  fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
                  fontSize: 11,
                  color: THEME_TOKENS.colors.textSecondary
                }}
              >
                Version: v{updaterStatus.currentVersion}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: THEME_TOKENS.colors.textSecondary
              }}
            >
              <span style={{ maxWidth: '65%' }}>
                {updaterStatus.state === 'idle' && 'Automatic background updates enabled'}
                {updaterStatus.state === 'checking' && 'Checking for updates...'}
                {updaterStatus.state === 'available' &&
                  `New release v${updaterStatus.availableVersion || ''} found. Downloading...`}
                {updaterStatus.state === 'downloading' &&
                  `Downloading update (${updaterStatus.progressPercent ?? 0}%)...`}
                {updaterStatus.state === 'downloaded' &&
                  `v${updaterStatus.availableVersion || ''} ready to apply.`}
                {updaterStatus.state === 'not-available' && 'Application is up to date.'}
                {updaterStatus.state === 'error' && (updaterStatus.error || 'Check failed')}
              </span>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {updaterStatus.state === 'downloaded' ? (
                  <button
                    type="button"
                    onClick={(): void => {
                      installUpdate()
                    }}
                    className="tv-btn active"
                    style={{
                      backgroundColor: THEME_TOKENS.colors.bullish,
                      color: '#ffffff',
                      fontSize: 11,
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontWeight: 600
                    }}
                  >
                    Restart & Install
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(): void => {
                      checkForUpdates()
                    }}
                    disabled={isCheckingUpdate || updaterStatus.state === 'downloading'}
                    className="tv-btn"
                    style={{
                      fontSize: 11,
                      padding: '4px 10px',
                      border: `1px solid ${THEME_TOKENS.colors.borderMedium}`
                    }}
                  >
                    {isCheckingUpdate ? 'Checking...' : 'Check for Updates'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              marginTop: 4
            }}
          >
            <button
              type="button"
              onClick={(): void => setSettingsModalOpen(false)}
              className="tv-btn active"
              style={{
                fontSize: 12,
                padding: '6px 16px',
                backgroundColor: THEME_TOKENS.colors.accent,
                color: '#ffffff',
                borderRadius: 4,
                fontWeight: 600
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export const SettingsModal: React.FC = () => {
  const { isSettingsModalOpen } = useWorkspaceStore()
  if (!isSettingsModalOpen) return null
  return <SettingsModalContent />
}
