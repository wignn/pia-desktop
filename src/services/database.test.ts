import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from './database'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('sql.js', () => ({ default: vi.fn() }))

describe('DatabaseService persistence', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
  })

  it('persists a pending write when flushed before the debounce timer fires', async () => {
    const service = new DatabaseService() as any
    service.db = { export: () => new Uint8Array([1, 2, 3]) }
    service.scheduleDiskWrite(60_000)

    await service.flushSync()

    expect(invokeMock).toHaveBeenCalledOnce()
    expect(invokeMock).toHaveBeenCalledWith('save_db', { data: [1, 2, 3] })
    expect(service.saveTimeout).toBeNull()
  })

  it('rejects a flush when native persistence fails', async () => {
    const failure = new Error('disk full')
    invokeMock.mockRejectedValueOnce(failure)
    const service = new DatabaseService() as any
    service.db = { export: () => new Uint8Array([4]) }

    await expect(service.flushSync()).rejects.toBe(failure)
  })
})
