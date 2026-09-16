/**
 * PIA Terminal - Secure Credential Storage Service
 * Manages API keys and gateway endpoints using Electron safeStorage where available.
 * Never leaks plaintext API keys to the renderer process.
 */

import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { CredentialStatus } from '@shared/types'

const DEFAULT_BASE_URL = 'https://api-engine.wign.dev'
const DEFAULT_WS_URL = 'wss://api-engine.wign.dev/api/v1/ws'

interface StoredCredentials {
  apiKey: string
  baseUrl?: string
  wsUrl?: string
}

export class CredentialManager {
  private inMemoryCreds: StoredCredentials | null = null
  private readonly storageFilePath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.storageFilePath = path.join(userDataPath, 'pia_credentials.dat')
    this.loadCredentials()
  }

  private loadCredentials(): void {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const encryptedBuffer = fs.readFileSync(this.storageFilePath)
        if (safeStorage.isEncryptionAvailable()) {
          const decryptedJson = safeStorage.decryptString(encryptedBuffer)
          this.inMemoryCreds = JSON.parse(decryptedJson)
          return
        }
      }
    } catch {
      // If decryption fails (e.g. key changed or file corrupted), fallback
      this.inMemoryCreds = null
    }

    // Fallback: check environment variables (development only)
    if (process.env.PIA_API_KEY) {
      this.inMemoryCreds = {
        apiKey: process.env.PIA_API_KEY,
        baseUrl: process.env.PIA_BASE_URL || DEFAULT_BASE_URL,
        wsUrl: process.env.PIA_WS_URL || DEFAULT_WS_URL
      }
    }
  }

  public getStatus(): CredentialStatus {
    return {
      hasApiKey: Boolean(this.inMemoryCreds?.apiKey),
      isSecureStorage: safeStorage.isEncryptionAvailable(),
      baseUrl: this.inMemoryCreds?.baseUrl || DEFAULT_BASE_URL,
      wsUrl: this.inMemoryCreds?.wsUrl || DEFAULT_WS_URL
    }
  }

  public getApiKey(): string | null {
    return this.inMemoryCreds?.apiKey || null
  }

  public getBaseUrl(): string {
    return this.inMemoryCreds?.baseUrl || DEFAULT_BASE_URL
  }

  public getWsUrl(): string {
    return this.inMemoryCreds?.wsUrl || DEFAULT_WS_URL
  }

  public saveCredentials(apiKey: string, baseUrl?: string, wsUrl?: string): boolean {
    this.inMemoryCreds = {
      apiKey,
      baseUrl: baseUrl || DEFAULT_BASE_URL,
      wsUrl: wsUrl || DEFAULT_WS_URL
    }

    if (safeStorage.isEncryptionAvailable()) {
      try {
        const serialized = JSON.stringify(this.inMemoryCreds)
        const encrypted = safeStorage.encryptString(serialized)
        fs.writeFileSync(this.storageFilePath, encrypted)
        return true
      } catch {
        return false
      }
    }
    // If OS encryption unavailable, keep in memory for the current session only
    return true
  }

  public clearCredentials(): boolean {
    this.inMemoryCreds = null
    try {
      if (fs.existsSync(this.storageFilePath)) {
        fs.unlinkSync(this.storageFilePath)
      }
      return true
    } catch {
      return false
    }
  }
}
