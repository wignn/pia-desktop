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
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#080A0F',
        color: '#F4F6FC',
        fontFamily: THEME_TOKENS.typography.fontSans,
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <UpdateNotificationBanner />

      {/* Top Header */}
      <header
        style={{
          height: 44,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#0B0E14',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          zIndex: 10
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.06em',
            color: '#F4F6FC'
          }}
        >
          <span style={{ color: '#D4AF37' }}>◈</span> PIA TERMINAL
        </div>

        <div
          style={{
            fontSize: 11,
            fontFamily: THEME_TOKENS.typography.fontMono,
            color: '#64748B'
          }}
        >
          v{updaterStatus.currentVersion}
        </div>
      </header>

      {/* Center Authentication Card */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          zIndex: 10
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 380,
            backgroundColor: '#0C1017',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            padding: '32px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.7)'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#FFFFFF',
                margin: 0
              }}
            >
              Sign In
            </h1>
            <p
              style={{
                fontSize: 12,
                color: '#838896',
                marginTop: 6,
                lineHeight: 1.5
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
                borderRadius: 4,
                padding: '10px 12px',
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
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.75 : 1,
              transition: 'opacity 0.15s ease'
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
                fontFamily: THEME_TOKENS.typography.fontMono
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
                  borderRadius: 4,
                  padding: '8px 12px',
                  color: '#838896',
                  fontSize: 12,
                  cursor: 'pointer'
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
                  style={{
                    width: '100%',
                    backgroundColor: '#07090E',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 4,
                    padding: '8px 10px',
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
                      borderRadius: 4,
                      padding: '7px 12px',
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
                      borderRadius: 4,
                      padding: '7px 12px',
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

          {/* Keyring Security Footnote */}
          <div
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              paddingTop: 12,
              textAlign: 'center',
              fontSize: 10,
              fontFamily: THEME_TOKENS.typography.fontMono,
              color: '#525766'
            }}
          >
            Credentials are securely encrypted in the OS vault.
          </div>
        </div>
      </main>
    </div>
  )
}
