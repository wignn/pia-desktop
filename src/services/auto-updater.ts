/**
 * PIA Terminal Auto-Updater Service
 * Communicates with Tauri's official updater plugin and GitHub Releases.
 * Validates updates against cryptographic public key.
 */

export interface AppUpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error'
  currentVersion?: string
  availableVersion?: string
  releaseNotes?: string
  progressPercent?: number
  error?: string
}

export interface UpdaterCheckOptions {
  silent?: boolean
  checker?: () => Promise<{
    available: boolean
    version?: string
    currentVersion?: string
    body?: string
    date?: string
    downloadAndInstall?: (onProgress?: (event: any) => void) => Promise<void>
  } | null>
}

let activeUpdateHandle: any = null

export function formatUpdateMessage(status: AppUpdateStatus): string {
  if (status.state === 'available') {
    return `Version ${status.availableVersion} is available. ${status.releaseNotes || ''}`.trim()
  }
  if (status.state === 'up-to-date') {
    return 'You are using the latest version of PIA Terminal.'
  }
  if (status.state === 'downloading') {
    return `Downloading update (${status.progressPercent ?? 0}%)...`
  }
  if (status.state === 'downloaded') {
    return 'Update downloaded. Restart the application to apply.'
  }
  if (status.state === 'error') {
    return `Update check failed: ${status.error || 'Unknown error'}`
  }
  return ''
}

export async function checkForAppUpdates(options: UpdaterCheckOptions = {}): Promise<AppUpdateStatus> {
  try {
    let update: any = null

    if (options.checker) {
      update = await options.checker()
    } else {
      // Dynamic import to support both Tauri and non-Tauri / test environments
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        update = await check()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[AutoUpdater] Native updater unavailable:', msg)
        return {
          state: 'error',
          error: msg
        }
      }
    }

    if (update && update.available) {
      activeUpdateHandle = update
      return {
        state: 'available',
        currentVersion: update.currentVersion,
        availableVersion: update.version,
        releaseNotes: update.body || ''
      }
    }

    activeUpdateHandle = null
    return {
      state: 'up-to-date',
      currentVersion: update?.currentVersion || '3.0.5'
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.warn('[AutoUpdater] Failed to check for updates:', errorMsg)
    return {
      state: 'error',
      error: errorMsg
    }
  }
}

export async function downloadUpdatePackage(
  onProgress?: (percent: number) => void
): Promise<boolean> {
  if (!activeUpdateHandle) {
    console.warn('[AutoUpdater] No active update available to download.')
    return false
  }

  try {
    let downloaded = 0
    let contentLength = 0
    // Windows updater msi is typically ~8.8MB
    const ESTIMATED_SIZE = 8_800_000

    const handleDownloadEvent = (event: any): void => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data?.contentLength || 0
          if (onProgress) onProgress(1)
          break
        case 'Progress': {
          downloaded += event.data?.chunkLength || 0
          const total = contentLength > 0 ? contentLength : ESTIMATED_SIZE
          const percent = Math.min(99, Math.max(1, Math.round((downloaded / total) * 100)))
          if (onProgress) onProgress(percent)
          break
        }
        case 'Finished':
          if (onProgress) onProgress(100)
          break
      }
    }

    if (typeof activeUpdateHandle.download === 'function') {
      await activeUpdateHandle.download(handleDownloadEvent, { timeout: 60000 })
      return true
    } else if (typeof activeUpdateHandle.downloadAndInstall === 'function') {
      await activeUpdateHandle.downloadAndInstall(handleDownloadEvent, { timeout: 60000 })
      return true
    }

    return false
  } catch (err: unknown) {
    console.error('[AutoUpdater] Download failed:', err)
    return false
  }
}

export async function applyDownloadedUpdate(): Promise<boolean> {
  if (!activeUpdateHandle) {
    console.warn('[AutoUpdater] No active update available to apply.')
    return false
  }

  try {
    if (typeof activeUpdateHandle.install === 'function') {
      await activeUpdateHandle.install({ restartAfterInstall: true })
      return true
    }
    return false
  } catch (err: unknown) {
    console.error('[AutoUpdater] Install failed:', err)
    return false
  }
}

export async function installDownloadedUpdate(
  onProgress?: (percent: number) => void
): Promise<boolean> {
  const ok = await downloadUpdatePackage(onProgress)
  if (!ok) return false
  return await applyDownloadedUpdate()
}
