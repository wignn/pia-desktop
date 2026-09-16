/**
 * PIA Terminal - CandleEngine Service
 * Generation-tracked candle data pipeline with timestamp normalization,
 * deduplication, and tick buffer reconciliation during asynchronous loading.
 */

import type { CandleBar, PriceQuote, Timeframe } from '@shared/types'
import type { KLineData } from 'klinecharts'

export interface CandleEngineListener {
  onHistoryLoaded: (generationId: number, bars: KLineData[]) => void
  onBarUpdate: (generationId: number, bar: KLineData) => void
}

export class CandleEngine {
  private currentSymbol = ''
  private currentTimeframe: Timeframe = '1h'
  private generationId = 0
  private isLoading = false
  private tickBuffer: PriceQuote[] = []
  private activeBars: KLineData[] = []
  private listeners = new Set<CandleEngineListener>()

  // Replay mode state
  private isReplayMode = false
  private replayBars: KLineData[] = []
  private replayIndex = 0

  constructor(initialSymbol = '', initialTimeframe: Timeframe = '1h') {
    this.currentSymbol = initialSymbol
    this.currentTimeframe = initialTimeframe
  }

  public addListener(listener: CandleEngineListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  public getGenerationId(): number {
    return this.generationId
  }

  public getSymbol(): string {
    return this.currentSymbol
  }

  public getTimeframe(): Timeframe {
    return this.currentTimeframe
  }

  public getBars(): KLineData[] {
    return [...this.activeBars]
  }

  /**
   * Switch active symbol and timeframe, incrementing generation ID to discard
   * in-flight requests from prior view states.
   */
  public async setSymbolAndTimeframe(
    symbol: string,
    timeframe: Timeframe,
    limit = 500
  ): Promise<KLineData[]> {
    this.generationId++
    const activeGen = this.generationId
    this.currentSymbol = symbol
    this.currentTimeframe = timeframe
    this.isLoading = true
    this.tickBuffer = []
    this.activeBars = []
    this.isReplayMode = false
    this.replayBars = []
    this.replayIndex = 0

    let normalizedBars: KLineData[] = []
    let lastError: unknown

    // A transient empty response is not a valid chart state. Retry once before
    // notifying KLineChart, while keeping the same generation active.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rawBars = await window.api.market.getCandles({
          symbol,
          timeframe,
          limit
        })

        // If user switched symbol or timeframe while request was in-flight, discard.
        if (this.generationId !== activeGen) return []

        normalizedBars = this.normalizeAndSortBars(rawBars)
        if (normalizedBars.length > 0) break
      } catch (err) {
        lastError = err
        if (attempt === 1) break
      }
    }

    if (this.generationId !== activeGen) return []

    if (normalizedBars.length === 0) {
      this.isLoading = false
      if (lastError) {
        console.error(
          `[CandleEngine] Failed to load candles for ${symbol} [${timeframe}]:`,
          lastError
        )
      } else {
        console.warn(`[CandleEngine] No historical candles returned for ${symbol} [${timeframe}]`)
      }
      this.tickBuffer = []
      for (const listener of this.listeners) listener.onHistoryLoaded(activeGen, [])
      return []
    }

    this.activeBars = normalizedBars

    // Reconcile buffered ticks only after a valid historical series exists.
    for (const tick of this.tickBuffer) {
      if (tick.symbol === this.currentSymbol) this.reconcileTick(tick, false)
    }
    this.tickBuffer = []

    this.isLoading = false
    const result = [...this.activeBars]
    for (const listener of this.listeners) listener.onHistoryLoaded(activeGen, result)
    return result
  }

  /**
   * Fetch older historical bars for infinite scroll / left pan pagination.
   * Bars are strictly older than `toTimestamp`.
   */
  public async fetchOlderBars(
    toTimestamp: number,
    limit = 300
  ): Promise<{ bars: KLineData[]; hasMore: boolean }> {
    if (this.isReplayMode || this.isLoading) {
      return { bars: [], hasMore: false }
    }

    const activeGen = this.generationId
    try {
      const rawBars = await window.api.market.getCandles({
        symbol: this.currentSymbol,
        timeframe: this.currentTimeframe,
        to: toTimestamp,
        limit
      })

      // If user switched symbol or timeframe during fetch, discard
      if (this.generationId !== activeGen) {
        return { bars: [], hasMore: false }
      }

      const normalized = this.normalizeAndSortBars(rawBars)
      const olderBars = normalized.filter((b) => b.timestamp < toTimestamp)

      if (olderBars.length === 0) {
        return { bars: [], hasMore: false }
      }

      // Avoid any duplicate timestamps with current active bars
      const existingTimestamps = new Set(this.activeBars.map((b) => b.timestamp))
      const uniqueOlderBars = olderBars.filter((b) => !existingTimestamps.has(b.timestamp))

      if (uniqueOlderBars.length === 0) {
        return { bars: [], hasMore: false }
      }

      // Prepend to active bars
      this.activeBars = [...uniqueOlderBars, ...this.activeBars]

      return {
        bars: uniqueOlderBars,
        hasMore: uniqueOlderBars.length >= Math.floor(limit * 0.7)
      }
    } catch (err) {
      console.error(`[CandleEngine] Failed to fetch older bars for ${this.currentSymbol}:`, err)
      return { bars: [], hasMore: false }
    }
  }

  /**
   * Handle incoming realtime price tick from WebSocket
   */
  public handleTick(quote: PriceQuote): void {
    if (quote.symbol !== this.currentSymbol) {
      return
    }

    if (this.isReplayMode) {
      // Suspend live ticks during historical replay simulation
      return
    }

    if (this.isLoading) {
      // Buffer ticks during historical fetch
      this.tickBuffer.push(quote)
      if (this.tickBuffer.length > 200) {
        this.tickBuffer.shift()
      }
      return
    }

    this.reconcileTick(quote, true)
  }

  /**
   * Reconcile a price tick into the candle series
   */
  private reconcileTick(quote: PriceQuote, notify: boolean): void {
    const intervalMs = this.timeframeToMs(this.currentTimeframe)
    let ts = quote.timestamp
    if (ts < 1e11) ts *= 1000

    const barStartTimestamp = Math.floor(ts / intervalMs) * intervalMs
    const price = quote.price
    const currentGen = this.generationId

    // History is expected before live reconciliation. Never turn a delayed
    // initial response into a misleading one-candle chart.
    if (this.activeBars.length === 0) {
      return
    }

    const lastBarIndex = this.activeBars.length - 1
    const lastBar = this.activeBars[lastBarIndex]

    if (barStartTimestamp > lastBar.timestamp) {
      // New bar formed
      const newBar: KLineData = {
        timestamp: barStartTimestamp,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 1
      }
      this.activeBars.push(newBar)
      if (notify) {
        for (const listener of this.listeners) {
          listener.onBarUpdate(currentGen, newBar)
        }
      }
    } else {
      // Update active bar
      const updatedBar: KLineData = {
        ...lastBar,
        high: Math.max(lastBar.high, price),
        low: Math.min(lastBar.low, price),
        close: price,
        volume: (lastBar.volume || 0) + 1
      }
      this.activeBars[lastBarIndex] = updatedBar
      if (notify) {
        for (const listener of this.listeners) {
          listener.onBarUpdate(currentGen, updatedBar)
        }
      }
    }
  }

  /**
   * Ensure strict ascending order, remove duplicate timestamps, and filter valid numbers.
   */
  private normalizeAndSortBars(rawBars: CandleBar[]): KLineData[] {
    const map = new Map<number, KLineData>()

    for (const b of rawBars) {
      let ts = b.timestamp
      if (ts < 1e11) ts *= 1000

      if (
        ts > 0 &&
        !isNaN(b.open) &&
        !isNaN(b.high) &&
        !isNaN(b.low) &&
        !isNaN(b.close) &&
        b.open > 0 &&
        b.high > 0 &&
        b.low > 0 &&
        b.close > 0
      ) {
        map.set(ts, {
          timestamp: ts,
          open: b.open,
          high: Math.max(b.high, b.open, b.close),
          low: Math.min(b.low, b.open, b.close),
          close: b.close,
          volume: b.volume && !isNaN(b.volume) ? b.volume : 0
        })
      }
    }

    const result = Array.from(map.values())
    result.sort((a, b) => a.timestamp - b.timestamp)
    return result
  }

  public getActiveBars(): KLineData[] {
    return this.activeBars
  }

  /**
   * Replay Engine controls
   */
  public getReplayState(): { isReplayMode: boolean; currentIndex: number; totalBars: number } {
    return {
      isReplayMode: this.isReplayMode,
      currentIndex: this.replayIndex,
      totalBars: this.replayBars.length > 0 ? this.replayBars.length : this.activeBars.length
    }
  }

  public startReplay(
    fromIndex?: number,
    backCount = 50
  ): { currentIndex: number; totalBars: number } {
    if (!this.isReplayMode) {
      this.replayBars = [...this.activeBars]
    }
    if (this.replayBars.length === 0) {
      return { currentIndex: 0, totalBars: 0 }
    }

    const startIndex =
      typeof fromIndex === 'number'
        ? Math.max(1, Math.min(this.replayBars.length, fromIndex))
        : Math.max(1, this.replayBars.length - backCount)

    this.isReplayMode = true
    this.replayIndex = startIndex
    this.activeBars = this.replayBars.slice(0, this.replayIndex)

    const currentGen = this.generationId
    for (const listener of this.listeners) {
      listener.onHistoryLoaded(currentGen, [...this.activeBars])
    }

    return {
      currentIndex: this.replayIndex,
      totalBars: this.replayBars.length
    }
  }

  public stepReplayForward(): { bar: KLineData | null; currentIndex: number; totalBars: number } {
    if (!this.isReplayMode || this.replayIndex >= this.replayBars.length) {
      return {
        bar: null,
        currentIndex: this.replayIndex,
        totalBars: this.replayBars.length
      }
    }

    const nextBar = this.replayBars[this.replayIndex]
    this.replayIndex++
    this.activeBars.push(nextBar)

    const currentGen = this.generationId
    for (const listener of this.listeners) {
      listener.onBarUpdate(currentGen, nextBar)
    }

    return {
      bar: nextBar,
      currentIndex: this.replayIndex,
      totalBars: this.replayBars.length
    }
  }

  public jumpReplayTo(targetIndex: number): { currentIndex: number; totalBars: number } {
    if (!this.isReplayMode || this.replayBars.length === 0) {
      return { currentIndex: 0, totalBars: 0 }
    }

    const clamped = Math.max(1, Math.min(this.replayBars.length, targetIndex))
    this.replayIndex = clamped
    this.activeBars = this.replayBars.slice(0, this.replayIndex)

    const currentGen = this.generationId
    for (const listener of this.listeners) {
      listener.onHistoryLoaded(currentGen, [...this.activeBars])
    }

    return {
      currentIndex: this.replayIndex,
      totalBars: this.replayBars.length
    }
  }

  public stopReplay(): void {
    if (!this.isReplayMode) return
    this.isReplayMode = false
    this.activeBars = [...this.replayBars]
    this.replayBars = []
    this.replayIndex = 0

    const currentGen = this.generationId
    for (const listener of this.listeners) {
      listener.onHistoryLoaded(currentGen, [...this.activeBars])
    }
  }

  public timeframeToMs(tf: Timeframe): number {
    switch (tf) {
      case '1m':
        return 60 * 1000
      case '5m':
        return 5 * 60 * 1000
      case '15m':
        return 15 * 60 * 1000
      case '30m':
        return 30 * 60 * 1000
      case '1h':
        return 60 * 60 * 1000
      case '4h':
        return 4 * 60 * 60 * 1000
      case '1d':
        return 24 * 60 * 60 * 1000
      case '1w':
        return 7 * 24 * 60 * 60 * 1000
      case '1M':
        return 30 * 24 * 60 * 60 * 1000
      default:
        return 60 * 1000
    }
  }
}

// Export singleton instance for the terminal application
export const candleEngine = new CandleEngine()
