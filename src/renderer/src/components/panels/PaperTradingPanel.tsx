import React, { useState, useEffect } from 'react'
import { usePaperTradingStore } from '../../stores/usePaperTradingStore'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'

export const PaperTradingPanel: React.FC = () => {
  const {
    account,
    loadAccount,
    openPosition,
    closePosition,
    resetAccount,
    lastExecutedAction,
    clearActionNotification
  } = usePaperTradingStore()
  const { symbol, prices } = useMarketStore()

  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [size, setSize] = useState('1')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [orderError, setOrderError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    loadAccount()
  }, [loadAccount])

  // Clear action toast after 4 seconds
  useEffect(() => {
    if (lastExecutedAction) {
      const timer = setTimeout(() => {
        clearActionNotification()
      }, 4000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [lastExecutedAction, clearActionNotification])

  const currentQuote = symbol ? prices[symbol] : undefined
  const currentPrice = currentQuote?.price ?? 0
  const orderSizeNum = parseFloat(size) || 0
  const orderEstValue = orderSizeNum * currentPrice

  // Calculate total unrealized PnL and invested margin across all open positions
  const positionsWithLiveMetrics = account.positions.map((pos) => {
    const livePrice = prices[pos.symbol]?.price ?? pos.entryPrice
    const pnl =
      pos.side === 'buy'
        ? (livePrice - pos.entryPrice) * pos.size
        : (pos.entryPrice - livePrice) * pos.size
    const pnlPercent = (pnl / (pos.entryPrice * pos.size)) * 100

    return {
      ...pos,
      livePrice,
      pnl,
      pnlPercent
    }
  })

  const totalUnrealizedPnl = positionsWithLiveMetrics.reduce((acc, pos) => acc + pos.pnl, 0)
  const totalInvestedMargin = positionsWithLiveMetrics.reduce(
    (acc, pos) => acc + pos.size * pos.entryPrice,
    0
  )

  const portfolioEquity = account.balance + totalInvestedMargin + totalUnrealizedPnl

  const handlePlaceOrder = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setOrderError(null)

    if (!symbol) {
      setOrderError('Select a valid symbol')
      return
    }

    if (currentPrice <= 0) {
      setOrderError('Waiting for live market price feed...')
      return
    }

    if (orderSizeNum <= 0) {
      setOrderError('Please enter a valid order size')
      return
    }

    setIsSubmitting(true)
    const slNum = parseFloat(stopLoss)
    const tpNum = parseFloat(takeProfit)

    const res = await openPosition({
      symbol,
      side,
      size: orderSizeNum,
      price: currentPrice,
      stopLoss: !isNaN(slNum) && slNum > 0 ? slNum : undefined,
      takeProfit: !isNaN(tpNum) && tpNum > 0 ? tpNum : undefined
    })

    setIsSubmitting(false)
    if (!res.success) {
      setOrderError(res.error || 'Failed to execute paper order')
    } else {
      setStopLoss('')
      setTakeProfit('')
    }
  }

  const handleReset = (): void => {
    if (
      window.confirm('Are you sure you want to reset paper trading account balance to $100,000.00?')
    ) {
      resetAccount(100000)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        color: THEME_TOKENS.colors.textPrimary,
        userSelect: 'none',
        overflowY: 'auto'
      }}
    >
      {/* Account Overview Header Card */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>Paper Trading</span>
            <span
              style={{
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 4,
                backgroundColor: 'rgba(41, 98, 255, 0.15)',
                color: THEME_TOKENS.colors.accent,
                fontWeight: 700
              }}
            >
              SIMULATION
            </span>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="tv-btn"
            title="Reset to $100,000.00"
            style={{ fontSize: 10, padding: '2px 6px', color: THEME_TOKENS.colors.textSecondary }}
          >
            Reset
          </button>
        </div>

        {/* Portfolio Stats Matrix */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            backgroundColor: THEME_TOKENS.colors.bgApp,
            padding: 10,
            borderRadius: 6,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
              Cash Balance
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                fontFamily: 'monospace',
                color: THEME_TOKENS.colors.textBright
              }}
            >
              $
              {account.balance.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>Equity</div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                fontFamily: 'monospace',
                color: THEME_TOKENS.colors.textBright
              }}
            >
              $
              {portfolioEquity.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
              Unrealized PnL
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                fontFamily: 'monospace',
                color:
                  totalUnrealizedPnl > 0
                    ? THEME_TOKENS.colors.bullish
                    : totalUnrealizedPnl < 0
                      ? THEME_TOKENS.colors.bearish
                      : THEME_TOKENS.colors.textSecondary
              }}
            >
              {totalUnrealizedPnl >= 0 ? '+' : ''}$
              {totalUnrealizedPnl.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Execution Toast Notice */}
      {lastExecutedAction && (
        <div
          style={{
            margin: '8px 14px 0 14px',
            padding: '6px 10px',
            borderRadius: 4,
            backgroundColor: 'rgba(41, 98, 255, 0.15)',
            border: `1px solid ${THEME_TOKENS.colors.accent}`,
            color: THEME_TOKENS.colors.textBright,
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span>{lastExecutedAction}</span>
          <button
            type="button"
            onClick={clearActionNotification}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: 0
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Order Entry Card */}
      <form
        onSubmit={handlePlaceOrder}
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
            Order Entry ({symbol})
          </span>
          <span
            style={{ fontSize: 11, fontFamily: 'monospace', color: THEME_TOKENS.colors.accent }}
          >
            {currentPrice > 0 ? `$${currentPrice.toFixed(2)}` : 'Loading...'}
          </span>
        </div>

        {/* Buy / Sell Tab Selectors */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => setSide('buy')}
            style={{
              flex: 1,
              padding: '6px 0',
              borderRadius: 4,
              border: 'none',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              backgroundColor:
                side === 'buy' ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bgApp,
              color: side === 'buy' ? '#ffffff' : THEME_TOKENS.colors.textSecondary,
              transition: 'all 0.15s ease'
            }}
          >
            BUY / LONG
          </button>

          <button
            type="button"
            onClick={() => setSide('sell')}
            style={{
              flex: 1,
              padding: '6px 0',
              borderRadius: 4,
              border: 'none',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              backgroundColor:
                side === 'sell' ? THEME_TOKENS.colors.bearish : THEME_TOKENS.colors.bgApp,
              color: side === 'sell' ? '#ffffff' : THEME_TOKENS.colors.textSecondary,
              transition: 'all 0.15s ease'
            }}
          >
            SELL / SHORT
          </button>
        </div>

        {/* Order Size */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: THEME_TOKENS.colors.textSecondary
            }}
          >
            <span>Order Quantity</span>
            {orderEstValue > 0 && <span>Est. Value: ${orderEstValue.toFixed(2)}</span>}
          </div>
          <input
            type="number"
            step="any"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="tv-input"
            style={{ fontSize: 12, padding: '5px 8px' }}
            placeholder="Size in units"
            required
          />
        </div>

        {/* Optional SL & TP */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
              Stop Loss (Optional)
            </label>
            <input
              type="number"
              step="any"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              className="tv-input"
              style={{ fontSize: 11, padding: '4px 6px' }}
              placeholder="Trigger price"
            />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
              Take Profit (Optional)
            </label>
            <input
              type="number"
              step="any"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              className="tv-input"
              style={{ fontSize: 11, padding: '4px 6px' }}
              placeholder="Trigger price"
            />
          </div>
        </div>

        {orderError && (
          <div style={{ fontSize: 11, color: THEME_TOKENS.colors.bearish }}>{orderError}</div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || currentPrice <= 0}
          style={{
            padding: '7px 0',
            borderRadius: 4,
            border: 'none',
            fontWeight: 700,
            fontSize: 12,
            cursor: currentPrice <= 0 ? 'not-allowed' : 'pointer',
            backgroundColor:
              side === 'buy' ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish,
            color: '#ffffff',
            opacity: currentPrice <= 0 ? 0.6 : 1
          }}
        >
          {isSubmitting
            ? 'Placing Order...'
            : `Place ${side.toUpperCase()} Order (${orderSizeNum} ${symbol})`}
        </button>
      </form>

      {/* Open Positions List */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: THEME_TOKENS.colors.textSecondary
            }}
          >
            Open Positions ({account.positions.length})
          </span>
        </div>

        {account.positions.length === 0 ? (
          <div
            style={{
              padding: '24px 0',
              textAlign: 'center',
              color: THEME_TOKENS.colors.textSecondary,
              fontSize: 12
            }}
          >
            No open paper positions.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {positionsWithLiveMetrics.map((pos) => (
              <div
                key={pos.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  backgroundColor: THEME_TOKENS.colors.bgApp,
                  border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: THEME_TOKENS.colors.textBright
                      }}
                    >
                      {pos.symbol}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 3,
                        backgroundColor:
                          pos.side === 'buy'
                            ? 'rgba(8, 153, 129, 0.15)'
                            : 'rgba(242, 54, 69, 0.15)',
                        color:
                          pos.side === 'buy'
                            ? THEME_TOKENS.colors.bullish
                            : THEME_TOKENS.colors.bearish
                      }}
                    >
                      {pos.side.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
                      {pos.size} units
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => closePosition(pos.id, pos.livePrice)}
                    className="tv-btn"
                    style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      color: THEME_TOKENS.colors.bearish,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                    }}
                  >
                    Close
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    fontFamily: 'monospace'
                  }}
                >
                  <span style={{ color: THEME_TOKENS.colors.textSecondary }}>
                    Entry: ${pos.entryPrice.toFixed(2)}
                  </span>
                  <span style={{ color: THEME_TOKENS.colors.textBright }}>
                    Mark: ${pos.livePrice.toFixed(2)}
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        pos.pnl >= 0 ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish
                    }}
                  >
                    {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)} ({pos.pnlPercent >= 0 ? '+' : ''}
                    {pos.pnlPercent.toFixed(2)}%)
                  </span>
                </div>

                {(pos.stopLoss || pos.takeProfit) && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      fontSize: 10,
                      color: THEME_TOKENS.colors.textSecondary
                    }}
                  >
                    {pos.stopLoss && <span>SL: ${pos.stopLoss.toFixed(2)}</span>}
                    {pos.takeProfit && <span>TP: ${pos.takeProfit.toFixed(2)}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
