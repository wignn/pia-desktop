import { describe, it, expect, beforeEach } from 'vitest'
import { CredentialManager, normalizeWsUrl, normalizeBaseUrl } from './credentials'

describe('normalizeWsUrl & normalizeBaseUrl', () => {
  it('normalizes missing or empty wsUrl to standard default', () => {
    expect(normalizeWsUrl('')).toBe('wss://api-engine.wign.dev/api/v1/ws')
    expect(normalizeWsUrl(null)).toBe('wss://api-engine.wign.dev/api/v1/ws')
    expect(normalizeWsUrl(undefined)).toBe('wss://api-engine.wign.dev/api/v1/ws')
    expect(normalizeWsUrl('   ')).toBe('wss://api-engine.wign.dev/api/v1/ws')
  })

  it('appends /api/v1/ws when only root domain is provided', () => {
    expect(normalizeWsUrl('wss://api-engine.wign.dev')).toBe('wss://api-engine.wign.dev/api/v1/ws')
    expect(normalizeWsUrl('wss://api-engine.wign.dev/')).toBe('wss://api-engine.wign.dev/api/v1/ws')
    expect(normalizeWsUrl('https://api-engine.wign.dev')).toBe('wss://api-engine.wign.dev/api/v1/ws')
    expect(normalizeWsUrl('http://api-engine.wign.dev/')).toBe('ws://api-engine.wign.dev/api/v1/ws')
  })

  it('preserves valid endpoints that already include a path', () => {
    expect(normalizeWsUrl('wss://api-engine.wign.dev/api/v1/ws')).toBe('wss://api-engine.wign.dev/api/v1/ws')
    expect(normalizeWsUrl('wss://custom-host.org/socket')).toBe('wss://custom-host.org/socket')
  })

  it('strips wi_live_ token from wsUrl query string', () => {
    expect(normalizeWsUrl('wss://api-engine.wign.dev/api/v1/ws?api_key=wi_live_12345')).toBe(
      'wss://api-engine.wign.dev/api/v1/ws'
    )
  })

  it('normalizes baseUrl properly', () => {
    expect(normalizeBaseUrl('')).toBe('https://api-engine.wign.dev')
    expect(normalizeBaseUrl(null)).toBe('https://api-engine.wign.dev')
    expect(normalizeBaseUrl('https://api-engine.wign.dev/')).toBe('https://api-engine.wign.dev')
    expect(normalizeBaseUrl('https://api-engine.wign.dev')).toBe('https://api-engine.wign.dev')
  })
})

describe('CredentialManager endpoint resilience', () => {
  let manager: CredentialManager

  beforeEach(() => {
    manager = new CredentialManager()
  })

  it('sanitizes bare domain wsUrl during saveCredentials', async () => {
    await manager.saveCredentials('test-key', 'https://api-engine.wign.dev/', 'wss://api-engine.wign.dev')
    expect(manager.getWsUrl()).toBe('wss://api-engine.wign.dev/api/v1/ws')
    expect(manager.getBaseUrl()).toBe('https://api-engine.wign.dev')
  })

  it('keeps user logged out after clearCredentials across initialization', async () => {
    // Provide polyfill if localStorage is missing in pure node test runner
    if (typeof localStorage === 'undefined') {
      const store: Record<string, string> = {}
      ;(globalThis as any).localStorage = {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v },
        removeItem: (k: string) => { delete store[k] }
      }
    }

    await manager.saveCredentials('my-key')
    expect(manager.getStatus().isLoggedIn).toBe(true)

    await manager.clearCredentials()
    expect(manager.getStatus().isLoggedIn).toBe(false)
    expect(manager.getStatus().hasApiKey).toBe(false)
    expect(localStorage.getItem('pia_logged_out')).toBe('true')

    const newManager = new CredentialManager()
    await newManager.initialize()
    expect(newManager.getStatus().isLoggedIn).toBe(false)
    expect(newManager.getStatus().hasApiKey).toBe(false)
  })

  it('falls back to silvia when authenticated via desktopCredential with empty apiKey', async () => {
    await manager.saveDesktopCredential('wi_live_abc123', { name: 'Tester', email: 'test@example.com' })
    expect(manager.getStatus().isLoggedIn).toBe(true)
    expect(manager.getDesktopCredential()).toBe('wi_live_abc123')
    expect(manager.getApiKey()).toBe('silvia')
  })

  it('preserves custom apiKey when explicitly configured', async () => {
    await manager.saveCredentials('custom-secret-key')
    expect(manager.getApiKey()).toBe('custom-secret-key')
  })

  it('replaces OAuth token in apiKey with silvia fallback', async () => {
    await manager.saveCredentials('wi_live_accidentally_saved')
    expect(manager.getApiKey()).toBe('silvia')
  })
})
