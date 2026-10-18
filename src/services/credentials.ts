import { invoke } from '@tauri-apps/api/core'
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
  private initialized = false

  public async initialize(): Promise<void> {
    if (this.initialized) return
    try {
      const content = await invoke<string | null>('load_credentials')
      if (content) {
        this.inMemoryCreds = JSON.parse(content)
      }
    } catch {
      try {
        const item = localStorage.getItem('pia_credentials')
        if (item) this.inMemoryCreds = JSON.parse(item)
      } catch {}
    }

    if (!this.inMemoryCreds?.apiKey && process.env.PIA_API_KEY) {
      this.inMemoryCreds = {
        apiKey: process.env.PIA_API_KEY,
        baseUrl: process.env.PIA_BASE_URL || DEFAULT_BASE_URL,
        wsUrl: process.env.PIA_WS_URL || DEFAULT_WS_URL
      }
    }
    this.initialized = true
  }

  public getStatus(): CredentialStatus {
    return {
      hasApiKey: Boolean(this.inMemoryCreds?.apiKey),
      isSecureStorage: true,
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

  public async saveCredentials(apiKey: string, baseUrl?: string, wsUrl?: string): Promise<boolean> {
    this.inMemoryCreds = {
      apiKey,
      baseUrl: baseUrl || DEFAULT_BASE_URL,
      wsUrl: wsUrl || DEFAULT_WS_URL
    }
    const serialized = JSON.stringify(this.inMemoryCreds)
    try {
      await invoke('save_credentials', { content: serialized })
    } catch {
      try {
        localStorage.setItem('pia_credentials', serialized)
      } catch {}
    }
    return true
  }

  public async clearCredentials(): Promise<boolean> {
    this.inMemoryCreds = null
    try {
      await invoke('save_credentials', { content: '' })
    } catch {}
    try {
      localStorage.removeItem('pia_credentials')
    } catch {}
    return true
  }
}
