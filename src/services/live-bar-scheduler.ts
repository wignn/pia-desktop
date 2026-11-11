import type { KLineData } from 'klinecharts'

export function createLiveBarScheduler(deliver: (bar: KLineData) => void, isCurrent = () => true) {
  let frame: number | null = null
  let generation = -1
  const pending = new Map<number, KLineData>()

  function cancel(): void {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    pending.clear()
  }

  return {
    push(nextGeneration: number, bar: KLineData): void {
      if (generation !== nextGeneration) {
        cancel()
        generation = nextGeneration
      }
      pending.set(bar.timestamp, { ...bar })
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        const bars = [...pending.values()].sort((a, b) => a.timestamp - b.timestamp)
        pending.clear()
        for (const value of bars) {
          if (!isCurrent()) break
          deliver(value)
        }
      })
    },
    cancel
  }
}
