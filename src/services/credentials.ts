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
  desktopCredential?: string
  baseUrl?: string
  wsUrl?: string
}

export class CredentialManager {
  private inMemoryCreds: StoredCredentials | null = null
  private initialized = false

  private async persist(content: string): Promise<boolean> {
    try {
      await invoke('save_credentials', { content })
      return true
    } catch {
      return false
    }
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return
    try {
      const content = await invoke<string | null>('load_credentials')
      if (content) {
        this.inMemoryCreds = JSON.parse(content)
      }
    } catch {
      this.inMemoryCreds = null
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
      hasApiKey: Boolean(this.inMemoryCreds?.apiKey || this.inMemoryCreds?.desktopCredential),
      isLoggedIn: Boolean(this.inMemoryCreds?.desktopCredential || this.inMemoryCreds?.apiKey),
      isSecureStorage: true,
      baseUrl: normalizeBaseUrl(this.inMemoryCreds?.baseUrl),
      wsUrl: normalizeWsUrl(this.inMemoryCreds?.wsUrl)
    }
  }

  public getApiKey(): string | null {
    return this.inMemoryCreds?.desktopCredential || this.inMemoryCreds?.apiKey || null
  }

  public getBaseUrl(): string {
    return normalizeBaseUrl(this.inMemoryCreds?.baseUrl)
  }

  public getWsUrl(): string {
    return normalizeWsUrl(this.inMemoryCreds?.wsUrl)
  }

  public async saveCredentials(apiKey: string, baseUrl?: string, wsUrl?: string): Promise<boolean> {
    const next = {
      apiKey,
      baseUrl: normalizeBaseUrl(baseUrl),
      wsUrl: normalizeWsUrl(wsUrl)
    }
    if (!(await this.persist(JSON.stringify(next)))) return false
    this.inMemoryCreds = next
    return true
  }

  public async saveDesktopCredential(desktopCredential: string): Promise<boolean> {
    const next = {
      apiKey: '',
      desktopCredential,
      baseUrl: normalizeBaseUrl(this.inMemoryCreds?.baseUrl),
      wsUrl: normalizeWsUrl(this.inMemoryCreds?.wsUrl)
    }
    if (!(await this.persist(JSON.stringify(next)))) return false
    this.inMemoryCreds = next
    return true
  }

  public async clearCredentials(): Promise<boolean> {
    if (!(await this.persist(''))) return false
    this.inMemoryCreds = null
    return true
  }

}
