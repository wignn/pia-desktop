import React, { useEffect, useRef, useState } from 'react'
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
  const [splashStatus, setSplashStatus] = useState('Preparing your terminal…')
  const installStarted = useRef(false)

  useEffect(() => {
    let isMounted = true
    const unsubscribe = initUpdaterListener()

    // Keep the compact startup window until credentials and any update are ready.
    if (typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)) {
      invoke('set_window_mode', { mode: 'auth' }).catch(() => {})
    }

    const boot = async (): Promise<void> => {
      setSplashStatus('Checking for updates…')
      const [, updateResult] = await Promise.allSettled([
        loadCredentials(),
        useUpdaterStore.getState().checkForUpdates()
      ])
      if (!isMounted) return

      const updateStatus = useUpdaterStore.getState().status
      if (updateResult.status === 'fulfilled' && updateStatus.state === 'downloaded') {
        setSplashStatus('Installing update and restarting… Windows may request permission.')
        if (!installStarted.current) {
          installStarted.current = true
          const installed = await useUpdaterStore.getState().installUpdate()
          if (!installed && isMounted) {
            setSplashStatus('Update could not be installed. Starting current version…')
          } else if (installed) {
            return
          }
        }
      } else if (updateStatus.state === 'error') {
        setSplashStatus('Update check failed. Starting current version…')
      } else {
        setSplashStatus('Starting your terminal…')
      }

      if (isMounted) setIsReady(true)
    }

    void boot().catch((error: unknown) => {
      console.warn('[App] Startup checks failed; continuing with current version:', error)
      if (isMounted) setIsReady(true)
    })

    return () => {
      isMounted = false
      unsubscribe()
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
