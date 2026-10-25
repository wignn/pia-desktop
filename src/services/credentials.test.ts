import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CredentialManager, normalizeWsUrl, normalizeBaseUrl } from './credentials'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

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
    invokeMock.mockReset()
    invokeMock.mockImplementation(async (command: string, args?: { content?: string }) => {
      if (command === 'load_credentials') return null
      if (command === 'save_credentials') return undefined
      throw new Error(`Unexpected invoke: ${command}`)
    })
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    manager = new CredentialManager()
  })

  it('sanitizes bare domain wsUrl during saveCredentials', async () => {
    await manager.initialize()
    await manager.saveCredentials('test-key', 'https://api-engine.wign.dev/', 'wss://api-engine.wign.dev')
    expect(manager.getWsUrl()).toBe('wss://api-engine.wign.dev/api/v1/ws')
    expect(manager.getBaseUrl()).toBe('https://api-engine.wign.dev')
  })

  it('stores credentials only through the native credential command', async () => {
    await manager.initialize()
    expect(await manager.saveCredentials('native-secret')).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith('save_credentials', {
      content: expect.stringContaining('native-secret')
    })
    expect(invokeMock).not.toHaveBeenCalledWith('save_credentials', expect.objectContaining({ key: 'pia_cached_session' }))
  })

  it('restores credentials returned by native storage after reinitialization', async () => {
    let stored: string | null = null
    invokeMock.mockImplementation(async (command: string, args?: { content?: string }) => {
      if (command === 'load_credentials') return stored
      if (command === 'save_credentials') {
        stored = args?.content?.trim() || null
        return undefined
      }
      throw new Error(`Unexpected invoke: ${command}`)
    })

    await manager.initialize()
    expect(await manager.saveCredentials('persisted-key')).toBe(true)

    const restartedManager = new CredentialManager()
    await restartedManager.initialize()
    expect(restartedManager.getStatus().isLoggedIn).toBe(true)
    expect(restartedManager.getApiKey()).toBe('persisted-key')
  })

  it('exposes native credential storage failures', async () => {
    invokeMock.mockRejectedValue(new Error('OS credential vault unavailable'))

    await manager.initialize()
    expect(manager.getStorageError()).toBe('OS credential vault unavailable')
    expect(manager.getStatus().storageError).toBe('OS credential vault unavailable')
    expect(await manager.saveCredentials('secret')).toBe(false)
    expect(manager.getStorageError()).toBe('OS credential vault unavailable')
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

    await manager.initialize()
    await manager.saveCredentials('my-key')
    expect(manager.getStatus().isLoggedIn).toBe(true)

    await manager.clearCredentials()
    expect(manager.getStatus().isLoggedIn).toBe(false)
    expect(manager.getStatus().hasApiKey).toBe(false)
    expect(localStorage.getItem('pia_cached_session')).toBeNull()

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
