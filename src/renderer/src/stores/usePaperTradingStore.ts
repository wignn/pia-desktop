/**
 * PIA Terminal - Paper Trading Store (Zustand)
 * Institutional paper trading simulation engine with position management,
 * margin checks, unrealized/realized PnL, automatic SL/TP execution, and SQLite persistence.
 */

import { create } from 'zustand'
import type { PaperAccount, PaperPosition, PriceQuote } from '@shared/types'

interface PaperTradingState {
  account: PaperAccount
  isLoading: boolean
  lastExecutedAction: string | null

  loadAccount: () => Promise<void>
  openPosition: (params: {
    symbol: string
    side: 'buy' | 'sell'
    size: number
    price: number
    stopLoss?: number
    takeProfit?: number
  }) => Promise<{ success: boolean; error?: string }>
  closePosition: (positionId: string, currentPrice: number) => Promise<boolean>
  resetAccount: (initialBalance?: number) => Promise<boolean>
  checkPositionsSLTP: (quote: PriceQuote) => void
  clearActionNotification: () => void
}

const DEFAULT_ACCOUNT: PaperAccount = {
  balance: 100000,
  initialBalance: 100000,
  currency: 'USD',
  positions: [],
  updatedAt: Date.now()
}

export const usePaperTradingStore = create<PaperTradingState>((set, get) => ({
  account: DEFAULT_ACCOUNT,
  isLoading: false,
  lastExecutedAction: null,

  loadAccount: async () => {
    set({ isLoading: true })
    try {
      const account = await window.api.paper.getAccount()
      set({ account: account || DEFAULT_ACCOUNT, isLoading: false })
    } catch (err) {
      console.error('[PaperTradingStore] Failed to load account:', err)
      set({ isLoading: false })
    }
  },

  openPosition: async (params) => {
    const { account } = get()
    const notional = params.size * params.price

    // Ensure order size and price are valid positive numbers
    if (params.size <= 0 || params.price <= 0) {
      return { success: false, error: 'Order size and price must be positive numbers' }
    }

    // Require sufficient balance to back the trade margin
    if (notional > account.balance) {
      return {
        success: false,
        error: `Insufficient balance. Required: $${notional.toLocaleString('en-US', { minimumFractionDigits: 2 })}, Available: $${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      }
    }

    const newPosition: PaperPosition = {
      id: 'pos_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      symbol: params.symbol.toUpperCase(),
      side: params.side,
      entryPrice: params.price,
      size: params.size,
      timestamp: Date.now(),
      stopLoss: params.stopLoss && params.stopLoss > 0 ? params.stopLoss : undefined,
      takeProfit: params.takeProfit && params.takeProfit > 0 ? params.takeProfit : undefined
    }

    const updatedAccount: PaperAccount = {
      ...account,
      balance: account.balance - notional,
      positions: [newPosition, ...account.positions],
      updatedAt: Date.now()
    }

    try {
      const success = await window.api.paper.saveAccount(updatedAccount)
      if (success) {
        set({
          account: updatedAccount,
          lastExecutedAction: `Opened ${params.side.toUpperCase()} ${params.size} ${params.symbol} @ $${params.price.toFixed(2)}`
        })
        return { success: true }
      }
      return { success: false, error: 'Failed to persist trade to database' }
    } catch (err) {
      console.error('[PaperTradingStore] Error opening position:', err)
      return { success: false, error: 'Internal execution error' }
    }
  },

  closePosition: async (positionId: string, currentPrice: number) => {
    const { account } = get()
    const targetPos = account.positions.find((p) => p.id === positionId)
    if (!targetPos) return false

    // Realized PnL calculation
    const priceDiff =
      targetPos.side === 'buy'
        ? currentPrice - targetPos.entryPrice
        : targetPos.entryPrice - currentPrice
    const realizedPnl = priceDiff * targetPos.size
    const originalNotional = targetPos.size * targetPos.entryPrice

    // Return original notional + realized PnL to balance
    const returnedFunds = originalNotional + realizedPnl
    const updatedBalance = Math.max(0, account.balance + returnedFunds)

    const updatedAccount: PaperAccount = {
      ...account,
      balance: updatedBalance,
      positions: account.positions.filter((p) => p.id !== positionId),
      updatedAt: Date.now()
    }

    try {
      const success = await window.api.paper.saveAccount(updatedAccount)
      if (success) {
        set({
          account: updatedAccount,
          lastExecutedAction: `Closed ${targetPos.side.toUpperCase()} ${targetPos.symbol} (PnL: ${realizedPnl >= 0 ? '+' : ''}$${realizedPnl.toFixed(2)})`
        })
        return true
      }
      return false
    } catch (err) {
      console.error('[PaperTradingStore] Error closing position:', err)
      return false
    }
  },

  resetAccount: async (initialBalance = 100000) => {
    const freshAccount: PaperAccount = {
      balance: initialBalance,
      initialBalance,
      currency: 'USD',
      positions: [],
      updatedAt: Date.now()
    }

    try {
      const success = await window.api.paper.saveAccount(freshAccount)
      if (success) {
        set({
          account: freshAccount,
          lastExecutedAction: 'Paper trading account reset to initial balance'
        })
        return true
      }
      return false
    } catch (err) {
      console.error('[PaperTradingStore] Error resetting account:', err)
      return false
    }
  },

  checkPositionsSLTP: (quote: PriceQuote) => {
    const { account, closePosition } = get()
    const matchingPositions = account.positions.filter((p) => p.symbol === quote.symbol)
    if (matchingPositions.length === 0) return

    for (const pos of matchingPositions) {
      const price = quote.price
      let triggeredSLTP = false

      if (pos.side === 'buy') {
        if (pos.stopLoss && price <= pos.stopLoss) {
          triggeredSLTP = true
        } else if (pos.takeProfit && price >= pos.takeProfit) {
          triggeredSLTP = true
        }
      } else if (pos.side === 'sell') {
        if (pos.stopLoss && price >= pos.stopLoss) {
          triggeredSLTP = true
        } else if (pos.takeProfit && price <= pos.takeProfit) {
          triggeredSLTP = true
        }
      }

      if (triggeredSLTP) {
        closePosition(pos.id, price)
      }
    }
  },

  clearActionNotification: () => set({ lastExecutedAction: null })
}))
