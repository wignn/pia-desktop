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
  name?: string
  email?: string
  avatarUrl?: string
  plan?: string
}

export class CredentialManager {
  private inMemoryCreds: StoredCredentials | null = null
  private initialized = false
  private defaultBaseUrl: string = DEFAULT_BASE_URL
  private defaultWsUrl: string = DEFAULT_WS_URL

  private async persist(content: string): Promise<boolean> {
    try {
      if (typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)) {
        await invoke('save_credentials', { content })
      }
      return true
    } catch {
      return false
    }
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return

    const envBaseUrl =
      (typeof process !== 'undefined' && process.env?.PIA_BASE_URL) ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PIA_BASE_URL) ||
      ''
    const envWsUrl =
      (typeof process !== 'undefined' && process.env?.PIA_WS_URL) ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PIA_WS_URL) ||
      ''

    if (envBaseUrl) this.defaultBaseUrl = normalizeBaseUrl(envBaseUrl)
    if (envWsUrl) this.defaultWsUrl = normalizeWsUrl(envWsUrl)

    const isExplicitlyLoggedOut =
      typeof localStorage !== 'undefined' && localStorage.getItem('pia_logged_out') === 'true'

    if (!isExplicitlyLoggedOut) {
      try {
        if (typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)) {
          const content = await invoke<string | null>('load_credentials')
          if (content && content.trim()) {
            this.inMemoryCreds = JSON.parse(content)
          }
        }
      } catch {
        this.inMemoryCreds = null
      }
    } else {
      this.inMemoryCreds = null
    }

    if (this.inMemoryCreds) {
      this.inMemoryCreds.baseUrl = normalizeBaseUrl(this.inMemoryCreds.baseUrl || this.defaultBaseUrl)
      this.inMemoryCreds.wsUrl = normalizeWsUrl(this.inMemoryCreds.wsUrl || this.defaultWsUrl)
    }

    this.initialized = true
  }

  public getStatus(): CredentialStatus {
    const hasCreds = Boolean(this.inMemoryCreds?.desktopCredential || this.inMemoryCreds?.apiKey)
    return {
      hasApiKey: hasCreds,
      isLoggedIn: hasCreds,
      isSecureStorage: true,
      baseUrl: this.getBaseUrl(),
      wsUrl: this.getWsUrl(),
      name: this.inMemoryCreds?.name,
      email: this.inMemoryCreds?.email,
      avatarUrl: this.inMemoryCreds?.avatarUrl,
      plan: this.inMemoryCreds?.plan || 'free'
    }
  }

  public getApiKey(): string | null {
    return this.inMemoryCreds?.desktopCredential || this.inMemoryCreds?.apiKey || null
  }

  public getBaseUrl(): string {
    return normalizeBaseUrl(this.inMemoryCreds?.baseUrl || this.defaultBaseUrl)
  }

  public getWsUrl(): string {
    return normalizeWsUrl(this.inMemoryCreds?.wsUrl || this.defaultWsUrl)
  }

  public async saveCredentials(apiKey: string, baseUrl?: string, wsUrl?: string): Promise<boolean> {
    const next: StoredCredentials = {
      ...this.inMemoryCreds,
      apiKey,
      baseUrl: normalizeBaseUrl(baseUrl || this.getBaseUrl()),
      wsUrl: normalizeWsUrl(wsUrl || this.getWsUrl())
    }
    if (!(await this.persist(JSON.stringify(next)))) return false
    this.inMemoryCreds = next
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('pia_logged_out')
    }
    return true
  }

  public async saveDesktopCredential(
    desktopCredential: string,
    user?: { name?: string; email?: string; avatarUrl?: string; plan?: string }
  ): Promise<boolean> {
    const next: StoredCredentials = {
      apiKey: '',
      desktopCredential,
      baseUrl: normalizeBaseUrl(this.inMemoryCreds?.baseUrl || this.getBaseUrl()),
      wsUrl: normalizeWsUrl(this.inMemoryCreds?.wsUrl || this.getWsUrl()),
      name: user?.name || this.inMemoryCreds?.name,
      email: user?.email || this.inMemoryCreds?.email,
      avatarUrl: user?.avatarUrl || this.inMemoryCreds?.avatarUrl,
      plan: user?.plan || this.inMemoryCreds?.plan || 'free'
    }
    if (!(await this.persist(JSON.stringify(next)))) return false
    this.inMemoryCreds = next
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('pia_logged_out')
    }
    return true
  }

  public async saveUserMetadata(user: {
    name?: string
    email?: string
    avatarUrl?: string
    plan?: string
  }): Promise<boolean> {
    if (!this.inMemoryCreds) return false
    const next: StoredCredentials = {
      ...this.inMemoryCreds,
      name: user.name || this.inMemoryCreds.name,
      email: user.email || this.inMemoryCreds.email,
      avatarUrl: user.avatarUrl || this.inMemoryCreds.avatarUrl,
      plan: user.plan || this.inMemoryCreds.plan || 'free'
    }
    if (!(await this.persist(JSON.stringify(next)))) return false
    this.inMemoryCreds = next
    return true
  }

  public async clearCredentials(): Promise<boolean> {
    this.inMemoryCreds = null
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pia_logged_out', 'true')
    }
    await this.persist('')
    return true
  }

}
