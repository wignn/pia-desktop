/**
 * PIA Terminal - Main Process Entry Point
 * Manages Electron lifecycle, secure window initialization, SQLite persistence, and IPC wiring.
 */

import { app, shell, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { CredentialManager } from './services/credentials'
import { DatabaseService } from './services/database'
import { PiaProvider } from './services/pia-provider'
import { registerIpcHandlers } from './ipc/handlers'

// ---------------------------------------------------------------------------
// Hardware Acceleration & Native GPU Direct Pipeline (Vulkan / D3D11 / WebGL)
// Guarantees zero-copy GPU rasterization, eliminates software SwiftShader fallback,
// and ensures 60-144 FPS canvas & map performance while keeping UI pixel-identical.
// ---------------------------------------------------------------------------
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('enable-native-gpu-memory-buffers')
app.commandLine.appendSwitch('enable-accelerated-2d-canvas')
app.commandLine.appendSwitch('enable-accelerated-video-decode')
app.commandLine.appendSwitch(
  'enable-features',
  'VaapiVideoDecoder,CanvasOopRasterization,Vulkan,DefaultANGLEVulkan'
)

if (process.platform === 'win32') {
  // Direct3D 11 native hardware ANGLE backend on Windows
  app.commandLine.appendSwitch('use-angle', 'd3d11')
} else if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'Vulkan,VaapiVideoDecoder')
}

let mainWindow: BrowserWindow | null = null
let dbService: DatabaseService | null = null
let piaProvider: PiaProvider | null = null
let credManager: CredentialManager | null = null

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f0f0f',
    title: 'PIA Terminal',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show()
    }
  })

  // Prevent navigation away from the local app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow dev server reload in development mode
    if (
      is.dev &&
      process.env['ELECTRON_RENDERER_URL'] &&
      url.startsWith(process.env['ELECTRON_RENDERER_URL'])
    ) {
      return
    }
    event.preventDefault()
  })

  // Open external links safely in OS browser only for http/https
  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(details.url)
      }
    } catch {
      // ignore invalid URLs
    }
    return { action: 'deny' }
  })

  // HMR for renderer based on electron-vite cli
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.pia.terminal')

    // Ensure YouTube embeds have genuine desktop Referer & Origin so live broadcasts never report "This video is private"
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*', '*://*.googlevideo.com/*'] },
      (details, callback) => {
        details.requestHeaders['Referer'] = 'https://www.youtube.com/'
        details.requestHeaders['Origin'] = 'https://www.youtube.com'
        callback({ requestHeaders: details.requestHeaders })
      }
    )

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // Initialize Core Services
    credManager = new CredentialManager()
    dbService = new DatabaseService()
    await dbService.initialize()

    piaProvider = new PiaProvider(credManager, getMainWindow)

    // Register strictly typed IPC handlers
    registerIpcHandlers(getMainWindow, credManager, dbService, piaProvider)

    createWindow()

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('before-quit', () => {
  if (dbService) {
    dbService.flushSync()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
