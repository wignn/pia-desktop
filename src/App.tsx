import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { TerminalWorkspace } from './components/layout/TerminalWorkspace'
import { AuthGateway } from './components/auth/AuthGateway'
import { SplashScreen } from './components/common/SplashScreen'
import { useSettingsStore } from './stores/useSettingsStore'
import { useUpdaterStore } from './stores/useUpdaterStore'

export function App(): React.JSX.Element {
  const credentials = useSettingsStore((state) => state.credentials)
  const loadCredentials = useSettingsStore((state) => state.loadCredentials)
  const initUpdaterListener = useUpdaterStore((state) => state.initUpdaterListener)
  const updaterStatus = useUpdaterStore((state) => state.status)

  const [isReady, setIsReady] = useState(false)
  const [splashStatus, setSplashStatus] = useState('Checking for updates...')

  useEffect(() => {
    let isMounted = true

    const boot = async (): Promise<(() => void) | undefined> => {
      const unsub = initUpdaterListener()

      // Ensure clean compact dialog on initial launch / splash loader
      if (typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)) {
        invoke('set_window_mode', { mode: 'auth' }).catch(() => {})
      }

      try {
        setSplashStatus('Checking for updates...')
        await Promise.allSettled([
          loadCredentials(),
          useUpdaterStore.getState().checkForUpdates()
        ])

        if (!isMounted) return unsub
        setSplashStatus('Connecting to real-time engine...')

        // Smooth visual pacing (600ms) matching TradingView / Discord desktop app splash
        await new Promise((r) => setTimeout(r, 600))

        if (isMounted) {
          setIsReady(true)
        }
      } catch {
        if (isMounted) setIsReady(true)
      }

      return unsub
    }

    let cleanupFn: (() => void) | undefined
    boot().then((fn) => {
      cleanupFn = fn
    })

    return () => {
      isMounted = false
      cleanupFn?.()
    }
  }, [loadCredentials, initUpdaterListener])

  const isAuthenticated = Boolean(credentials?.isLoggedIn || credentials?.hasApiKey)

  // Dynamically configure native desktop window size: compact dialog for auth, full workspace when logged in
  useEffect(() => {
    if (!isReady || credentials === null) return

    if (typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)) {
      invoke('set_window_mode', { mode: isAuthenticated ? 'workspace' : 'auth' }).catch(() => {})
    }
  }, [isReady, credentials, isAuthenticated])

  // Standalone centered splash card strictly on cold boot before initial credentials return
  if (!isReady || credentials === null) {
    let statusText = splashStatus
    let isIndeterminate = true
    let progressPercent: number | undefined

    if (updaterStatus.state === 'downloading') {
      statusText = `Downloading update v${updaterStatus.availableVersion}... (${updaterStatus.progressPercent ?? 0}%)`
      isIndeterminate = false
      progressPercent = updaterStatus.progressPercent
    } else if (updaterStatus.state === 'available') {
      statusText = `Update available: v${updaterStatus.availableVersion}`
    } else if (updaterStatus.state === 'downloaded') {
      statusText = 'Update ready to install'
    }

    return (
      <SplashScreen
        statusText={statusText}
        isIndeterminate={isIndeterminate}
        progressPercent={progressPercent}
        version={updaterStatus.currentVersion}
        state={updaterStatus.state}
        availableVersion={updaterStatus.availableVersion}
      />
    )
  }

  // Render full terminal workspace when authenticated
  if (credentials.isLoggedIn || credentials.hasApiKey) {
    return <TerminalWorkspace />
  }

  // Render clean login gateway when not authenticated
  return <AuthGateway />
}

export default App
