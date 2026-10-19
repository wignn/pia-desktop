import { invoke } from '@tauri-apps/api/core'
import type { CredentialStatus } from '@shared/types'

const DEFAULT_BASE_URL = 'https://api-engine.wign.dev'
const DEFAULT_WS_URL = 'wss://api-engine.wign.dev/api/v1/ws'

export function normalizeBaseUrl(url?: string | null): string {
  if (!url || !url.trim()) return DEFAULT_BASE_URL
  return url.trim().replace(/\/+$/, '')
}

export function normalizeWsUrl(url?: string | null): string {
  if (!url || !url.trim()) return DEFAULT_WS_URL
  let trimmed = url.trim()
  if (trimmed.startsWith('http://')) {
    trimmed = 'ws://' + trimmed.slice(7)
  } else if (trimmed.startsWith('https://')) {
    trimmed = 'wss://' + trimmed.slice(8)
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.pathname === '/' || parsed.pathname === '') {
      parsed.pathname = '/api/v1/ws'
    }
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return trimmed
  }
}

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

    const envApiKey =
      (typeof process !== 'undefined' && process.env?.PIA_API_KEY) ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PIA_API_KEY) ||
      ''
    const envBaseUrl =
      (typeof process !== 'undefined' && process.env?.PIA_BASE_URL) ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PIA_BASE_URL) ||
      ''
    const envWsUrl =
      (typeof process !== 'undefined' && process.env?.PIA_WS_URL) ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PIA_WS_URL) ||
      ''

    if (!this.inMemoryCreds?.apiKey && envApiKey) {
      this.inMemoryCreds = {
        apiKey: envApiKey,
        baseUrl: normalizeBaseUrl(envBaseUrl),
        wsUrl: normalizeWsUrl(envWsUrl)
      }
    }

    if (this.inMemoryCreds) {
      this.inMemoryCreds.baseUrl = normalizeBaseUrl(this.inMemoryCreds.baseUrl)
      this.inMemoryCreds.wsUrl = normalizeWsUrl(this.inMemoryCreds.wsUrl)
    }

    this.initialized = true
  }

  public getStatus(): CredentialStatus {
    return {
      hasApiKey: Boolean(this.inMemoryCreds?.apiKey),
      isSecureStorage: true,
      baseUrl: normalizeBaseUrl(this.inMemoryCreds?.baseUrl),
      wsUrl: normalizeWsUrl(this.inMemoryCreds?.wsUrl)
    }
  }

  public getApiKey(): string | null {
    return this.inMemoryCreds?.apiKey || null
  }

  public getBaseUrl(): string {
    return normalizeBaseUrl(this.inMemoryCreds?.baseUrl)
  }

  public getWsUrl(): string {
    return normalizeWsUrl(this.inMemoryCreds?.wsUrl)
  }

  public async saveCredentials(apiKey: string, baseUrl?: string, wsUrl?: string): Promise<boolean> {
    this.inMemoryCreds = {
      apiKey,
      baseUrl: normalizeBaseUrl(baseUrl),
      wsUrl: normalizeWsUrl(wsUrl)
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
