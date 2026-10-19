import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { ImportPositionsModal } from './ImportPositionsModal'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useMarketStore } from '../../stores/useMarketStore'
import { usePaperTradingStore } from '../../stores/usePaperTradingStore'

describe('ImportPositionsModal', () => {
  beforeEach(() => {
    // Reset workspace store
    useWorkspaceStore.setState({
      isImportPositionsModalOpen: false
    })

    // Reset market store symbol
    useMarketStore.setState({
      symbol: 'EURUSD',
      prices: {
        EURUSD: {
          symbol: 'EURUSD',
          price: 1.08542,
          change: 0.0012,
          changePercent: 0.11,
          high: 1.089,
          low: 1.082,
          volume: 154000,
          updatedAt: Date.now()
        }
      }
    })

    // Reset paper trading store
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
            entryPrice: 1.085,
            size: 1.0,
            timestamp: 1700000000000,
            accountType: 'standard',
            ticket: '1001'
          }
        ],
        updatedAt: Date.now(),
        accountType: 'standard'
      },
      accountType: 'standard',
      isLoading: false,
      lastExecutedAction: null
    })
  })

  describe('Workspace Store Modal State', () => {
    it('initializes isImportPositionsModalOpen as false and toggles correctly', () => {
      expect(useWorkspaceStore.getState().isImportPositionsModalOpen).toBe(false)
      useWorkspaceStore.getState().setImportPositionsModalOpen(true)
      expect(useWorkspaceStore.getState().isImportPositionsModalOpen).toBe(true)
      useWorkspaceStore.getState().setImportPositionsModalOpen(false)
      expect(useWorkspaceStore.getState().isImportPositionsModalOpen).toBe(false)
    })
  })

  describe('Modal Visibility', () => {
    it('returns null/empty string when isImportPositionsModalOpen is false', () => {
      useWorkspaceStore.setState({ isImportPositionsModalOpen: false })
      const html = renderToString(React.createElement(ImportPositionsModal))
      expect(html).toBe('')
    })

    it('renders modal dialog when isImportPositionsModalOpen is true', () => {
      useWorkspaceStore.setState({ isImportPositionsModalOpen: true })
      const html = renderToString(React.createElement(ImportPositionsModal))
      expect(html).toContain('Position Manager &amp; Import')
      expect(html).toContain('Quick Entry')
      expect(html).toContain('Batch Import')
      expect(html).toContain('Export')
    })
  })

  describe('Quick Entry Tab', () => {
    it('renders Quick Entry form with prefilled symbol, side buttons, and lot pills', () => {
      useWorkspaceStore.setState({ isImportPositionsModalOpen: true })
      const html = renderToString(React.createElement(ImportPositionsModal, { initialTab: 'quick' }))

      // Symbol
      expect(html).toContain('EURUSD')
      // Sides
      expect(html).toContain('BUY / LONG')
      expect(html).toContain('SELL / SHORT')
      // Account modes
      expect(html).toContain('Standard')
      expect(html).toContain('Cent')
      // Lot pills
      expect(html).toContain('0.01')
      expect(html).toContain('0.05')
      expect(html).toContain('0.10')
      expect(html).toContain('0.50')
      expect(html).toContain('1.00')
      // Entry Price controls
      expect(html).toContain('Market Price')
      // Pip helpers
      expect(html).toContain('+10')
      expect(html).toContain('+25')
      expect(html).toContain('+50')
      // Submit action
      expect(html).toContain('Add Position')
    })
  })

  describe('Batch Import Tab', () => {
    it('renders Batch Import interface with textarea and preview table headers', () => {
      useWorkspaceStore.setState({ isImportPositionsModalOpen: true })
      const html = renderToString(React.createElement(ImportPositionsModal, { initialTab: 'import' }))

      expect(html).toContain('textarea')
      expect(html).toContain('Paste trade position report')
      // Table column headers
      expect(html).toContain('Symbol')
      expect(html).toContain('Side')
      expect(html).toContain('Lots')
      expect(html).toContain('Entry Price')
      expect(html).toContain('SL')
      expect(html).toContain('TP')
      expect(html).toContain('Ticket')
    })

    it('renders parsed preview rows when initialText is provided', () => {
      useWorkspaceStore.setState({ isImportPositionsModalOpen: true })
      const sampleText = 'EURUSD BUY 0.50 1.12250 SL 1.12000 TP 1.12600 #1048291'
      const html = renderToString(
        React.createElement(ImportPositionsModal, { initialTab: 'import', initialText: sampleText })
      )

      expect(html).toContain('EURUSD')
      expect(html).toContain('0.5')
      expect(html).toContain('1.1225')
      expect(html).toContain('1.12')
      expect(html).toContain('1.126')
      expect(html).toContain('1048291')
      expect(html).toContain('Import 1 Position')
    })

    it('displays error badge when unparsable lines exist', () => {
      useWorkspaceStore.setState({ isImportPositionsModalOpen: true })
      const textWithGarbage = 'This is invalid line\nEURUSD BUY 1.00 1.08500'
      const html = renderToString(
        React.createElement(ImportPositionsModal, { initialTab: 'import', initialText: textWithGarbage })
      )

      expect(html).toContain('Line 1')
      expect(html).toContain('Import 1 Position')
    })
  })

  describe('Export Tab', () => {
    it('renders Export tab showing positions count and CSV actions', () => {
      useWorkspaceStore.setState({ isImportPositionsModalOpen: true })
      const html = renderToString(React.createElement(ImportPositionsModal, { initialTab: 'export' }))

      expect(html).toContain('1 Open Position')
      expect(html).toContain('Copy CSV to Clipboard')
      expect(html).toContain('Download CSV')
    })
  })

  describe('Neutral Terminology Check', () => {
    it('does NOT contain third-party proprietary software names in rendered output', () => {
      useWorkspaceStore.setState({ isImportPositionsModalOpen: true })
      const htmlQuick = renderToString(React.createElement(ImportPositionsModal, { initialTab: 'quick' }))
      const htmlImport = renderToString(React.createElement(ImportPositionsModal, { initialTab: 'import' }))
      const htmlExport = renderToString(React.createElement(ImportPositionsModal, { initialTab: 'export' }))

      const combined = (htmlQuick + htmlImport + htmlExport).toLowerCase()
      expect(combined.includes('meta' + 'trader')).toBe(false)
      expect(combined.includes('mt' + '4')).toBe(false)
      expect(combined.includes('mt' + '5')).toBe(false)
    })
  })
})
