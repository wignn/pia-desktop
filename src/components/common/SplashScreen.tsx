import React from 'react'
import { THEME_TOKENS } from '../../theme/tokens'
import piaLogo from '../../assets/logo.png'

interface SplashScreenProps {
  statusText?: string
  progressPercent?: number
  isIndeterminate?: boolean
  version?: string
  state?: string
  availableVersion?: string
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  statusText = 'Preparing your terminal…',
  progressPercent,
  isIndeterminate = true,
  version = '3.0.22',
  state,
  availableVersion
}) => {
  const percent = Math.min(100, Math.max(0, progressPercent ?? 0))
  const isDownloading = state === 'downloading'
  const isInstalling = state === 'installing'
  const isBusy = isIndeterminate || isDownloading || isInstalling
  const colors = THEME_TOKENS.colors
  let title = 'Starting PIA Terminal'
  if (isDownloading) title = `Downloading v${availableVersion || 'update'}`
  else if (isInstalling) title = 'Installing update'
  else if (state === 'downloaded') title = 'Update ready to install'
  else if (state === 'available') title = `Update available · v${availableVersion}`
  else if (state === 'checking') title = 'Checking for updates'
  else if (state === 'error') title = 'Starting current version'

  return (
    <main
      data-tauri-drag-region
      role="status"
      aria-live="polite"
      aria-busy={isBusy}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100vh',
        width: '100vw',
        boxSizing: 'border-box',
        overflow: 'hidden',
        padding: '32px 28px 18px',
        border: `1px solid ${colors.borderSubtle}`,
        background: colors.bgApp,
        color: colors.textBright,
        fontFamily: THEME_TOKENS.typography.fontSans,
        position: 'relative',
        userSelect: 'none'
      }}
    >
      <style>{`
        @keyframes piaProgress { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
        .pia-progress-indeterminate { animation: piaProgress 1.5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .pia-progress-indeterminate { animation: none; width: 35% !important; transform: translateX(90%); } }
      `}</style>
      <div data-tauri-drag-region style={{ position: 'absolute', inset: '0 0 auto', height: 28 }} />
      <button
        type="button"
        onClick={() => window.api?.system?.closeApp?.()}
        aria-label="Close"
        title="Close"
        style={{ position: 'absolute', top: 7, right: 9, border: 0, borderRadius: 4, padding: '4px 7px', color: colors.textSecondary, background: 'transparent', cursor: 'pointer' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="m18 6-12 12M6 6l12 12" />
        </svg>
      </button>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <img src={piaLogo} alt="PIA" style={{ width: 38, height: 38, borderRadius: 7, objectFit: 'cover' }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: '-0.02em' }}>PIA Terminal</div>
            <div style={{ marginTop: 2, color: colors.textMuted, fontSize: 10 }}>v{version}</div>
          </div>
        </header>

        <div>
          <h1 style={{ margin: '0 0 5px', fontSize: 17, fontWeight: 620, letterSpacing: '-0.02em' }}>{title}</h1>
          <p style={{ margin: 0, color: colors.textSecondary, fontSize: 11, lineHeight: 1.5, minHeight: 17 }}>{statusText}</p>
        </div>

        <div
          role={isDownloading ? 'progressbar' : undefined}
          aria-label={isDownloading ? 'Update download progress' : undefined}
          aria-valuemin={isDownloading ? 0 : undefined}
          aria-valuemax={isDownloading ? 100 : undefined}
          aria-valuenow={isDownloading ? percent : undefined}
          style={{ height: 3, width: '100%', borderRadius: 2, background: colors.bgActive, overflow: 'hidden', position: 'relative' }}
        >
          {isIndeterminate && !isDownloading ? (
            <div className="pia-progress-indeterminate" style={{ position: 'absolute', inset: '0 auto 0 0', width: '35%', background: colors.accent, borderRadius: 2 }} />
          ) : (
            <div style={{ height: '100%', width: `${percent}%`, background: colors.accent, transition: 'width 0.25s ease-out' }} />
          )}
        </div>
        {isDownloading && <div style={{ marginTop: -12, color: colors.textMuted, fontSize: 10, fontFamily: THEME_TOKENS.typography.fontMono }}>{percent}%</div>}
      </section>

      <footer style={{ paddingTop: 12, borderTop: `1px solid ${colors.borderSubtle}`, color: colors.textMuted, fontSize: 10 }}>
        {isDownloading ? 'Downloading update package' : 'Please wait'}
      </footer>
    </main>
  )
}
