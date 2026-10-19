import { describe, it, expect, vi, beforeEach } from 'bun:test'
import type { Chart } from 'klinecharts'
import type { PaperPosition, PriceQuote } from '@shared/types'
import { THEME_TOKENS } from '../../theme/tokens'
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
      expect(formatPnL(1250, 'cent')).toBe('+1,250.00 ¢')
      expect(formatPnL(-450, 'cent')).toBe('-450.00 ¢')
      expect(formatPnL(0, 'cent')).toBe('+0.00 ¢')
    })

    it('formats position entry badge according to TradingView / MT5 institutional specification (no pips)', () => {
      const pos: PaperPosition = {
        id: 'pos1',
        symbol: 'EURUSD',
        side: 'buy',
        size: 0.5,
        entryPrice: 1.1235,
        timestamp: Date.now()
      }
      const markPrice = 1.12532
      const badge = formatPositionBadge(pos, markPrice, 'standard')
      expect(badge).toBe('BUY 0.50 • 1.12350 • +$0.00 ✕')
    })

    it('formats position entry badge with realistic lot size and profit in standard and USD Cent accounts', () => {
      const pos: PaperPosition = {
        id: 'pos_btc',
        symbol: 'BTCUSDT',
        side: 'buy',
        size: 1.0,
        entryPrice: 65000,
        timestamp: Date.now()
      }
      const badge = formatPositionBadge(pos, 65045.2, 'standard')
      expect(badge).toBe('BUY 1.00 • 65000.00 • +$45.20 ✕')

      // In USD Cent (USC) account: 1 USD = 100 US Cents (¢). $45.20 USD = 4,520.00 ¢
      const centBadge = formatPositionBadge(pos, 65045.2, 'cent')
      expect(centBadge).toBe('BUY 1.00 • 65000.00 • +4,520.00 ¢ ✕')
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
      expect(tpBadge).toBe('TP • 1.12800 • +$450.00 ✕')

      const slBadge = formatSlBadge(pos, 'standard')
      expect(slBadge).toBe('SL • 1.11900 • -$450.00 ✕')

      // In Cent account: 1 USD = 100 ¢
      const tpCent = formatTpBadge(pos, 'cent')
      expect(tpCent).toBe('TP • 1.12800 • +45,000.00 ¢ ✕')
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
      expect(entryCall.styles.line.style).toBe('dashed')
      expect(entryCall.lock).toBe(false)

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
      expect(figures[1].attrs.text).toContain('BUY 0.50 • 1.12350')

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

    it('applies TradingView-style green styling for profit and red/minus styling for loss', () => {
      const profitableBuyPos: PaperPosition = {
        id: 'profit1',
        symbol: 'BTCUSDT',
        side: 'buy',
        size: 1.0,
        entryPrice: 65000,
        timestamp: Date.now()
      }
      const lossBuyPos: PaperPosition = {
        id: 'loss1',
        symbol: 'BTCUSDT',
        side: 'buy',
        size: 1.0,
        entryPrice: 65100,
        timestamp: Date.now()
      }

      // Mark price is 65050 (profit1 is +50.0 pips / +$50.00, loss1 is -50.0 pips / -$50.00)
      const prices: Record<string, PriceQuote> = {
        BTCUSDT: { symbol: 'BTCUSDT', price: 65050, timestamp: Date.now() }
      }

      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [profitableBuyPos, lossBuyPos],
          currentSymbol: 'BTCUSDT',
          prices,
          accountType: 'standard'
        },
        activeOverlayIdsRef
      )

      const calls = mockChart.createOverlay.mock.calls
      const profitCall = calls.find((c: any) => c[0].id === 'pos_entry_profit1')?.[0]
      const lossCall = calls.find((c: any) => c[0].id === 'pos_entry_loss1')?.[0]

      expect(profitCall).toBeDefined()
      expect(lossCall).toBeDefined()

      // Profit figures check (Emerald / Green)
      const profitFigures = profitCall.createPointFigures({
        bounding: { width: 800, height: 600 },
        coordinates: [{ x: 100, y: 250 }],
        overlay: profitCall
      })
      expect(profitFigures[0].styles.color).toBe(THEME_TOKENS.colors.bullish)
      expect(profitFigures[1].styles.backgroundColor).toContain('16, 185, 129')
      expect(profitFigures[1].attrs.text).toContain('+$50.00')

      // Loss figures check (Rose / Red with negative sign like TradingView)
      const lossFigures = lossCall.createPointFigures({
        bounding: { width: 800, height: 600 },
        coordinates: [{ x: 100, y: 350 }],
        overlay: lossCall
      })
      expect(lossFigures[0].styles.color).toBe(THEME_TOKENS.colors.bearish)
      expect(lossFigures[1].styles.backgroundColor).toContain('244, 63, 94')
      expect(lossFigures[1].attrs.text).toContain('-$50.00')
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
      expect(entryCall.extendData.text).toContain('+$0.00')
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

    it('supports sliding position entry, TP, and SL lines with live badge updates and commit callback', () => {
      const onUpdatePosition = vi.fn()
      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [sampleBuyPos],
          currentSymbol: 'EURUSD',
          prices: samplePrices,
          accountType: 'standard',
          onUpdatePosition
        },
        activeOverlayIdsRef
      )

      const calls = mockChart.createOverlay.mock.calls
      const entryCall = calls.find((c: any) => c[0].id === 'pos_entry_buy1')?.[0]
      expect(entryCall.lock).toBe(false)
      expect(entryCall.onPressedMoving).toBeDefined()
      expect(entryCall.onPressedMoveEnd).toBeDefined()

      // Simulate dragging entry line
      const movingEvent = {
        overlay: {
          points: [{ value: 1.1240 }],
          extendData: { text: entryCall.extendData.text }
        }
      }
      entryCall.onPressedMoving(movingEvent)
      expect(movingEvent.overlay.extendData.text).toContain('BUY 0.50 • 1.12400')

      // Simulate releasing entry line
      entryCall.onPressedMoveEnd({ overlay: { points: [{ value: 1.1240 }] } })
      expect(onUpdatePosition).toHaveBeenCalledWith('buy1', { entryPrice: 1.1240 })

      // Check TP drag commit
      const tpCall = calls.find((c: any) => c[0].id === 'pos_tp_buy1')?.[0]
      expect(tpCall.lock).toBe(false)
      tpCall.onPressedMoveEnd({ overlay: { points: [{ value: 1.1290 }] } })
      expect(onUpdatePosition).toHaveBeenCalledWith('buy1', { takeProfit: 1.1290 })

      // Check SL drag commit
      const slCall = calls.find((c: any) => c[0].id === 'pos_sl_buy1')?.[0]
      expect(slCall.lock).toBe(false)
      slCall.onPressedMoveEnd({ overlay: { points: [{ value: 1.1180 }] } })
      expect(onUpdatePosition).toHaveBeenCalledWith('buy1', { stopLoss: 1.1180 })
    })

    it('renders and supports sliding custom entry draft preview line', () => {
      const onUpdateCustomPrice = vi.fn()
      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [],
          currentSymbol: 'EURUSD',
          prices: samplePrices,
          accountType: 'standard',
          customEntryDraft: {
            symbol: 'EURUSD',
            price: 1.1260,
            side: 'buy',
            size: 0.25,
            active: true
          },
          onUpdateCustomEntryPrice: onUpdateCustomPrice
        },
        activeOverlayIdsRef
      )

      expect(activeOverlayIdsRef.current.has('draft_custom_entry')).toBe(true)
      const calls = mockChart.createOverlay.mock.calls
      const draftCall = calls.find((c: any) => c[0].id === 'draft_custom_entry')?.[0]
      expect(draftCall).toBeDefined()
      expect(draftCall.lock).toBe(false)
      expect(draftCall.points[0].value).toBe(1.1260)
      expect(draftCall.extendData.text).toContain('CUSTOM BUY 0.25 • 1.12600')

      // Simulate dragging custom draft line
      const movingEvent = {
        overlay: {
          points: [{ value: 1.1275 }],
          extendData: { text: draftCall.extendData.text }
        }
      }
      draftCall.onPressedMoving(movingEvent)
      expect(movingEvent.overlay.extendData.text).toContain('1.12750')
      expect(onUpdateCustomPrice).toHaveBeenCalledWith(1.1275)

      // Simulate release
      draftCall.onPressedMoveEnd({ overlay: { points: [{ value: 1.1275 }] } })
      expect(onUpdateCustomPrice).toHaveBeenCalledWith(1.1275)
    })

    it('renders and supports sliding pending order lines with cancel and update callbacks', () => {
      const onCancelOrder = vi.fn()
      const onUpdateOrder = vi.fn()
      const samplePendingOrder: PaperOrder = {
        id: 'ord_1',
        symbol: 'EURUSD',
        type: 'buy_limit',
        side: 'buy',
        price: 1.1200,
        size: 0.1,
        timestamp: Date.now(),
        status: 'pending'
      }

      syncPositionOverlays(
        {
          chart: mockChart as unknown as Chart,
          positions: [],
          orders: [samplePendingOrder],
          currentSymbol: 'EURUSD',
          prices: samplePrices,
          accountType: 'standard',
          onCancelOrder,
          onUpdateOrder
        },
        activeOverlayIdsRef
      )

      expect(activeOverlayIdsRef.current.has('order_ord_1')).toBe(true)
      const calls = mockChart.createOverlay.mock.calls
      const orderCall = calls.find((c: any) => c[0].id === 'order_ord_1')?.[0]
      expect(orderCall).toBeDefined()
      expect(orderCall.lock).toBe(false)
      expect(orderCall.points[0].value).toBe(1.1200)
      expect(orderCall.extendData.text).toContain('BUY LIMIT 0.10 • 1.12000 ✕')

      // Test cancel onClick
      expect(orderCall.onClick).toBeDefined()
      orderCall.onClick()
      expect(onCancelOrder).toHaveBeenCalledWith('ord_1')

      // Test drag move
      const movingEvent = {
        overlay: {
          points: [{ value: 1.1190 }],
          extendData: { text: orderCall.extendData.text }
        }
      }
      orderCall.onPressedMoving(movingEvent)
      expect(movingEvent.overlay.extendData.text).toContain('BUY LIMIT 0.10 • 1.11900 ✕')

      // Test drag commit
      orderCall.onPressedMoveEnd({ overlay: { points: [{ value: 1.1190 }] } })
      expect(onUpdateOrder).toHaveBeenCalledWith('ord_1', { price: 1.1190 })
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
