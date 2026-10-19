import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { BottomDockPanel } from './BottomDockPanel'
import { usePaperTradingStore } from '../../stores/usePaperTradingStore'
import { useMarketStore } from '../../stores/useMarketStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'

describe('BottomDockPanel - Institutional Trading Account Manager', () => {
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
    // Reset stores
    useMarketStore.setState({
      symbol: 'EURUSD',
      prices: {
        EURUSD: {
          symbol: 'EURUSD',
          price: 1.085,
          change: 0.001,
          changePercent: 0.09,
          high: 1.088,
          low: 1.082,
          volume: 120000,
          updatedAt: Date.now()
        },
        BTCUSDT: {
          symbol: 'BTCUSDT',
          price: 90000,
          change: 1500,
          changePercent: 1.69,
          high: 91000,
          low: 88500,
          volume: 5000000,
          updatedAt: Date.now()
        }
      }
    })

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

    useWorkspaceStore.setState({
      isImportPositionsModalOpen: false
    })
  })

  describe('Trading Tab Account Metrics & Header', () => {
    it('renders account balance, equity, margin metrics, and standard/cent mode toggles', () => {
      usePaperTradingStore.setState({
        account: {
          balance: 100000,
          initialBalance: 100000,
          currency: 'USD',
          positions: [
            {
              id: 'pos_1',
              symbol: 'EURUSD',
              side: 'buy',
              entryPrice: 1.08,
              size: 1.0,
              timestamp: Date.now(),
              accountType: 'standard',
              ticket: 'T-1001'
            }
          ],
          updatedAt: Date.now(),
          accountType: 'standard'
        },
        accountType: 'standard'
      })

      const html = renderToString(React.createElement(BottomDockPanel, { initialOpen: true, initialTab: 'trading' }))

      // Mode toggles
      expect(html).toContain('Standard Account')
      expect(html).toContain('Cent Account')

      // Account badges
      expect(html).toContain('Balance')
      expect(html).toContain('$100,000.00')
      expect(html).toContain('Equity')
      expect(html).toContain('Margin Used')
      expect(html).toContain('Free Margin')
      expect(html).toContain('Margin Level')

      // Action buttons
      expect(html).toContain('Quick Position')
      expect(html).toContain('Import Positions')
      expect(html).toContain('Close All')
    })

    it('renders cent account metrics with cent symbol ¢ formatting when in cent mode', () => {
      usePaperTradingStore.setState({
        account: {
          balance: 10000000,
          initialBalance: 10000000,
          currency: 'USC',
          positions: [],
          updatedAt: Date.now(),
          accountType: 'cent'
        },
        accountType: 'cent'
      })

      const html = renderToString(React.createElement(BottomDockPanel, { initialOpen: true, initialTab: 'trading' }))

      expect(html).toContain('Cent Account')
      expect(html).toContain('10,000,000.00 ¢')
    })
  })

  describe('Positions & Orders Table', () => {
    it('renders empty state card when there are no open positions', () => {
      usePaperTradingStore.setState({
        account: {
          balance: 100000,
          initialBalance: 100000,
          currency: 'USD',
          positions: [],
          updatedAt: Date.now(),
          accountType: 'standard'
        }
      })

      const html = renderToString(React.createElement(BottomDockPanel, { initialOpen: true, initialTab: 'trading' }))

      expect(html).toContain('No open positions')
      expect(html).toContain('Click + Quick Position or ↓ Import Positions to get started')
    })

    it('renders active positions with Ticket, Symbol, Side, Lots, Entry Price, Mark Price, and Close button', () => {
      usePaperTradingStore.setState({
        account: {
          balance: 95000,
          initialBalance: 100000,
          currency: 'USD',
          positions: [
            {
              id: 'pos_btc_1',
              symbol: 'BTCUSDT',
              side: 'buy',
              entryPrice: 88000,
              size: 0.5,
              timestamp: Date.now(),
              stopLoss: 85000,
              takeProfit: 95000,
              ticket: 'T-99001',
              accountType: 'standard'
            },
            {
              id: 'pos_eur_2',
              symbol: 'EURUSD',
              side: 'sell',
              entryPrice: 1.085,
              size: 2.0,
              timestamp: Date.now(),
              ticket: 'T-99002',
              accountType: 'standard'
            }
          ],
          updatedAt: Date.now(),
          accountType: 'standard'
        }
      })

      const html = renderToString(React.createElement(BottomDockPanel, { initialOpen: true, initialTab: 'trading' }))

      // Column headers
      expect(html).toContain('Ticket')
      expect(html).toContain('Symbol')
      expect(html).toContain('Side')
      expect(html).toContain('Lots')
      expect(html).toContain('Mode')
      expect(html).toContain('Entry Price')
      expect(html).toContain('Mark Price')
      expect(html).toContain('Stop Loss')
      expect(html).toContain('Take Profit')
      expect(html).toContain('PnL')
      expect(html).toContain('Action')

      // Position 1 data
      expect(html).toContain('T-99001')
      expect(html).toContain('BTCUSDT')
      expect(html).toContain('0.50 L')
      expect(html).toContain('BUY')

      // Position 2 data
      expect(html).toContain('T-99002')
      expect(html).toContain('EURUSD')
      expect(html).toContain('2.00 L')
      expect(html).toContain('SELL')
    })

    it('renders sub-tabs for Positions and Pending Orders with counts', () => {
      usePaperTradingStore.setState({
        account: {
          balance: 100000,
          initialBalance: 100000,
          currency: 'USD',
          positions: [
            {
              id: 'pos_1',
              symbol: 'EURUSD',
              side: 'buy',
              entryPrice: 1.08,
              size: 1.0,
              timestamp: Date.now()
            }
          ],
          orders: [
            {
              id: 'ord_1',
              symbol: 'BTCUSDT',
              type: 'buy_limit',
              side: 'buy',
              price: 85000,
              size: 0.25,
              timestamp: Date.now(),
              ticket: 'ORD-7701',
              status: 'pending'
            }
          ],
          updatedAt: Date.now()
        }
      })

      const html = renderToString(React.createElement(BottomDockPanel, { initialOpen: true, initialTab: 'trading' }))
      expect(html).toContain('Positions (1)')
      expect(html).toContain('Orders (1)')
    })

    it('renders pending orders table when initialTradingSubTab is orders', () => {
      usePaperTradingStore.setState({
        account: {
          balance: 100000,
          initialBalance: 100000,
          currency: 'USD',
          positions: [],
          orders: [
            {
              id: 'ord_1',
              symbol: 'BTCUSDT',
              type: 'buy_limit',
              side: 'buy',
              price: 85000,
              size: 0.25,
              timestamp: Date.now(),
              ticket: 'ORD-7701',
              status: 'pending'
            }
          ],
          updatedAt: Date.now()
        }
      })

      const html = renderToString(React.createElement(BottomDockPanel, { initialOpen: true, initialTab: 'trading', initialTradingSubTab: 'orders' }))
      expect(html).toContain('ORD-7701')
      expect(html).toContain('BTCUSDT')
      expect(html).toContain('BUY LIMIT')
      expect(html).toContain('0.25 L')
      expect(html).toContain('85000')
      expect(html).toContain('Cancel')
    })
  })

  describe('Interactive Store Actions', () => {
    it('toggling account mode calls setAccountType and updates store state', () => {
      usePaperTradingStore.getState().setAccountType('cent')
      expect(usePaperTradingStore.getState().accountType).toBe('cent')

      usePaperTradingStore.getState().setAccountType('standard')
      expect(usePaperTradingStore.getState().accountType).toBe('standard')
    })

    it('clicking close button invokes closePosition and removes position from account', async () => {
      usePaperTradingStore.setState({
        account: {
          balance: 100000,
          initialBalance: 100000,
          currency: 'USD',
          positions: [
            {
              id: 'pos_btc_close_test',
              symbol: 'BTCUSDT',
              side: 'buy',
              entryPrice: 88000,
              size: 0.5,
              timestamp: Date.now(),
              accountType: 'standard'
            }
          ],
          updatedAt: Date.now(),
          accountType: 'standard'
        }
      })

      await usePaperTradingStore.getState().closePosition('pos_btc_close_test', 90000)
      expect(
        usePaperTradingStore.getState().account.positions.some((p) => p.id === 'pos_btc_close_test')
      ).toBe(false)
    })

    it('opens Quick Position and Batch Import modals through setImportPositionsModalOpen', () => {
      useWorkspaceStore.getState().setImportPositionsModalOpen(true, 'quick')
      expect(useWorkspaceStore.getState().isImportPositionsModalOpen).toBe(true)
      expect(useWorkspaceStore.getState().importPositionsModalTab).toBe('quick')

      useWorkspaceStore.getState().setImportPositionsModalOpen(true, 'import')
      expect(useWorkspaceStore.getState().isImportPositionsModalOpen).toBe(true)
      expect(useWorkspaceStore.getState().importPositionsModalTab).toBe('import')

      useWorkspaceStore.getState().setImportPositionsModalOpen(false)
      expect(useWorkspaceStore.getState().isImportPositionsModalOpen).toBe(false)
    })
  })

  describe('Neutral Terminology Check', () => {
    it('does NOT contain third-party proprietary software names in rendered output', () => {
      usePaperTradingStore.setState({
        account: {
          balance: 100000,
          initialBalance: 100000,
          currency: 'USD',
          positions: [
            {
              id: 'pos_1',
              symbol: 'EURUSD',
              side: 'buy',
              entryPrice: 1.08,
              size: 1.0,
              timestamp: Date.now(),
              ticket: '1001'
            }
          ],
          updatedAt: Date.now()
        }
      })

      const html = renderToString(React.createElement(BottomDockPanel, { initialOpen: true, initialTab: 'trading' }))
      const lower = html.toLowerCase()

      expect(lower.includes('meta' + 'trader')).toBe(false)
      expect(lower.includes('mt' + '4')).toBe(false)
      expect(lower.includes('mt' + '5')).toBe(false)
    })
  })
})
