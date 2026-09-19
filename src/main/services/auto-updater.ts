/**
 * PIA Terminal - Auto-Updater Service
 * Manages background update lifecycle via electron-updater.
 * Follows TradingView-style non-intrusive updates:
 * - Silent background download
 * - Zero trading interruptions
 * - Apply on demand via restart or on application quit
 */

import { autoUpdater } from 'electron-updater'
import { app, type BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { UpdaterStatus } from '@shared/types'

export class AppUpdaterService {
  private getWindow: () => BrowserWindow | null
  private status: UpdaterStatus

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow
    this.status = {
      state: 'idle',
      currentVersion: app.getVersion()
    }

    this.configureUpdater()
    this.registerEvents()
  }

  private configureUpdater(): void {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
  }

  private registerEvents(): void {
    autoUpdater.on('checking-for-update', () => {
      this.updateStatus({ state: 'checking', error: undefined })
    })

    autoUpdater.on('update-available', (info) => {
      this.updateStatus({
        state: 'available',
        availableVersion: info.version,
        error: undefined
      })
    })

    autoUpdater.on('update-not-available', () => {
      this.updateStatus({
        state: 'not-available',
        error: undefined
      })
    })

    autoUpdater.on('download-progress', (progressObj) => {
      this.updateStatus({
        state: 'downloading',
        progressPercent: Math.round(progressObj.percent),
        downloadSpeed: Math.round(progressObj.bytesPerSecond),
        error: undefined
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.updateStatus({
        state: 'downloaded',
        availableVersion: info.version,
        progressPercent: 100,
        error: undefined
      })
    })

    autoUpdater.on('error', (err) => {
      this.updateStatus({
        state: 'error',
        error: err?.message || String(err)
      })
    })
  }

  private updateStatus(patch: Partial<UpdaterStatus>): void {
    this.status = { ...this.status, ...patch }
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.UPDATER_ON_STATUS, this.status)
    }
  }

  public getStatus(): UpdaterStatus {
    return { ...this.status }
  }

  public async checkForUpdates(): Promise<UpdaterStatus> {
    if (is.dev) {
      this.updateStatus({ state: 'not-available', error: undefined })
      return this.status
    }

    try {
      await autoUpdater.checkForUpdates()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      this.updateStatus({ state: 'error', error: errorMsg })
    }
    return this.status
  }

  public async installUpdate(): Promise<boolean> {
    if (this.status.state !== 'downloaded') {
      return false
    }

    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true)
    })
    return true
  }

  public startStartupCheck(delayMs = 10000): void {
    if (is.dev) return
    setTimeout(() => {
      this.checkForUpdates().catch((err) => {
        console.warn('[AppUpdaterService] Startup check failed:', err)
      })
    }, delayMs)
  }
}
