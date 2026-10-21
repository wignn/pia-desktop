import React, { useEffect, useState } from 'react'
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

  // Standalone centered splash card while initializing or actively downloading updates
  if (!isReady || credentials === null || updaterStatus.state === 'downloading') {
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
