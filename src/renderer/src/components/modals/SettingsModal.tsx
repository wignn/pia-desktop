import React, { useState, useEffect } from 'react'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { THEME_TOKENS } from '../../theme/tokens'

const SettingsModalContent: React.FC = () => {
  const { setSettingsModalOpen } = useWorkspaceStore()
  const {
    credentials,
    isLoading,
    isSaving,
    errorMessage,
    loadCredentials,
    saveApiKey,
    clearApiKey
  } = useSettingsStore()

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [wsUrlInput, setWsUrlInput] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    loadCredentials()
  }, [loadCredentials])

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!apiKeyInput.trim()) return

    setSuccessMessage(null)
    const ok = await saveApiKey(
      apiKeyInput.trim(),
      baseUrlInput.trim() || undefined,
      wsUrlInput.trim() || undefined
    )

    if (ok) {
      setApiKeyInput('')
      setSuccessMessage('API credentials saved securely!')
    }
  }

  const handleClear = async (): Promise<void> => {
    setSuccessMessage(null)
    const ok = await clearApiKey()
    if (ok) {
      setApiKeyInput('')
      setSuccessMessage('API credentials removed.')
    }
  }

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
          width: 520,
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
            Terminal Settings & Security
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
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Storage security status card */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              backgroundColor: THEME_TOKENS.colors.bgApp,
              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{ fontSize: 12, fontWeight: 600, color: THEME_TOKENS.colors.textPrimary }}
              >
                Credential Storage Backend:
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 3,
                  backgroundColor: credentials?.isSecureStorage
                    ? 'rgba(8, 153, 129, 0.15)'
                    : 'rgba(255, 152, 0, 0.15)',
                  color: credentials?.isSecureStorage
                    ? THEME_TOKENS.colors.bullish
                    : THEME_TOKENS.colors.impactMedium
                }}
              >
                {credentials?.isSecureStorage
                  ? 'OS SafeStorage (Hardware Encrypted)'
                  : 'Session Memory (Fallback)'}
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
              <span>Status:</span>
              <span
                style={{
                  fontWeight: 600,
                  color: credentials?.hasApiKey
                    ? THEME_TOKENS.colors.bullish
                    : THEME_TOKENS.colors.textMuted
                }}
              >
                {credentials?.hasApiKey ? 'API Key Configured & Active' : 'No API Key Configured'}
              </span>
            </div>
          </div>

          {/* Error message */}
          {errorMessage && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 4,
                backgroundColor: 'rgba(242, 54, 69, 0.15)',
                border: `1px solid ${THEME_TOKENS.colors.bearish}`,
                color: THEME_TOKENS.colors.bearish,
                fontSize: 12
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* Success message */}
          {successMessage && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 4,
                backgroundColor: 'rgba(8, 153, 129, 0.15)',
                border: `1px solid ${THEME_TOKENS.colors.bullish}`,
                color: THEME_TOKENS.colors.bullish,
                fontSize: 12
              }}
            >
              {successMessage}
            </div>
          )}

          {/* API Key Form */}
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label
                style={{ fontSize: 12, fontWeight: 600, color: THEME_TOKENS.colors.textPrimary }}
              >
                PIAA / Provider API Key:
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  placeholder={
                    credentials?.hasApiKey ? '••••••••••••••••••••••••' : 'Enter your API key...'
                  }
                  value={apiKeyInput}
                  onChange={(e): void => setApiKeyInput(e.target.value)}
                  style={{
                    flex: 1,
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
                    borderRadius: 4,
                    padding: '6px 10px',
                    color: THEME_TOKENS.colors.textBright,
                    fontSize: 12,
                    fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace'
                  }}
                />
                <button
                  type="button"
                  onClick={(): void => setShowApiKey(!showApiKey)}
                  className="tv-btn"
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    border: `1px solid ${THEME_TOKENS.colors.borderMedium}`
                  }}
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>
                Stored locally using encrypted safeStorage. Never logged or bundled.
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label
                style={{ fontSize: 12, fontWeight: 600, color: THEME_TOKENS.colors.textPrimary }}
              >
                Custom REST Base URL (Optional):
              </label>
              <input
                type="text"
                placeholder="https://api.piaa.io (default)"
                value={baseUrlInput}
                onChange={(e): void => setBaseUrlInput(e.target.value)}
                style={{
                  backgroundColor: THEME_TOKENS.colors.bgApp,
                  border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
                  borderRadius: 4,
                  padding: '6px 10px',
                  color: THEME_TOKENS.colors.textBright,
                  fontSize: 12
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label
                style={{ fontSize: 12, fontWeight: 600, color: THEME_TOKENS.colors.textPrimary }}
              >
                Custom WebSocket URL (Optional):
              </label>
              <input
                type="text"
                placeholder="wss://stream.piaa.io/ws (default)"
                value={wsUrlInput}
                onChange={(e): void => setWsUrlInput(e.target.value)}
                style={{
                  backgroundColor: THEME_TOKENS.colors.bgApp,
                  border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
                  borderRadius: 4,
                  padding: '6px 10px',
                  color: THEME_TOKENS.colors.textBright,
                  fontSize: 12
                }}
              />
            </div>

            {/* Action buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 8
              }}
            >
              {credentials?.hasApiKey && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={isSaving || isLoading}
                  className="tv-btn"
                  style={{
                    color: THEME_TOKENS.colors.bearish,
                    border: `1px solid ${THEME_TOKENS.colors.bearishBg}`,
                    fontSize: 12,
                    padding: '6px 12px'
                  }}
                >
                  Clear Key
                </button>
              )}

              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={(): void => setSettingsModalOpen(false)}
                  className="tv-btn"
                  style={{ fontSize: 12, padding: '6px 14px' }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={!apiKeyInput.trim() || isSaving}
                  className="tv-btn active"
                  style={{
                    backgroundColor: THEME_TOKENS.colors.accent,
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: 12,
                    padding: '6px 16px',
                    borderRadius: 4
                  }}
                >
                  {isSaving ? 'Saving...' : 'Save Credentials'}
                </button>
              </div>
            </div>
          </form>
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
