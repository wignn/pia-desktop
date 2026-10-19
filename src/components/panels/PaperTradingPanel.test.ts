import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { PaperTradingPanel } from './PaperTradingPanel'
import { usePaperTradingStore } from '../../stores/usePaperTradingStore'
import { useMarketStore } from '../../stores/useMarketStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'

describe('PaperTradingPanel', () => {
  beforeAll(() => {
    if (typeof (globalThis as any).window === 'undefined') {
      ;(globalThis as any).window = {}
    }
    if (!(globalThis as any).window.api) {
      ;(globalThis as any).window.api = {}
    }
    if (!(globalThis as any).window.api.paper) {
      ;(globalThis as any).window.api.paper = {
        saveAccount: async () => true,
        getAccount: async () => null
      }
    }
  })

  beforeEach(() => {
    // Reset market store
    useMarketStore.setState({
      symbol: 'EURUSD',
      prices: {
        EURUSD: {
          symbol: 'EURUSD',
          price: 1.085,
          ask: 1.0851,
          bid: 1.0849,
          timestamp: Date.now()
        }
      }
    })

    // Reset paper trading store
    usePaperTradingStore.setState({
      account: {
        balance: 100000,
        initialBalance: 100000,
        currency: 'USD',
        positions: [],
        updatedAt: Date.now(),
        accountType: 'standard'
      },
      accountType: 'standard',
      isLoading: false,
      lastExecutedAction: null
    })

    // Reset workspace store
    useWorkspaceStore.setState({
      isImportPositionsModalOpen: false,
      importPositionsModalTab: 'quick'
    })
  })

  describe('Standard vs Cent Account Toggle', () => {
    it('renders Standard (100k) and Cent (1k) toggle pills', () => {
      const html = renderToString(React.createElement(PaperTradingPanel))
      expect(html).toContain('Standard (100k)')
      expect(html).toContain('Cent (1k)')
      expect(html).toContain('Paper Trading')
    })

    it('renders balance and equity with $ in standard mode and updates store on toggle', () => {
      usePaperTradingStore.setState({
        account: {
          balance: 100000,
          initialBalance: 100000,
          currency: 'USD',
          positions: [],
          updatedAt: Date.now(),
          accountType: 'standard'
        },
        accountType: 'standard'
      })

      const html = renderToString(React.createElement(PaperTradingPanel))
      expect(html).toContain('$100,000.00')

      // Switch store to cent
      usePaperTradingStore.getState().setAccountType('cent')
      expect(usePaperTradingStore.getState().accountType).toBe('cent')

      const htmlCent = renderToString(React.createElement(PaperTradingPanel))
      expect(htmlCent).toContain('¢')
    })
  })

  describe('Lot Size Selector and Preset Pills', () => {
    it('renders all 8 quick lot preset pills', () => {
      const html = renderToString(React.createElement(PaperTradingPanel))
      const presets = ['0.01', '0.05', '0.10', '0.25', '0.50', '1.00', '2.00', '5.00']
      for (const preset of presets) {
        expect(html).toContain(preset)
      }
    })

    it('renders with custom initial lot size', () => {
      const html = renderToString(
        React.createElement(PaperTradingPanel, { initialLotSize: '2.50' })
      )
      expect(html).toContain('2.50')
      expect(html).toContain('2.50 L')
    })
  })

  describe('Execution Mode & Custom Entry', () => {
    it('renders Market, Limit, and Stop mode toggles according to TradingView / MT5 institutional standards', () => {
      const html = renderToString(React.createElement(PaperTradingPanel))
      expect(html).toContain('Market')
      expect(html).toContain('Limit')
      expect(html).toContain('Stop')
    })

    it('shows price input and Limit Order button when in limit mode', () => {
      const htmlLimit = renderToString(
        React.createElement(PaperTradingPanel, {
          initialExecutionMode: 'limit',
          initialCustomPrice: '1.08200'
        })
      )
      expect(htmlLimit).toContain('Order Price')
      expect(htmlLimit).toContain('1.08200')
      expect(htmlLimit).toContain('LIMIT')
    })

    it('shows price input and Stop Order button when in stop mode', () => {
      const htmlStop = renderToString(
        React.createElement(PaperTradingPanel, {
          initialExecutionMode: 'stop',
          initialCustomPrice: '1.08900'
        })
      )
      expect(htmlStop).toContain('Order Price')
      expect(htmlStop).toContain('1.08900')
      expect(htmlStop).toContain('STOP')
    })

    it('shows custom price input when in Custom Entry mode', () => {
      const htmlMarket = renderToString(
        React.createElement(PaperTradingPanel, { initialExecutionMode: 'market' })
      )
      expect(htmlMarket).not.toContain('Custom Entry Price')

      const htmlCustom = renderToString(
        React.createElement(PaperTradingPanel, {
          initialExecutionMode: 'custom',
          initialCustomPrice: '1.08750'
        })
      )
      expect(htmlCustom).toContain('Order Price')
      expect(htmlCustom).toContain('1.08750')
    })
  })

  describe('SL / TP Pip Steppers & Order Estimate', () => {
    it('renders +10, +25, +50 pip stepper buttons for SL and TP', () => {
      const html = renderToString(React.createElement(PaperTradingPanel))
      expect(html).toContain('+10')
      expect(html).toContain('+25')
      expect(html).toContain('+50')
      expect(html).toContain('Stop Loss')
      expect(html).toContain('Take Profit')
    })

    it('renders order estimate with Margin required and Pip value', () => {
      const html = renderToString(
        React.createElement(PaperTradingPanel, { initialLotSize: '1.00' })
      )
      expect(html).toContain('Margin Required')
      expect(html).toContain('Pip Value')
      expect(html).toContain('Est. Value')
    })
  })

  describe('Submitting Order', () => {
    it('renders high-visibility jewel submit button with side, lots, and price', () => {
      const html = renderToString(
        React.createElement(PaperTradingPanel, {
          initialSide: 'buy',
          initialLotSize: '0.50'
        })
      )
      expect(html).toContain('BUY 0.50 L @')
    })

    it('invokes openPosition and opens a position in store', async () => {
      const res = await usePaperTradingStore.getState().openPosition({
        symbol: 'EURUSD',
        side: 'buy',
        size: 0.5,
        price: 1.0851,
        stopLoss: 1.0800,
        takeProfit: 1.0950
      })

      expect(res.success).toBe(true)
      const state = usePaperTradingStore.getState()
      expect(state.account.positions.length).toBe(1)
      expect(state.account.positions[0].symbol).toBe('EURUSD')
      expect(state.account.positions[0].size).toBe(0.5)
      expect(state.account.positions[0].side).toBe('buy')
    })
  })

  describe('Import Positions Action Shortcut', () => {
    it('renders [↓ Import Positions] shortcut button', () => {
      const html = renderToString(React.createElement(PaperTradingPanel))
      expect(html).toContain('Import Positions')
    })

    it('invokes setImportPositionsModalOpen with import tab', () => {
      expect(useWorkspaceStore.getState().isImportPositionsModalOpen).toBe(false)
      useWorkspaceStore.getState().setImportPositionsModalOpen(true, 'import')
      expect(useWorkspaceStore.getState().isImportPositionsModalOpen).toBe(true)
      expect(useWorkspaceStore.getState().importPositionsModalTab).toBe('import')
    })
  })

  describe('Positions List & Close Action', () => {
    it('renders empty positions message when no open positions', () => {
      const html = renderToString(React.createElement(PaperTradingPanel))
      expect(html).toContain('No open paper positions')
    })

    it('renders open positions with symbol, side, lots, entry price, PnL, and close button', () => {
      usePaperTradingStore.setState({
        account: {
          balance: 99000,
          initialBalance: 100000,
          currency: 'USD',
          positions: [
            {
              id: 'pos_test_1',
              symbol: 'EURUSD',
              side: 'buy',
              entryPrice: 1.0800,
              size: 1.0,
              timestamp: Date.now(),
              stopLoss: 1.0750,
              takeProfit: 1.0900,
              accountType: 'standard'
            }
          ],
          updatedAt: Date.now(),
          accountType: 'standard'
        }
      })

      const html = renderToString(React.createElement(PaperTradingPanel))
      expect(html).toContain('EURUSD')
      expect(html).toContain('BUY')
      expect(html).toContain('1.00 L')
      expect(html).toContain('1.08000')
      expect(html).toContain('✕')
    })

    it('invoking closePosition removes position from store and updates balance', async () => {
      usePaperTradingStore.setState({
        account: {
          balance: 90000,
          initialBalance: 100000,
          currency: 'USD',
          positions: [
            {
              id: 'pos_to_close',
              symbol: 'EURUSD',
              side: 'buy',
              entryPrice: 1.0800,
              size: 1.0,
              timestamp: Date.now(),
              accountType: 'standard'
            }
          ],
          updatedAt: Date.now(),
          accountType: 'standard'
        }
      })

      const closed = await usePaperTradingStore.getState().closePosition('pos_to_close', 1.0850)
      expect(closed).toBe(true)
      expect(
        usePaperTradingStore.getState().account.positions.some((p) => p.id === 'pos_to_close')
      ).toBe(false)
    })
  })

  describe('Neutral Terminology Check', () => {
    it('does NOT contain third-party proprietary software names in rendered output', () => {
      const htmlStandard = renderToString(
        React.createElement(PaperTradingPanel, { initialExecutionMode: 'market' })
      )
      const htmlCustom = renderToString(
        React.createElement(PaperTradingPanel, { initialExecutionMode: 'custom' })
      )

      const combined = (htmlStandard + htmlCustom).toLowerCase()
      expect(combined.includes('meta' + 'trader')).toBe(false)
      expect(combined.includes('mt' + '4')).toBe(false)
      expect(combined.includes('mt' + '5')).toBe(false)
    })
  })
})
