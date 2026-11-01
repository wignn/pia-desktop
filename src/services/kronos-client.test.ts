import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getCachedKronosRollout, useKronosStore } from './kronos-client'

describe('kronos-client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useKronosStore.setState({ cacheKey: '', steps: [], originClose: 0, status: 'idle' })
  })

  it('notifies late onReady listeners registered by draw() after calc() and shifts steps on intra-bar ticks', async () => {
    let resolveFetch!: (val: unknown) => void
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }) as Promise<Response>
    )

    const bars = Array.from({ length: 16 }, (_, i) => ({
      timestamp: 1700000000000 + i * 60000,
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100 + i
    }))

    // 1. calc() calls getCachedKronosRollout without onReady
    expect(getCachedKronosRollout(bars, 2)).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 2. draw() calls getCachedKronosRollout with onReady while fetch is still in-flight
    const onReady = vi.fn()
    expect(getCachedKronosRollout(bars, 2, onReady)).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 3. Resolve the in-flight Kronos CPU response
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({
        points: [
          { step: 1, open: 115, high: 118, low: 114, close: 117, q10: 113, q50: 117, q90: 120 },
          { step: 2, open: 117, high: 121, low: 116, close: 119, q10: 115, q50: 119, q90: 123 }
        ]
      })
    })

    await vi.waitFor(() => {
      expect(onReady).toHaveBeenCalledTimes(1)
    })

    // 4. Intra-bar live tick (+2.5 on last bar close, same timestamp) shifts rollout without refetching
    const tickedBars = bars.map((b, idx) =>
      idx === bars.length - 1 ? { ...b, close: b.close + 2.5 } : b
    )
    const shifted = getCachedKronosRollout(tickedBars, 2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(shifted[0].q50).toBeCloseTo(119.5)
    expect(shifted[1].close).toBeCloseTo(121.5)
  })
})
