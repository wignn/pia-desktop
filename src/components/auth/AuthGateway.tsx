import React, { useState } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useUpdaterStore } from '../../stores/useUpdaterStore'
import { THEME_TOKENS } from '../../theme/tokens'
import { UpdateNotificationBanner } from '../layout/UpdateNotificationBanner'

export function AuthGateway(): React.JSX.Element {
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKeyForm, setShowApiKeyForm] = useState(false)
  const [isApiKeySubmitting, setIsApiKeySubmitting] = useState(false)

  const { loginWithGoogle, saveApiKey, isSaving, errorMessage } = useSettingsStore()
  const updaterStatus = useUpdaterStore((state) => state.status)

  const handleGoogleLogin = async (): Promise<void> => {
    await loginWithGoogle()
  }

  const handleApiKeySubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!apiKeyInput.trim()) return
    setIsApiKeySubmitting(true)
    await saveApiKey(apiKeyInput.trim())
    setIsApiKeySubmitting(false)
  }

  return (
    <div
      data-tauri-drag-region
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100vh',
        width: '100vw',
     
        color: '#F4F6FC',
        fontFamily: THEME_TOKENS.typography.fontSans,
        overflow: 'hidden',
        position: 'relative',
        padding: '24px 22px 18px',
        boxSizing: 'border-box',
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}
    >
      <UpdateNotificationBanner top={8} />

      {/* Custom Window Drag Handle & Close Button for Frameless Window */}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 12px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: 999,
              marginBottom: 10
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
              v{updaterStatus.currentVersion}
            </span>
          </div>

          <h1
            style={{
              fontSize: 19,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: '#FFFFFF',
              margin: '0 0 4px 0'
            }}
          >
            Sign In
          </h1>
          <p
            style={{
              fontSize: 11,
              color: '#838896',
              margin: 0,
              lineHeight: 1.4
            }}
          >
            Connect your account to access real-time market data and analytical feeds.
          </p>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div
            style={{
              backgroundColor: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: 11,
              color: '#F43F5E',
              lineHeight: 1.4
            }}
          >
            <strong>Authentication Error:</strong> {errorMessage}
          </div>
        )}

        {/* Google Sign-in Button */}
        <button
          type="button"
          disabled={isSaving}
          onClick={handleGoogleLogin}
          style={{
            width: '100%',
            padding: '10px 16px',
            backgroundColor: '#FFFFFF',
            color: '#0F172A',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            cursor: isSaving ? 'not-allowed' : 'pointer',
            opacity: isSaving ? 0.75 : 1,
            transition: 'all 0.15s ease',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>{isSaving ? 'Connecting to browser...' : 'Continue with Google'}</span>
        </button>

        {isSaving && (
          <div
            style={{
              fontSize: 11,
              textAlign: 'center',
              color: '#D4AF37',
              fontFamily: THEME_TOKENS.typography.fontMono,
              padding: '6px 10px',
              backgroundColor: 'rgba(212, 175, 55, 0.08)',
              border: '1px solid rgba(212, 175, 55, 0.2)',
              borderRadius: 6
            }}
          >
            Browser opened. Complete sign-in in your browser window.
          </div>
        )}

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: '#525766',
            fontSize: 11
          }}
        >
          <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
          <span>or</span>
          <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
        </div>

        {/* API Key Option */}
        <div>
          {!showApiKeyForm ? (
            <button
              type="button"
              onClick={() => setShowApiKeyForm(true)}
              style={{
                width: '100%',
                background: 'none',
                border: '1px dashed rgba(255, 255, 255, 0.12)',
                borderRadius: 6,
                padding: '9px 12px',
                color: '#838896',
                fontSize: 12,
                cursor: 'pointer',
                transition: 'border-color 0.15s ease'
              }}
            >
              Enter API Key manually
            </button>
          ) : (
            <form
              onSubmit={handleApiKeySubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <input
                type="password"
                placeholder="API Key (e.g. pia_live_...)"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  backgroundColor: '#07090E',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 6,
                  padding: '9px 12px',
                  color: '#F4F6FC',
                  fontSize: 12,
                  fontFamily: THEME_TOKENS.typography.fontMono,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="submit"
                  disabled={isApiKeySubmitting || !apiKeyInput.trim()}
                  style={{
                    flex: 1,
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {isApiKeySubmitting ? 'Connecting...' : 'Connect'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowApiKeyForm(false)}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#838896',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Keyring Security Footnote */}
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          paddingTop: 10,
          textAlign: 'center',
          fontSize: 10,
          fontFamily: THEME_TOKENS.typography.fontMono,
          color: '#525766'
        }}
      >
        Credentials are securely encrypted in the OS vault.
      </div>
    </div>
  )
}
