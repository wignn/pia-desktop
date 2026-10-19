import { describe, expect, it, vi } from 'vitest'
import {
  checkForAppUpdates,
  formatUpdateMessage,
  type AppUpdateStatus
} from './auto-updater'

describe('auto-updater service', () => {
  it('formats update message correctly for available update', () => {
    const status: AppUpdateStatus = {
      state: 'available',
      currentVersion: '0.1.0',
      availableVersion: '0.2.0',
      releaseNotes: 'Performance improvements and bug fixes'
    }

    const msg = formatUpdateMessage(status)
    expect(msg).toContain('0.2.0')
    expect(msg).toContain('Performance improvements')
  })

  it('formats message correctly when up to date', () => {
    const status: AppUpdateStatus = {
      state: 'up-to-date',
      currentVersion: '0.1.0'
    }

    const msg = formatUpdateMessage(status)
    expect(msg).toContain('latest version')
  })

  it('returns graceful status when updater checker encounters network error', async () => {
    const mockCheck = vi.fn(async () => {
      throw new Error('Network timeout reaching releases.json')
    })

    const status = await checkForAppUpdates({
      checker: mockCheck as any
    })

    expect(status.state).toBe('error')
    expect(status.error).toContain('Network timeout')
  })

  it('detects available update correctly from checker payload', async () => {
    const mockCheck = vi.fn(async () => ({
      available: true,
      version: '0.2.0',
      currentVersion: '0.1.0',
      body: 'Bug fixes and pending order improvements',
      date: '2026-10-19'
    }))

    const status = await checkForAppUpdates({
      checker: mockCheck as any
    })

    expect(status.state).toBe('available')
    expect(status.availableVersion).toBe('0.2.0')
    expect(status.releaseNotes).toBe('Bug fixes and pending order improvements')
  })

  it('reports up-to-date when checker returns available=false', async () => {
    const mockCheck = vi.fn(async () => ({
      available: false,
      currentVersion: '0.1.0'
    }))

    const status = await checkForAppUpdates({
      checker: mockCheck as any
    })

    expect(status.state).toBe('up-to-date')
    expect(status.availableVersion).toBeUndefined()
  })
})
