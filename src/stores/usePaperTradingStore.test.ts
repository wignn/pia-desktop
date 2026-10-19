import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePaperTradingStore } from './usePaperTradingStore'
import type { PaperAccount } from '@shared/types'

let savedAccounts: PaperAccount[] = []

if (!vi.stubGlobal) {
  vi.stubGlobal = (name: string, val: unknown) => {
    ;(globalThis as Record<string, unknown>)[name] = val
  }
}

describe('usePaperTradingStore', () => {
  beforeEach(() => {
    savedAccounts = []

    vi.stubGlobal('window', {
      api: {
        paper: {
          getAccount: vi.fn(async () => ({
            balance: 100000,
            initialBalance: 100000,
            currency: 'USD',
            positions: [],
            updatedAt: Date.now(),
            accountType: 'standard' as const
          })),
          saveAccount: vi.fn(async (account: PaperAccount) => {
            savedAccounts.push(account)
            return true
          })
        }
      }
    })

    // Reset store to known state
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
  })

  it('toggles account type between standard and cent', () => {
    const store = usePaperTradingStore.getState()
    expect(store.accountType).toBe('standard')

    store.setAccountType('cent')
    expect(usePaperTradingStore.getState().accountType).toBe('cent')
    expect(usePaperTradingStore.getState().account.accountType).toBe('cent')

    store.setAccountType('standard')
    expect(usePaperTradingStore.getState().accountType).toBe('standard')
    expect(usePaperTradingStore.getState().account.accountType).toBe('standard')
  })

  it('opens a position with arbitrary entry price and optional metadata', async () => {
    const store = usePaperTradingStore.getState()
    const result = await store.openPosition({
      symbol: 'EURUSD',
      side: 'buy',
      size: 2,
      price: 1.08542,
      stopLoss: 1.08,
      takeProfit: 1.095,
      ticket: 'MT4-99881',
      comment: 'Breakout long',
      accountType: 'standard',
      source: 'manual'
    })

    expect(result.success).toBe(true)
    const { account } = usePaperTradingStore.getState()
    expect(account.positions).toHaveLength(1)
    const pos = account.positions[0]
    expect(pos.symbol).toBe('EURUSD')
    expect(pos.side).toBe('buy')
    expect(pos.size).toBe(2)
    expect(pos.entryPrice).toBe(1.08542)
    expect(pos.stopLoss).toBe(1.08)
    expect(pos.takeProfit).toBe(1.095)
    expect(pos.ticket).toBe('MT4-99881')
    expect(pos.comment).toBe('Breakout long')
    expect(pos.accountType).toBe('standard')
    expect(pos.source).toBe('manual')
    expect(savedAccounts.length).toBeGreaterThan(0)
  })

  it('checks margin properly in cent mode', async () => {
    usePaperTradingStore.setState({
      account: {
        balance: 50,
        initialBalance: 50,
        currency: 'USC',
        positions: [],
        updatedAt: Date.now(),
        accountType: 'cent'
      },
      accountType: 'cent'
    })

    const res = await usePaperTradingStore.getState().openPosition({
      symbol: 'XAUUSD',
      side: 'buy',
      size: 1,
      price: 100, // notional = 100 > balance 50
      accountType: 'cent'
    })

    expect(res.success).toBe(false)
    expect(res.error).toContain('¢')
  })

  it('imports multiple positions in a batch', async () => {
    const store = usePaperTradingStore.getState()
    const result = await store.importPositions([
      {
        symbol: 'BTCUSDT',
        side: 'buy',
        size: 0.5,
        price: 65432.1,
        stopLoss: 63000,
        takeProfit: 70000,
        accountType: 'standard',
        ticket: 'IMP-001',
        comment: 'Imported swing'
      },
      {
        symbol: 'ETHUSDT',
        side: 'sell',
        size: 2.0,
        price: 3450.5,
        ticket: 'IMP-002'
      }
    ])

    expect(result.success).toBe(true)
    expect(result.count).toBe(2)

    const { account } = usePaperTradingStore.getState()
    expect(account.positions).toHaveLength(2)
    expect(account.positions[0].source).toBe('import')
    expect(account.positions[0].id).toContain('pos_import_')
    expect(account.positions[1].source).toBe('import')
    expect(savedAccounts.length).toBeGreaterThan(0)
  })

  it('updates position SL, TP, entry price, and size', async () => {
    const store = usePaperTradingStore.getState()
    await store.openPosition({
      symbol: 'AAPL',
      side: 'buy',
      size: 10,
      price: 150
    })

    const posId = usePaperTradingStore.getState().account.positions[0].id
    const updated = await store.updatePosition(posId, {
      stopLoss: 140,
      takeProfit: 175,
      entryPrice: 152,
      size: 15
    })

    expect(updated).toBe(true)
    const pos = usePaperTradingStore.getState().account.positions.find((p) => p.id === posId)
    expect(pos?.stopLoss).toBe(140)
    expect(pos?.takeProfit).toBe(175)
    expect(pos?.entryPrice).toBe(152)
    expect(pos?.size).toBe(15)
  })

  it('closes all positions and closes by symbol', async () => {
    const store = usePaperTradingStore.getState()
    await store.openPosition({ symbol: 'EURUSD', side: 'buy', size: 1, price: 1.1 })
    await store.openPosition({ symbol: 'GBPUSD', side: 'buy', size: 1, price: 1.3 })
    await store.openPosition({ symbol: 'EURUSD', side: 'sell', size: 2, price: 1.12 })

    expect(usePaperTradingStore.getState().account.positions).toHaveLength(3)

    // Close only EURUSD
    const closedEur = await store.closeAllPositions('EURUSD')
    expect(closedEur).toBe(true)
    const remainingEur = usePaperTradingStore.getState().account.positions
    expect(remainingEur).toHaveLength(1)
    expect(remainingEur[0].symbol).toBe('GBPUSD')

    // Close all remaining positions
    const closedAll = await store.closeAllPositions()
    expect(closedAll).toBe(true)
    expect(usePaperTradingStore.getState().account.positions).toHaveLength(0)
  })

  it('handles loadAccount and resets account preserving account mode', async () => {
    const store = usePaperTradingStore.getState()
    store.setAccountType('cent')
    await store.resetAccount(50000)

    const state = usePaperTradingStore.getState()
    expect(state.account.balance).toBe(50000)
    expect(state.account.currency).toBe('USC')
    expect(state.account.accountType).toBe('cent')
  })

  it('allows freely setting custom account balance/equity without losing positions', async () => {
    const store = usePaperTradingStore.getState()
    await store.openPosition({ symbol: 'EURUSD', side: 'buy', size: 1, price: 1.1 })
    expect(usePaperTradingStore.getState().account.positions).toHaveLength(1)

    // Set custom equity/balance freely
    const success = await store.setBalance(25430.5)
    expect(success).toBe(true)

    const state = usePaperTradingStore.getState()
    expect(state.account.balance).toBe(25430.5)
    expect(state.account.positions).toHaveLength(1)
    expect(savedAccounts[savedAccounts.length - 1].balance).toBe(25430.5)
  })

  describe('Pending Orders Engine', () => {
    it('places, updates, and cancels pending orders', async () => {
      const store = usePaperTradingStore.getState()
      const res = await store.placeOrder({
        symbol: 'BTCUSDT',
        type: 'buy_limit',
        price: 60000,
        size: 0.5,
        stopLoss: 59000,
        takeProfit: 65000
      })

      expect(res.success).toBe(true)
      expect(usePaperTradingStore.getState().account.orders).toHaveLength(1)
      const order = usePaperTradingStore.getState().account.orders![0]
      expect(order.type).toBe('buy_limit')
      expect(order.side).toBe('buy')
      expect(order.price).toBe(60000)
      expect(order.size).toBe(0.5)

      // Update order price
      const updateRes = await store.updateOrder(order.id, { price: 60500 })
      expect(updateRes).toBe(true)
      expect(usePaperTradingStore.getState().account.orders![0].price).toBe(60500)

      // Cancel order
      const cancelRes = await store.cancelOrder(order.id)
      expect(cancelRes).toBe(true)
      expect(usePaperTradingStore.getState().account.orders).toHaveLength(0)
    })

    it('triggers and fills buy_limit when price falls to or below order price', async () => {
      const store = usePaperTradingStore.getState()
      await store.placeOrder({
        symbol: 'ETHUSDT',
        type: 'buy_limit',
        price: 3000,
        size: 1.0,
        stopLoss: 2900,
        takeProfit: 3300
      })

      expect(usePaperTradingStore.getState().account.orders).toHaveLength(1)
      expect(usePaperTradingStore.getState().account.positions).toHaveLength(0)

      // Quote higher than limit - no fill
      store.checkPositionsSLTP({
        symbol: 'ETHUSDT',
        price: 3050,
        change24h: 0,
        high24h: 3100,
        low24h: 2900,
        timestamp: Date.now()
      })
      expect(usePaperTradingStore.getState().account.orders).toHaveLength(1)
      expect(usePaperTradingStore.getState().account.positions).toHaveLength(0)

      // Quote at or below limit - triggers fill!
      store.checkPositionsSLTP({
        symbol: 'ETHUSDT',
        price: 2995,
        change24h: 0,
        high24h: 3100,
        low24h: 2900,
        timestamp: Date.now()
      })

      const state = usePaperTradingStore.getState()
      expect(state.account.orders).toHaveLength(0)
      expect(state.account.positions).toHaveLength(1)
      const pos = state.account.positions[0]
      expect(pos.symbol).toBe('ETHUSDT')
      expect(pos.side).toBe('buy')
      expect(pos.entryPrice).toBe(3000)
      expect(pos.stopLoss).toBe(2900)
      expect(pos.takeProfit).toBe(3300)
    })

    it('triggers and fills sell_limit when price rises to or above order price', async () => {
      const store = usePaperTradingStore.getState()
      await store.placeOrder({
        symbol: 'ETHUSDT',
        type: 'sell_limit',
        price: 3200,
        size: 1.0
      })

      // Quote at or above limit - triggers fill
      store.checkPositionsSLTP({
        symbol: 'ETHUSDT',
        price: 3205,
        change24h: 0,
        high24h: 3250,
        low24h: 3000,
        timestamp: Date.now()
      })

      const state = usePaperTradingStore.getState()
      expect(state.account.orders).toHaveLength(0)
      expect(state.account.positions).toHaveLength(1)
      expect(state.account.positions[0].side).toBe('sell')
      expect(state.account.positions[0].entryPrice).toBe(3200)
    })

    it('triggers and fills buy_stop and sell_stop correctly', async () => {
      const store = usePaperTradingStore.getState()
      await store.placeOrder({
        symbol: 'SOLUSDT',
        type: 'buy_stop',
        price: 150,
        size: 2.0
      })

      // Price rises to buy_stop
      store.checkPositionsSLTP({
        symbol: 'SOLUSDT',
        price: 151,
        change24h: 0,
        high24h: 155,
        low24h: 140,
        timestamp: Date.now()
      })

      let state = usePaperTradingStore.getState()
      expect(state.account.orders).toHaveLength(0)
      expect(state.account.positions).toHaveLength(1)
      expect(state.account.positions[0].side).toBe('buy')

      // Now place a sell_stop
      await store.placeOrder({
        symbol: 'SOLUSDT',
        type: 'sell_stop',
        price: 140,
        size: 1.0
      })

      // Price falls to sell_stop
      store.checkPositionsSLTP({
        symbol: 'SOLUSDT',
        price: 139,
        change24h: 0,
        high24h: 155,
        low24h: 135,
        timestamp: Date.now()
      })

      state = usePaperTradingStore.getState()
      expect(state.account.orders).toHaveLength(0)
      expect(state.account.positions).toHaveLength(2)
      expect(state.account.positions[1].side).toBe('sell')
    })
  })
})
