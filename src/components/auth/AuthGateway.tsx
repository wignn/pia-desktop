import React, { useState } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useUpdaterStore } from '../../stores/useUpdaterStore'
import { THEME_TOKENS } from '../../theme/tokens'
import { UpdateNotificationBanner } from '../layout/UpdateNotificationBanner'
import piaLogo from '../../assets/logo.png'

export function AuthGateway(): React.JSX.Element {
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKeyForm, setShowApiKeyForm] = useState(false)
  const [isApiKeySubmitting, setIsApiKeySubmitting] = useState(false)
  const { loginWithGoogle, saveApiKey, isSaving, errorMessage } = useSettingsStore()
  const updaterStatus = useUpdaterStore((state) => state.status)
  const colors = THEME_TOKENS.colors

  const handleApiKeySubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!apiKeyInput.trim()) return
    setIsApiKeySubmitting(true)
    try {
      if (await saveApiKey(apiKeyInput.trim())) setApiKeyInput('')
    } finally {
      setIsApiKeySubmitting(false)
    }
  }

  const buttonStyle: React.CSSProperties = {
    border: `1px solid ${colors.borderMedium}`,
    borderRadius: 5,
    padding: '9px 12px',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer'
  }

  return (
    <main
      data-tauri-drag-region
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        boxSizing: 'border-box',
        overflow: 'hidden',
        padding: '34px 28px 18px',
        border: `1px solid ${colors.borderSubtle}`,
        background: colors.bgApp,
        color: colors.textBright,
        fontFamily: THEME_TOKENS.typography.fontSans,
        position: 'relative'
      }}
    >
      <UpdateNotificationBanner top={8} />
      <div data-tauri-drag-region style={{ position: 'absolute', inset: '0 0 auto', height: 30 }} />

      <header style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 24 }}>
        <img src={piaLogo} alt="PIA" style={{ width: 34, height: 34, borderRadius: 7, objectFit: 'cover' }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: '-0.02em' }}>PIA Terminal</div>
          <div style={{ marginTop: 2, color: colors.textMuted, fontSize: 10 }}>v{updaterStatus.currentVersion}</div>
        </div>
        <button
          type="button"
          onClick={() => window.api?.system?.closeApp?.()}
          aria-label="Close"
          title="Close"
          style={{ ...buttonStyle, marginLeft: 'auto', padding: '4px 8px', background: 'transparent', color: colors.textSecondary }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m18 6-12 12M6 6l12 12" />
          </svg>
        </button>
      </header>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h1 style={{ margin: '0 0 5px', fontSize: 19, fontWeight: 620, letterSpacing: '-0.025em' }}>Sign in to continue</h1>
          <p style={{ margin: 0, color: colors.textSecondary, fontSize: 12, lineHeight: 1.5 }}>
            Use your Google account to connect to PIA Terminal.
          </p>
        </div>

        {errorMessage && (
          <div role="alert" style={{ borderLeft: `2px solid ${colors.bearish}`, padding: '7px 10px', background: colors.bearishBg, color: colors.textBright, fontSize: 11, lineHeight: 1.45 }}>
            {errorMessage}
          </div>
        )}

        <button
          type="button"
          disabled={isSaving}
          onClick={() => void loginWithGoogle()}
          style={{
            ...buttonStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            width: '100%',
            borderColor: '#d8dce6',
            background: '#d8dce6',
            color: '#11151f',
            fontWeight: 600,
            opacity: isSaving ? 0.7 : 1
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
          </svg>
          {isSaving ? 'Waiting for Google sign-in…' : 'Continue with Google'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.textMuted, fontSize: 11 }}>
          <span style={{ flex: 1, height: 1, background: colors.borderSubtle }} />
          <span>or use an API key</span>
          <span style={{ flex: 1, height: 1, background: colors.borderSubtle }} />
        </div>

        {showApiKeyForm ? (
          <form onSubmit={(event) => void handleApiKeySubmit(event)} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <label htmlFor="api-key" style={{ color: colors.textSecondary, fontSize: 11 }}>API key</label>
            <input
              id="api-key"
              type="password"
              autoFocus
              autoComplete="off"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box', border: `1px solid ${colors.borderMedium}`, borderRadius: 5,
                padding: '9px 10px', background: colors.bgSurface, color: colors.textBright,
                fontFamily: THEME_TOKENS.typography.fontMono, fontSize: 12
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={isApiKeySubmitting || !apiKeyInput.trim()} style={{ ...buttonStyle, flex: 1, background: colors.accent, borderColor: colors.accent, color: '#fff', fontWeight: 600 }}>
                {isApiKeySubmitting ? 'Connecting…' : 'Connect'}
              </button>
              <button type="button" onClick={() => setShowApiKeyForm(false)} style={{ ...buttonStyle, background: 'transparent', color: colors.textSecondary }}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setShowApiKeyForm(true)} style={{ border: 0, padding: 2, background: 'transparent', color: colors.textSecondary, textAlign: 'left', font: 'inherit', fontSize: 11, cursor: 'pointer' }}>
            Enter an API key instead
          </button>
        )}
      </section>

      <footer style={{ marginTop: 'auto', paddingTop: 14, color: colors.textMuted, fontSize: 10, borderTop: `1px solid ${colors.borderSubtle}` }}>
        Sign-in credentials are stored by your operating system.
      </footer>
    </main>
  )
}
