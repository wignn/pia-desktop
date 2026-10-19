/**
 * PIA Terminal - Paper Trading Store (Zustand)
 * Institutional paper trading simulation engine with position management,
 * margin checks, unrealized/realized PnL, automatic SL/TP execution, and SQLite persistence.
 */

import { create } from 'zustand'
import type { PaperAccount, PaperPosition, PriceQuote } from '@shared/types'

interface PaperTradingState {
  account: PaperAccount
  accountType: 'standard' | 'cent'
  isLoading: boolean
  lastExecutedAction: string | null

  loadAccount: () => Promise<void>
  setAccountType: (type: 'standard' | 'cent') => void
  openPosition: (params: {
    symbol: string
    side: 'buy' | 'sell'
    size: number
    price: number
    stopLoss?: number
    takeProfit?: number
    ticket?: string
    comment?: string
    accountType?: 'standard' | 'cent'
    source?: 'manual' | 'import'
  }) => Promise<{ success: boolean; error?: string }>
  importPositions: (positions: Array<{
    symbol: string
    side: 'buy' | 'sell'
    size: number
    price: number
    stopLoss?: number
    takeProfit?: number
    accountType?: 'standard' | 'cent'
    ticket?: string
    comment?: string
  }>) => Promise<{ success: boolean; count: number; error?: string }>
  updatePosition: (
    id: string,
    updates: { stopLoss?: number; takeProfit?: number; entryPrice?: number; size?: number }
  ) => Promise<boolean>
  closePosition: (positionId: string, currentPrice: number) => Promise<boolean>
  closeAllPositions: (symbol?: string, currentPrice?: number) => Promise<boolean>
  resetAccount: (initialBalance?: number) => Promise<boolean>
  checkPositionsSLTP: (quote: PriceQuote) => void
  clearActionNotification: () => void
}

const DEFAULT_ACCOUNT: PaperAccount = {
  balance: 100000,
  initialBalance: 100000,
  currency: 'USD',
  positions: [],
  updatedAt: Date.now(),
  accountType: 'standard'
}

export const usePaperTradingStore = create<PaperTradingState>((set, get) => ({
  account: DEFAULT_ACCOUNT,
  accountType: 'standard',
  isLoading: false,
  lastExecutedAction: null,

  loadAccount: async () => {
    set({ isLoading: true })
    try {
      const account = await window.api.paper.getAccount()
      const resolved = account || DEFAULT_ACCOUNT
      set({
        account: resolved,
        accountType: resolved.accountType || 'standard',
        isLoading: false
      })
    } catch (err) {
      console.error('[PaperTradingStore] Failed to load account:', err)
      set({ isLoading: false })
    }
  },

  setAccountType: (type: 'standard' | 'cent') => {
    const { account } = get()
    const updatedAccount: PaperAccount = {
      ...account,
      accountType: type,
      currency: type === 'cent' ? 'USC' : 'USD'
    }
    set({ accountType: type, account: updatedAccount })
    try {
      window.api?.paper?.saveAccount?.(updatedAccount)
    } catch {
      // ignore persistence error on non-blocking type toggle
    }
  },

  openPosition: async (params) => {
    const { account, accountType: storeAccountType } = get()

    // Ensure order size and price are valid positive numbers
    if (params.size <= 0 || params.price <= 0) {
      return { success: false, error: 'Order size and price must be positive numbers' }
    }

    const posAccountType = params.accountType ?? account.accountType ?? storeAccountType ?? 'standard'
    const isCent = posAccountType === 'cent'
    // ponytail: notional simplifies forex 100k lot contract sizing to direct units (size * price); upgrade to contract size table when asset-class specific margin rules are needed
    const notional = params.size * params.price

    // Require sufficient balance to back the trade margin
    if (notional > account.balance) {
      const prefix = isCent ? '¢' : '$'
      return {
        success: false,
        error: `Insufficient balance. Required: ${prefix}${notional.toLocaleString('en-US', { minimumFractionDigits: 2 })}, Available: ${prefix}${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
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
      takeProfit: params.takeProfit && params.takeProfit > 0 ? params.takeProfit : undefined,
      ticket: params.ticket,
      comment: params.comment,
      accountType: posAccountType,
      lotType: posAccountType,
      source: params.source ?? 'manual'
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
          lastExecutedAction: `Opened ${params.side.toUpperCase()} ${params.size} ${params.symbol} @ ${isCent ? '¢' : '$'}${params.price.toFixed(2)}`
        })
        return { success: true }
      }
      return { success: false, error: 'Failed to persist trade to database' }
    } catch (err) {
      console.error('[PaperTradingStore] Error opening position:', err)
      return { success: false, error: 'Internal execution error' }
    }
  },

  importPositions: async (positions) => {
    if (!positions || positions.length === 0) {
      return { success: true, count: 0 }
    }

    const { account, accountType: storeAccountType } = get()
    const now = Date.now()
    const validPositions: PaperPosition[] = []

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]
      if (!p.symbol || (p.side !== 'buy' && p.side !== 'sell') || p.size <= 0 || p.price <= 0) {
        continue
      }
      const posAccType = p.accountType ?? account.accountType ?? storeAccountType ?? 'standard'
      validPositions.push({
        id: (p as { id?: string }).id || `pos_import_${now}_${i}_${Math.random().toString(36).substring(2, 7)}`,
        symbol: p.symbol.toUpperCase(),
        side: p.side,
        entryPrice: p.price,
        size: p.size,
        timestamp: now,
        stopLoss: p.stopLoss && p.stopLoss > 0 ? p.stopLoss : undefined,
        takeProfit: p.takeProfit && p.takeProfit > 0 ? p.takeProfit : undefined,
        ticket: p.ticket,
        comment: p.comment,
        accountType: posAccType,
        lotType: posAccType,
        source: 'import'
      })
    }

    if (validPositions.length === 0) {
      return { success: false, count: 0, error: 'No valid positions to import' }
    }

    // ponytail: prepending imported positions directly to account without re-checking cash balance; upgrade to optional margin pre-check if overdraft protection is requested
    const updatedAccount: PaperAccount = {
      ...account,
      positions: [...validPositions, ...account.positions],
      updatedAt: Date.now()
    }

    try {
      const success = await window.api.paper.saveAccount(updatedAccount)
      if (success) {
        set({
          account: updatedAccount,
          lastExecutedAction: `Imported ${validPositions.length} position${validPositions.length > 1 ? 's' : ''}`
        })
        return { success: true, count: validPositions.length }
      }
      return { success: false, count: 0, error: 'Failed to persist trade to database' }
    } catch (err) {
      console.error('[PaperTradingStore] Error importing positions:', err)
      return { success: false, count: 0, error: 'Internal execution error' }
    }
  },

  updatePosition: async (id, updates) => {
    const { account } = get()
    const target = account.positions.find((p) => p.id === id)
    if (!target) return false

    const updatedPositions = account.positions.map((p) => {
      if (p.id !== id) return p
      return {
        ...p,
        ...(updates.stopLoss !== undefined ? { stopLoss: updates.stopLoss > 0 ? updates.stopLoss : undefined } : {}),
        ...(updates.takeProfit !== undefined ? { takeProfit: updates.takeProfit > 0 ? updates.takeProfit : undefined } : {}),
        ...(updates.entryPrice !== undefined && updates.entryPrice > 0 ? { entryPrice: updates.entryPrice } : {}),
        ...(updates.size !== undefined && updates.size > 0 ? { size: updates.size } : {})
      }
    })

    const updatedAccount: PaperAccount = {
      ...account,
      positions: updatedPositions,
      updatedAt: Date.now()
    }

    try {
      const success = await window.api.paper.saveAccount(updatedAccount)
      if (success) {
        set({
          account: updatedAccount,
          lastExecutedAction: `Updated position ${target.symbol}`
        })
        return true
      }
      return false
    } catch (err) {
      console.error('[PaperTradingStore] Error updating position:', err)
      return false
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

    const isCent = targetPos.accountType === 'cent' || account.accountType === 'cent'
    const prefix = isCent ? '¢' : '$'

    try {
      const success = await window.api.paper.saveAccount(updatedAccount)
      if (success) {
        set({
          account: updatedAccount,
          lastExecutedAction: `Closed ${targetPos.side.toUpperCase()} ${targetPos.symbol} (PnL: ${realizedPnl >= 0 ? '+' : ''}${prefix}${realizedPnl.toFixed(2)})`
        })
        return true
      }
      return false
    } catch (err) {
      console.error('[PaperTradingStore] Error closing position:', err)
      return false
    }
  },

  closeAllPositions: async (symbol?: string, currentPrice?: number) => {
    const { account } = get()
    const targetSymbol = symbol?.toUpperCase()
    const positionsToClose = targetSymbol
      ? account.positions.filter((p) => p.symbol === targetSymbol)
      : account.positions

    if (positionsToClose.length === 0) return true

    let totalReturnedFunds = 0
    for (const pos of positionsToClose) {
      const closePrice = currentPrice !== undefined && currentPrice > 0 ? currentPrice : pos.entryPrice
      const priceDiff =
        pos.side === 'buy'
          ? closePrice - pos.entryPrice
          : pos.entryPrice - closePrice
      const realizedPnl = priceDiff * pos.size
      const originalNotional = pos.size * pos.entryPrice
      totalReturnedFunds += originalNotional + realizedPnl
    }

    const updatedBalance = Math.max(0, account.balance + totalReturnedFunds)
    const remainingPositions = targetSymbol
      ? account.positions.filter((p) => p.symbol !== targetSymbol)
      : []

    const updatedAccount: PaperAccount = {
      ...account,
      balance: updatedBalance,
      positions: remainingPositions,
      updatedAt: Date.now()
    }

    try {
      const success = await window.api.paper.saveAccount(updatedAccount)
      if (success) {
        set({
          account: updatedAccount,
          lastExecutedAction: `Closed ${positionsToClose.length} position${positionsToClose.length > 1 ? 's' : ''}`
        })
        return true
      }
      return false
    } catch (err) {
      console.error('[PaperTradingStore] Error closing all positions:', err)
      return false
    }
  },

  resetAccount: async (initialBalance = 100000) => {
    const { accountType } = get()
    const freshAccount: PaperAccount = {
      balance: initialBalance,
      initialBalance,
      currency: accountType === 'cent' ? 'USC' : 'USD',
      positions: [],
      updatedAt: Date.now(),
      accountType
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
