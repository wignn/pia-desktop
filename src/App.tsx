import React, { useEffect } from 'react'
import { TerminalWorkspace } from './components/layout/TerminalWorkspace'
import { AuthGateway } from './components/auth/AuthGateway'
import { useSettingsStore } from './stores/useSettingsStore'
import { useUpdaterStore } from './stores/useUpdaterStore'
import { THEME_TOKENS } from './theme/tokens'

export function App(): React.JSX.Element {
  const { credentials, loadCredentials, isLoading } = useSettingsStore()
  const initUpdaterListener = useUpdaterStore((state) => state.initUpdaterListener)

  // Initialize background update listener and load local credentials
  useEffect(() => {
    loadCredentials()
    const unsub = initUpdaterListener()
    void useUpdaterStore.getState().checkForUpdates()
    return unsub
  }, [loadCredentials, initUpdaterListener])

  // Initializing runtime indicator before credentials check finishes
  if (isLoading || credentials === null) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100vw',
          height: '100vh',
          backgroundColor: '#080A0F',
          color: '#838896',
          fontFamily: THEME_TOKENS.typography.fontMono,
          gap: 12
        }}
      >
        <div
          style={{
            fontSize: 14,
            color: '#D4AF37',
            fontWeight: 800,
            letterSpacing: '0.1em'
          }}
        >
          ◈ PIA TERMINAL
        </div>
        <div style={{ fontSize: 11, color: '#64748B', letterSpacing: '0.06em' }}>
          MEMERIKSA STATUS LISENSI &amp; KEYRING...
        </div>
      </div>
    )
  }

  // Step 3 (Main Workspace): Render full terminal workspace when authenticated
  if (credentials.isLoggedIn || credentials.hasApiKey) {
    return <TerminalWorkspace />
  }

  // Steps 1 & 2: Render lightweight release radar & focused login gateway when not authenticated
  return <AuthGateway />
}

export default App
