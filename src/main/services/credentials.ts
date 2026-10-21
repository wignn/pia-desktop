import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { CredentialStatus } from '@shared/types'

const DEFAULT_BASE_URL = 'https://api-engine.wign.dev'
const DEFAULT_WS_URL = 'wss://api-engine.wign.dev/api/v1/ws'

interface StoredCredentials {
  apiKey?: string
  desktopCredential?: string
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
          if (this.inMemoryCreds?.apiKey || this.inMemoryCreds?.desktopCredential) {
            return
          }
        }
      }
    } catch {
      // If decryption fails (e.g. key changed or file corrupted), fallback
      this.inMemoryCreds = null
    }

    // Built-in build credentials / environment fallback
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
      isLoggedIn: Boolean(this.inMemoryCreds?.desktopCredential || this.inMemoryCreds?.apiKey),
      isSecureStorage: safeStorage.isEncryptionAvailable(),
      baseUrl: this.inMemoryCreds?.baseUrl || DEFAULT_BASE_URL,
      wsUrl: this.inMemoryCreds?.wsUrl || DEFAULT_WS_URL
    }
  }

  public getApiKey(): string | null {
    return this.inMemoryCreds?.desktopCredential || this.inMemoryCreds?.apiKey || null
  }

  public getBaseUrl(): string {
    return this.inMemoryCreds?.baseUrl || DEFAULT_BASE_URL
  }

  public getWsUrl(): string {
    return this.inMemoryCreds?.wsUrl || DEFAULT_WS_URL
  }

  public saveCredentials(apiKey: string, baseUrl?: string, wsUrl?: string): boolean {
    if (!safeStorage.isEncryptionAvailable()) return false
    return this.persistCredentials({
      apiKey,
      baseUrl: baseUrl || DEFAULT_BASE_URL,
      wsUrl: wsUrl || DEFAULT_WS_URL
    })
  }

  public saveDesktopCredential(desktopCredential: string): boolean {
    if (!safeStorage.isEncryptionAvailable()) return false
    return this.persistCredentials({
      desktopCredential,
      baseUrl: this.getBaseUrl(),
      wsUrl: this.getWsUrl()
    })
  }

  private persistCredentials(nextCredentials: StoredCredentials): boolean {
    if (safeStorage.isEncryptionAvailable()) {
      const temporaryPath = `${this.storageFilePath}.tmp`
      try {
        const serialized = JSON.stringify(nextCredentials)
        const encrypted = safeStorage.encryptString(serialized)
        fs.writeFileSync(temporaryPath, encrypted, { mode: 0o600 })
        fs.renameSync(temporaryPath, this.storageFilePath)
        this.inMemoryCreds = nextCredentials
        return true
      } catch {
        try {
          fs.unlinkSync(temporaryPath)
        } catch {
          // No temporary file to remove (or cleanup itself failed).
        }
        return false
      }
    }
    return false
  }

  public clearCredentials(): boolean {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        fs.unlinkSync(this.storageFilePath)
      }
      this.inMemoryCreds = null
      return true
    } catch {
      return false
    }
  }
}
