import { describe, it, expect, vi, beforeEach } from 'bun:test'
import type { Chart } from 'klinecharts'
import type { PaperPosition, PriceQuote } from '@shared/types'
import {
  syncPositionOverlays,
  clearPositionOverlays,
  formatPnL,
  formatPositionBadge,
  formatTpBadge,
  formatSlBadge,
  calculatePipDifference,
  calculatePositionPnL
} from './position-overlay-sync'

describe('position-overlay-sync', () => {
  let mockChart: {
    createOverlay: ReturnType<typeof vi.fn>
    removeOverlay: ReturnType<typeof vi.fn>
  }
  let activeOverlayIdsRef: { current: Set<string> }

  beforeEach(() => {
    mockChart = {
      createOverlay: vi.fn(),
      removeOverlay: vi.fn()
    }
    activeOverlayIdsRef = { current: new Set<string>() }
  })

  describe('PnL and Badge Formatting', () => {
    it('formats Standard vs Cent PnL tags correctly', () => {
      // Standard account formatting
      expect(formatPnL(45.2, 'standard')).toBe('+$45.20')
      expect(formatPnL(-18.5, 'standard')).toBe('-$18.50')
      expect(formatPnL(0, 'standard')).toBe('+$0.00')

      // Cent account formatting
      expect(formatPnL(1250, 'cent')).toBe('+1,250 ¢')
      expect(formatPnL(-450, 'cent')).toBe('-$450 ¢')
      expect(formatPnL(0, 'cent')).toBe('+0 ¢')
    })

    it('formats position entry badge according to specification', () => {
      const pos: PaperPosition = {
        id: 'pos1',
        symbol: 'EURUSD',
        side: 'buy',
        size: 0.5,
        entryPrice: 1.1235,
        timestamp: Date.now()
      }
      const markPrice = 1.12532 // +18.2 pips
      const badge = formatPositionBadge(pos, markPrice, 'standard')
      expect(badge).toContain('BUY 0.50 L @ 1.12350')
      expect(badge).toContain('+18.2 pips')
      expect(badge).toMatch(/^\[BUY 0\.50 L @ 1\.12350 \| \+\$0\.00 \(\+18\.2 pips\)\]$/)
    })

    it('formats position entry badge with realistic lot size and profit', () => {
      const pos: PaperPosition = {
        id: 'pos_btc',
        symbol: 'BTCUSDT',
        side: 'buy',
        size: 1.0,
        entryPrice: 65000,
        timestamp: Date.now()
      }
      const badge = formatPositionBadge(pos, 65045.2, 'standard')
      expect(badge).toBe('[BUY 1.00 L @ 65000.00 | +$45.20 (+45.2 pips)]')

      const centBadge = formatPositionBadge(pos, 65045.2, 'cent')
      expect(centBadge).toBe('[BUY 1.00 L @ 65000.00 | +45 ¢ (+45.2 pips)]')
    })

    it('formats TP and SL badges according to specification', () => {
      const pos: PaperPosition = {
        id: 'pos1',
        symbol: 'EURUSD',
        side: 'buy',
        size: 100000,
        entryPrice: 1.1235,
        takeProfit: 1.128,
        stopLoss: 1.119,
        timestamp: Date.now()
      }
      const tpBadge = formatTpBadge(pos, 'standard')
      expect(tpBadge).toBe('[TP 1.12800 | +$450.00]')

      const slBadge = formatSlBadge(pos, 'standard')
      expect(slBadge).toBe('[SL 1.11900 | -$450.00]')

      const tpCent = formatTpBadge(pos, 'cent')
      expect(tpCent).toBe('[TP 1.12800 | +450 ¢]')
    })

    it('returns empty string if TP or SL is undefined', () => {
      const pos: PaperPosition = {
        id: 'pos_none',
        symbol: 'EURUSD',
        side: 'sell',
        size: 1,
        entryPrice: 1.12,
        timestamp: Date.now()
      }
      expect(formatTpBadge(pos, 'standard')).toBe('')
      expect(formatSlBadge(pos, 'standard')).toBe('')
    })

    it('calculates pips correctly for JPY and crypto', () => {
      const posJpy: PaperPosition = {
        id: 'jpy',
        symbol: 'USDJPY',
        side: 'buy',
        size: 1,
        entryPrice: 150.0,
        timestamp: Date.now()
      }
      expect(calculatePipDifference(posJpy, 150.15)).toBeCloseTo(15.0)

      const posBtc: PaperPosition = {
        id: 'btc',
        symbol: 'BTCUSDT',
        side: 'sell',
        size: 1,
        entryPrice: 65000.0,
        timestamp: Date.now()
      }
      expect(calculatePipDifference(posBtc, 64950.0)).toBeCloseTo(50.0)
    })

    it('calculates position PnL correctly for buy and sell sides', () => {
      const buyPos: PaperPosition = {
        id: 'b',
        symbol: 'AAPL',
        side: 'buy',
        size: 10,
        entryPrice: 150,
        timestamp: Date.now()
      }
      expect(calculatePositionPnL(buyPos, 155)).toBe(50)

      const sellPos: PaperPosition = {
        id: 's',
        symbol: 'AAPL',
        side: 'sell',
        size: 10,
        entryPrice: 150,
        timestamp: Date.now()
      }
      expect(calculatePositionPnL(sellPos, 155)).toBe(-50)
    })
  })

  describe('syncPositionOverlays', () => {
    const sampleBuyPos: PaperPosition = {
      id: 'buy1',
      symbol: 'EURUSD',
      side: 'buy',
      size: 0.5,
      entryPrice: 1.1235,
      takeProfit: 1.128,
      stopLoss: 1.119,
      timestamp: Date.now()
    }

    const samplePrices: Record<string, PriceQuote> = {
      EURUSD: {
        symbol: 'EURUSD',
        price: 1.12532,
        timestamp: Date.now()
      }
    }

    it('creates Entry, TP, and SL overlays for matching positions', () => {
      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [sampleBuyPos],
          currentSymbol: 'EURUSD',
          prices: samplePrices,
          accountType: 'standard'
        },
        activeOverlayIdsRef
      )

      expect(mockChart.createOverlay).toHaveBeenCalledTimes(3)
      expect(activeOverlayIdsRef.current.has('pos_entry_buy1')).toBe(true)
      expect(activeOverlayIdsRef.current.has('pos_tp_buy1')).toBe(true)
      expect(activeOverlayIdsRef.current.has('pos_sl_buy1')).toBe(true)

      const calls = mockChart.createOverlay.mock.calls
      const entryCall = calls.find((c: any) => c[0].id === 'pos_entry_buy1')?.[0]
      expect(entryCall).toBeDefined()
      expect(entryCall.name).toBe('priceLine')
      expect(entryCall.points[0].value).toBe(1.1235)
      expect(entryCall.styles.line.style).toBe('solid')
      expect(entryCall.lock).toBe(true)

      // Test createPointFigures execution
      const figures = entryCall.createPointFigures({
        bounding: { width: 800, height: 600 },
        coordinates: [{ x: 100, y: 250 }],
        overlay: entryCall
      })
      expect(figures).toHaveLength(2)
      expect(figures[0].type).toBe('line')
      expect(figures[0].attrs.coordinates[1].x).toBe(800)
      expect(figures[1].type).toBe('text')
      expect(figures[1].attrs.text).toContain('BUY 0.50 L @ 1.12350')

      const tpCall = calls.find((c: any) => c[0].id === 'pos_tp_buy1')?.[0]
      expect(tpCall).toBeDefined()
      expect(tpCall.name).toBe('priceLine')
      expect(tpCall.points[0].value).toBe(1.128)
      expect(tpCall.styles.line.style).toBe('dashed')

      const slCall = calls.find((c: any) => c[0].id === 'pos_sl_buy1')?.[0]
      expect(slCall).toBeDefined()
      expect(slCall.name).toBe('priceLine')
      expect(slCall.points[0].value).toBe(1.119)
      expect(slCall.styles.line.style).toBe('dashed')
    })

    it('ignores positions that do not match the current symbol', () => {
      const gbpPos: PaperPosition = {
        id: 'gbp1',
        symbol: 'GBPUSD',
        side: 'buy',
        size: 1.0,
        entryPrice: 1.25,
        timestamp: Date.now()
      }

      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [gbpPos],
          currentSymbol: 'EURUSD',
          prices: samplePrices,
          accountType: 'standard'
        },
        activeOverlayIdsRef
      )

      expect(mockChart.createOverlay).not.toHaveBeenCalled()
      expect(activeOverlayIdsRef.current.size).toBe(0)
    })

    it('handles mixed matching and non-matching positions', () => {
      const gbpPos: PaperPosition = {
        id: 'gbp1',
        symbol: 'GBPUSD',
        side: 'buy',
        size: 1.0,
        entryPrice: 1.25,
        timestamp: Date.now()
      }

      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [sampleBuyPos, gbpPos],
          currentSymbol: 'EURUSD',
          prices: samplePrices,
          accountType: 'standard'
        },
        activeOverlayIdsRef
      )

      expect(mockChart.createOverlay).toHaveBeenCalledTimes(3)
      expect(activeOverlayIdsRef.current.has('pos_entry_buy1')).toBe(true)
      expect(activeOverlayIdsRef.current.has('pos_entry_gbp1')).toBe(false)
    })

    it('cleans up overlays when a position is closed', () => {
      // Step 1: Initial sync with position
      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [sampleBuyPos],
          currentSymbol: 'EURUSD',
          prices: samplePrices,
          accountType: 'standard'
        },
        activeOverlayIdsRef
      )

      expect(activeOverlayIdsRef.current.size).toBe(3)
      mockChart.removeOverlay.mockClear()

      // Step 2: Position closed, positions is now empty
      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [],
          currentSymbol: 'EURUSD',
          prices: samplePrices,
          accountType: 'standard'
        },
        activeOverlayIdsRef
      )

      expect(mockChart.removeOverlay).toHaveBeenCalledWith({ id: 'pos_entry_buy1' })
      expect(mockChart.removeOverlay).toHaveBeenCalledWith({ id: 'pos_tp_buy1' })
      expect(mockChart.removeOverlay).toHaveBeenCalledWith({ id: 'pos_sl_buy1' })
      expect(activeOverlayIdsRef.current.size).toBe(0)
    })

    it('cleans up overlays when symbol changes to null or different symbol', () => {
      // Step 1: Initial sync
      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [sampleBuyPos],
          currentSymbol: 'EURUSD',
          prices: samplePrices,
          accountType: 'standard'
        },
        activeOverlayIdsRef
      )

      expect(activeOverlayIdsRef.current.size).toBe(3)
      mockChart.removeOverlay.mockClear()

      // Step 2: Clear overlays when currentSymbol becomes null
      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [sampleBuyPos],
          currentSymbol: null,
          prices: samplePrices,
          accountType: 'standard'
        },
        activeOverlayIdsRef
      )

      expect(mockChart.removeOverlay).toHaveBeenCalledWith({ id: 'pos_entry_buy1' })
      expect(mockChart.removeOverlay).toHaveBeenCalledWith({ id: 'pos_tp_buy1' })
      expect(mockChart.removeOverlay).toHaveBeenCalledWith({ id: 'pos_sl_buy1' })
      expect(activeOverlayIdsRef.current.size).toBe(0)
    })

    it('re-creates/updates overlays when prices update on live ticks', () => {
      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [sampleBuyPos],
          currentSymbol: 'EURUSD',
          prices: samplePrices,
          accountType: 'standard'
        },
        activeOverlayIdsRef
      )

      expect(mockChart.createOverlay).toHaveBeenCalledTimes(3)

      // Live tick price update
      const updatedPrices: Record<string, PriceQuote> = {
        EURUSD: {
          symbol: 'EURUSD',
          price: 1.127,
          timestamp: Date.now()
        }
      }

      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [sampleBuyPos],
          currentSymbol: 'EURUSD',
          prices: updatedPrices,
          accountType: 'standard'
        },
        activeOverlayIdsRef
      )

      // Overlay should be updated/recreated
      expect(mockChart.createOverlay).toHaveBeenCalledTimes(6)
    })

    it('does not create TP or SL overlays if not specified on the position', () => {
      const posNoSltp: PaperPosition = {
        id: 'no_sltp',
        symbol: 'EURUSD',
        side: 'buy',
        size: 1.0,
        entryPrice: 1.12,
        timestamp: Date.now()
      }

      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [posNoSltp],
          currentSymbol: 'EURUSD',
          prices: samplePrices,
          accountType: 'standard'
        },
        activeOverlayIdsRef
      )

      expect(mockChart.createOverlay).toHaveBeenCalledTimes(1)
      expect(activeOverlayIdsRef.current.has('pos_entry_no_sltp')).toBe(true)
      expect(activeOverlayIdsRef.current.has('pos_tp_no_sltp')).toBe(false)
      expect(activeOverlayIdsRef.current.has('pos_sl_no_sltp')).toBe(false)
    })

    it('falls back gracefully to entry price when no quote exists', () => {
      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [sampleBuyPos],
          currentSymbol: 'EURUSD',
          prices: {},
          accountType: 'standard'
        },
        activeOverlayIdsRef
      )

      expect(mockChart.createOverlay).toHaveBeenCalledTimes(3)
      const calls = mockChart.createOverlay.mock.calls
      const entryCall = calls.find((c: any) => c[0].id === 'pos_entry_buy1')?.[0]
      expect(entryCall.extendData.text).toContain('+$0.00 (+0.0 pips)')
    })

    it('attaches onClosePosition callback when provided', () => {
      const onClose = vi.fn()
      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [sampleBuyPos],
          currentSymbol: 'EURUSD',
          prices: samplePrices,
          accountType: 'standard',
          onClosePosition: onClose
        },
        activeOverlayIdsRef
      )

      const calls = mockChart.createOverlay.mock.calls
      const entryCall = calls.find((c: any) => c[0].id === 'pos_entry_buy1')?.[0]
      expect(entryCall.onClick).toBeDefined()
      entryCall.onClick()
      expect(onClose).toHaveBeenCalledWith('buy1')
    })
  })

  describe('clearPositionOverlays', () => {
    it('removes all active overlays and clears the set', () => {
      activeOverlayIdsRef.current.add('pos_entry_1')
      activeOverlayIdsRef.current.add('pos_tp_1')

      clearPositionOverlays(mockChart as unknown as Chart, activeOverlayIdsRef)

      expect(mockChart.removeOverlay).toHaveBeenCalledWith({ id: 'pos_entry_1' })
      expect(mockChart.removeOverlay).toHaveBeenCalledWith({ id: 'pos_tp_1' })
      expect(activeOverlayIdsRef.current.size).toBe(0)
    })

    it('handles null chart safely', () => {
      activeOverlayIdsRef.current.add('pos_entry_1')
      expect(() => clearPositionOverlays(null, activeOverlayIdsRef)).not.toThrow()
      expect(activeOverlayIdsRef.current.size).toBe(0)
    })

    it('handles empty active overlays gracefully', () => {
      expect(() =>
        clearPositionOverlays(mockChart as unknown as Chart, activeOverlayIdsRef)
      ).not.toThrow()
      expect(mockChart.removeOverlay).not.toHaveBeenCalled()
    })
  })
})
