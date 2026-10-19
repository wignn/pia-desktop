import React, { useState, useEffect, useMemo } from 'react'
import { usePaperTradingStore } from '../../stores/usePaperTradingStore'
import { useMarketStore } from '../../stores/useMarketStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { getSymbolPrecision } from '@shared/market-utils'
import { THEME_TOKENS } from '../../theme/tokens'

export interface PaperTradingPanelProps {
  initialExecutionMode?: 'market' | 'custom'
  initialLotSize?: string
  initialCustomPrice?: string
  initialSide?: 'buy' | 'sell'
  initialStopLoss?: string
  initialTakeProfit?: string
  onOpenPosition?: (params: {
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
  onClosePosition?: (id: string, price: number) => Promise<boolean>
  onImportClick?: () => void
}

const LOT_PRESETS = ['0.01', '0.05', '0.10', '0.25', '0.50', '1.00', '2.00', '5.00']

export const PaperTradingPanel: React.FC<PaperTradingPanelProps> = ({
  initialExecutionMode = 'market',
  initialLotSize = '0.10',
  initialCustomPrice = '',
  initialSide = 'buy',
  initialStopLoss = '',
  initialTakeProfit = '',
  onOpenPosition,
  onClosePosition,
  onImportClick
}) => {
  const hookAccount = usePaperTradingStore((state) => state.account)
  const account = usePaperTradingStore.getState().account || hookAccount
  const hookAccountType = usePaperTradingStore((state) => state.accountType)
  const accountType = usePaperTradingStore.getState().accountType || hookAccountType
  const setAccountType = usePaperTradingStore((state) => state.setAccountType)
  const storeOpenPosition = usePaperTradingStore((state) => state.openPosition)
  const openPosition = onOpenPosition || storeOpenPosition
  const storeClosePosition = usePaperTradingStore((state) => state.closePosition)
  const closePosition = onClosePosition || storeClosePosition
  const resetAccount = usePaperTradingStore((state) => state.resetAccount)
  const lastExecutedAction = usePaperTradingStore((state) => state.lastExecutedAction)
  const clearActionNotification = usePaperTradingStore((state) => state.clearActionNotification)
  const loadAccount = usePaperTradingStore((state) => state.loadAccount)

  const setImportPositionsModalOpen = useWorkspaceStore((state) => state.setImportPositionsModalOpen)

  const hookSymbol = useMarketStore((state) => state.symbol)
  const symbol = useMarketStore.getState().symbol || hookSymbol
  const hookPrices = useMarketStore((state) => state.prices)
  const prices = useMarketStore.getState().prices || hookPrices

  const [executionMode, setExecutionMode] = useState<'market' | 'custom'>(initialExecutionMode)
  const [side, setSide] = useState<'buy' | 'sell'>(initialSide)
  const [size, setSize] = useState(initialLotSize)
  const [customPrice, setCustomPrice] = useState(initialCustomPrice)
  const [stopLoss, setStopLoss] = useState(initialStopLoss)
  const [takeProfit, setTakeProfit] = useState(initialTakeProfit)
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

  const isCentAccount = accountType === 'cent' || account.accountType === 'cent'
  const currentQuote = symbol ? prices[symbol] : undefined
  const livePrice = currentQuote?.price ?? 0
  const liveAsk = currentQuote?.ask ?? currentQuote?.price ?? 0
  const liveBid = currentQuote?.bid ?? currentQuote?.price ?? 0

  const activeMarketPrice = side === 'buy' ? liveAsk : liveBid
  const effectivePrice =
    executionMode === 'custom' ? parseFloat(customPrice) || 0 : activeMarketPrice

  const { pricePrecision } = getSymbolPrecision(symbol || '', undefined, livePrice)

  // Pip specifications for currency/asset heuristics
  // ponytail: pip stepper uses standard pip formula; upgrade to broker point spec when exotic pairs are added
  const { pipSize, pipDecimals } = useMemo(() => {
    const upper = (symbol || '').toUpperCase()
    const isJpy = upper.includes('JPY')
    const isCrypto = ['BTC', 'ETH', 'SOL', 'USDT'].some((c) => upper.includes(c))
    const pSize = isCrypto ? 1.0 : isJpy ? 0.01 : 0.0001
    const pDecimals = isCrypto ? 2 : isJpy ? 3 : 5
    return { pipSize: pSize, pipDecimals: pDecimals }
  }, [symbol])

  const orderSizeNum = parseFloat(size) || 0
  const orderMargin = orderSizeNum * effectivePrice
  const orderEstValue = orderSizeNum * effectivePrice
  const orderPipValue = orderSizeNum * pipSize

  // Format currency value based on account mode
  const formatCurrency = (val: number): string => {
    if (isCentAccount) {
      return `${Math.round(val).toLocaleString('en-US')} ¢`
    }
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // Calculate live metrics for open positions
  const positionsWithLiveMetrics = useMemo(() => {
    return (account.positions || []).map((pos) => {
      const liveQ = prices[pos.symbol]
      const markPrice = liveQ?.price ?? pos.entryPrice
      const pnl =
        pos.side === 'buy'
          ? (markPrice - pos.entryPrice) * pos.size
          : (pos.entryPrice - markPrice) * pos.size
      const pnlPercent = pos.entryPrice > 0 ? (pnl / (pos.entryPrice * pos.size)) * 100 : 0
      const posMargin = pos.size * pos.entryPrice
      const { pricePrecision: posPrecision } = getSymbolPrecision(
        pos.symbol,
        undefined,
        pos.entryPrice
      )

      return {
        ...pos,
        livePrice: markPrice,
        pnl,
        pnlPercent,
        margin: posMargin,
        precision: posPrecision
      }
    })
  }, [account.positions, prices])

  const totalUnrealizedPnl = useMemo(() => {
    return positionsWithLiveMetrics.reduce((acc, pos) => acc + pos.pnl, 0)
  }, [positionsWithLiveMetrics])

  const totalInvestedMargin = useMemo(() => {
    return positionsWithLiveMetrics.reduce((acc, pos) => acc + pos.margin, 0)
  }, [positionsWithLiveMetrics])

  const portfolioEquity = account.balance + totalInvestedMargin + totalUnrealizedPnl

  const handleApplyPips = (target: 'sl' | 'tp', pips: number): void => {
    const basePrice = effectivePrice > 0 ? effectivePrice : livePrice
    if (basePrice <= 0) return

    let targetPrice: number
    if (target === 'sl') {
      targetPrice = side === 'buy' ? basePrice - pips * pipSize : basePrice + pips * pipSize
      setStopLoss(targetPrice > 0 ? targetPrice.toFixed(pipDecimals) : '')
    } else {
      targetPrice = side === 'buy' ? basePrice + pips * pipSize : basePrice - pips * pipSize
      setTakeProfit(targetPrice > 0 ? targetPrice.toFixed(pipDecimals) : '')
    }
  }

  const handlePlaceOrder = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setOrderError(null)

    if (!symbol) {
      setOrderError('Select a valid symbol')
      return
    }

    if (orderSizeNum <= 0) {
      setOrderError('Please enter a valid lot size')
      return
    }

    if (effectivePrice <= 0) {
      setOrderError(
        executionMode === 'custom'
          ? 'Please enter a valid custom entry price'
          : 'Waiting for live market price feed...'
      )
      return
    }

    setIsSubmitting(true)
    const slNum = parseFloat(stopLoss)
    const tpNum = parseFloat(takeProfit)

    const res = await openPosition({
      symbol,
      side,
      size: orderSizeNum,
      price: effectivePrice,
      stopLoss: !isNaN(slNum) && slNum > 0 ? slNum : undefined,
      takeProfit: !isNaN(tpNum) && tpNum > 0 ? tpNum : undefined,
      accountType: isCentAccount ? 'cent' : 'standard',
      source: 'manual'
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
    const initialBal = isCentAccount ? 10000000 : 100000
    const label = isCentAccount ? '10,000,000 ¢' : '$100,000.00'
    if (typeof window !== 'undefined' && window.confirm) {
      if (
        !window.confirm(`Are you sure you want to reset paper trading account balance to ${label}?`)
      ) {
        return
      }
    }
    resetAccount(initialBal)
  }

  const handleOpenImportModal = (): void => {
    if (onImportClick) {
      onImportClick()
    } else {
      setImportPositionsModalOpen(true, 'import')
    }
  }

  const isBullish = side === 'buy'
  const jewelBg = isBullish
    ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
    : 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)'
  const jewelShadow = isBullish
    ? '0 2px 10px rgba(16, 185, 129, 0.35)'
    : '0 2px 10px rgba(244, 63, 94, 0.35)'

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
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
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
            title="Reset Account Balance"
            style={{ fontSize: 10, padding: '2px 6px', color: THEME_TOKENS.colors.textSecondary }}
          >
            Reset
          </button>
        </div>

        {/* Standard / Cent Pill Toggle */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            backgroundColor: THEME_TOKENS.colors.bgApp,
            padding: 2,
            borderRadius: 6,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
          }}
        >
          <button
            type="button"
            onClick={() => setAccountType('standard')}
            style={{
              flex: 1,
              padding: '5px 8px',
              borderRadius: 4,
              border: 'none',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: !isCentAccount ? THEME_TOKENS.colors.accent : 'transparent',
              color: !isCentAccount ? '#ffffff' : THEME_TOKENS.colors.textSecondary,
              transition: 'all 0.15s ease'
            }}
          >
            Standard (100k)
          </button>
          <button
            type="button"
            onClick={() => setAccountType('cent')}
            style={{
              flex: 1,
              padding: '5px 8px',
              borderRadius: 4,
              border: 'none',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: isCentAccount ? THEME_TOKENS.colors.gold : 'transparent',
              color: isCentAccount ? '#ffffff' : THEME_TOKENS.colors.textSecondary,
              transition: 'all 0.15s ease'
            }}
          >
            Cent (1k)
          </button>
        </div>

        {/* Account Metrics Capsule */}
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
              Balance
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                fontFamily: 'monospace',
                color: THEME_TOKENS.colors.textBright
              }}
            >
              {formatCurrency(account.balance)}
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
              {formatCurrency(portfolioEquity)}
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
              {totalUnrealizedPnl >= 0 ? '+' : ''}
              {formatCurrency(totalUnrealizedPnl)}
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
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
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
            Order Entry ({symbol || '---'})
          </span>
          <span
            style={{ fontSize: 11, fontFamily: 'monospace', color: THEME_TOKENS.colors.accent }}
          >
            {livePrice > 0 ? `$${livePrice.toFixed(pricePrecision)}` : 'Loading...'}
          </span>
        </div>

        {/* Execution Mode: Market vs Custom Entry */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            backgroundColor: THEME_TOKENS.colors.bgApp,
            padding: 2,
            borderRadius: 5,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
          }}
        >
          <button
            type="button"
            onClick={() => setExecutionMode('market')}
            style={{
              flex: 1,
              padding: '4px 6px',
              borderRadius: 4,
              border: 'none',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor:
                executionMode === 'market' ? THEME_TOKENS.colors.bgActive : 'transparent',
              color:
                executionMode === 'market'
                  ? THEME_TOKENS.colors.textBright
                  : THEME_TOKENS.colors.textSecondary,
              transition: 'all 0.15s ease'
            }}
          >
            Market
          </button>
          <button
            type="button"
            onClick={() => setExecutionMode('custom')}
            style={{
              flex: 1,
              padding: '4px 6px',
              borderRadius: 4,
              border: 'none',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor:
                executionMode === 'custom' ? THEME_TOKENS.colors.bgActive : 'transparent',
              color:
                executionMode === 'custom'
                  ? THEME_TOKENS.colors.textBright
                  : THEME_TOKENS.colors.textSecondary,
              transition: 'all 0.15s ease'
            }}
          >
            Custom Entry
          </button>
        </div>

        {/* Custom Entry Price Numeric Input (when in Custom Entry mode) */}
        {executionMode === 'custom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
              Custom Entry Price
            </label>
            <input
              type="number"
              step="any"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              className="tv-input"
              style={{ fontSize: 12, padding: '5px 8px' }}
              placeholder={livePrice > 0 ? livePrice.toFixed(pricePrecision) : 'Enter entry price'}
              required
            />
          </div>
        )}

        {/* Buy / Sell Tab Selectors */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => setSide('buy')}
            style={{
              flex: 1,
              padding: '6px 4px',
              borderRadius: 4,
              border: 'none',
              fontWeight: 700,
              fontSize: 11,
              cursor: 'pointer',
              backgroundColor:
                side === 'buy' ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bgApp,
              color: side === 'buy' ? '#ffffff' : THEME_TOKENS.colors.textSecondary,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              transition: 'all 0.15s ease'
            }}
          >
            <span>BUY / LONG</span>
            <span style={{ fontSize: 10, fontFamily: 'monospace', opacity: 0.9 }}>
              {liveAsk > 0 ? liveAsk.toFixed(pricePrecision) : '---'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSide('sell')}
            style={{
              flex: 1,
              padding: '6px 4px',
              borderRadius: 4,
              border: 'none',
              fontWeight: 700,
              fontSize: 11,
              cursor: 'pointer',
              backgroundColor:
                side === 'sell' ? THEME_TOKENS.colors.bearish : THEME_TOKENS.colors.bgApp,
              color: side === 'sell' ? '#ffffff' : THEME_TOKENS.colors.textSecondary,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              transition: 'all 0.15s ease'
            }}
          >
            <span>SELL / SHORT</span>
            <span style={{ fontSize: 10, fontFamily: 'monospace', opacity: 0.9 }}>
              {liveBid > 0 ? liveBid.toFixed(pricePrecision) : '---'}
            </span>
          </button>
        </div>

        {/* Quick Lot Presets + Custom Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: THEME_TOKENS.colors.textSecondary
            }}
          >
            <span>Lot Size</span>
            <span style={{ fontFamily: 'monospace' }}>{`${orderSizeNum.toFixed(2)} L`}</span>
          </div>

          {/* 8 Preset Pills */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {LOT_PRESETS.map((preset) => {
              const isSelected = size === preset
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setSize(preset)}
                  style={{
                    padding: '3px 0',
                    borderRadius: 4,
                    border: `1px solid ${isSelected ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.borderSubtle}`,
                    backgroundColor: isSelected
                      ? 'rgba(59, 130, 246, 0.18)'
                      : THEME_TOKENS.colors.bgApp,
                    color: isSelected
                      ? THEME_TOKENS.colors.accent
                      : THEME_TOKENS.colors.textSecondary,
                    fontSize: 10,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {preset}
                </button>
              )
            })}
          </div>

          <input
            type="number"
            step="any"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="tv-input"
            style={{ fontSize: 12, padding: '5px 8px', marginTop: 2 }}
            placeholder="Custom lot size (e.g. 0.10)"
            required
          />
        </div>

        {/* SL & TP with Pip Steppers */}
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Stop Loss */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <label style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                Stop Loss
              </label>
              <div style={{ display: 'flex', gap: 2 }}>
                {[10, 25, 50].map((pips) => (
                  <button
                    key={pips}
                    type="button"
                    onClick={() => handleApplyPips('sl', pips)}
                    title={`Add ${pips} pips SL`}
                    style={{
                      padding: '1px 3px',
                      fontSize: 8,
                      borderRadius: 3,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      backgroundColor: THEME_TOKENS.colors.bgApp,
                      color: THEME_TOKENS.colors.bearish,
                      cursor: 'pointer'
                    }}
                  >
                    {`+${pips}`}
                  </button>
                ))}
              </div>
            </div>
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

          {/* Take Profit */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <label style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                Take Profit
              </label>
              <div style={{ display: 'flex', gap: 2 }}>
                {[10, 25, 50].map((pips) => (
                  <button
                    key={pips}
                    type="button"
                    onClick={() => handleApplyPips('tp', pips)}
                    title={`Add ${pips} pips TP`}
                    style={{
                      padding: '1px 3px',
                      fontSize: 8,
                      borderRadius: 3,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      backgroundColor: THEME_TOKENS.colors.bgApp,
                      color: THEME_TOKENS.colors.bullish,
                      cursor: 'pointer'
                    }}
                  >
                    {`+${pips}`}
                  </button>
                ))}
              </div>
            </div>
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

        {/* Order Estimate Summary (Margin required, Pip value, Est. value) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            padding: '8px 10px',
            borderRadius: 5,
            backgroundColor: THEME_TOKENS.colors.bgApp,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            fontSize: 10
          }}
        >
          <div>
            <div style={{ color: THEME_TOKENS.colors.textSecondary }}>Margin Required</div>
            <div
              style={{
                fontWeight: 700,
                fontFamily: 'monospace',
                color: THEME_TOKENS.colors.textBright
              }}
            >
              {formatCurrency(orderMargin)}
            </div>
          </div>
          <div>
            <div style={{ color: THEME_TOKENS.colors.textSecondary }}>Pip Value</div>
            <div
              style={{
                fontWeight: 700,
                fontFamily: 'monospace',
                color: THEME_TOKENS.colors.textBright
              }}
            >
              {formatCurrency(orderPipValue)}
            </div>
          </div>
          <div
            style={{
              gridColumn: 'span 2',
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              paddingTop: 4
            }}
          >
            <span style={{ color: THEME_TOKENS.colors.textSecondary }}>Est. Value</span>
            <span
              style={{
                fontWeight: 700,
                fontFamily: 'monospace',
                color: THEME_TOKENS.colors.textBright
              }}
            >
              {formatCurrency(orderEstValue)}
            </span>
          </div>
        </div>

        {orderError && (
          <div style={{ fontSize: 11, color: THEME_TOKENS.colors.bearish }}>{orderError}</div>
        )}

        {/* Submit Button (Chamfered Jewel Button) */}
        <button
          type="submit"
          disabled={isSubmitting || effectivePrice <= 0}
          style={{
            padding: '9px 12px',
            borderRadius: 6,
            border: 'none',
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: 0.3,
            cursor: effectivePrice <= 0 ? 'not-allowed' : 'pointer',
            background: jewelBg,
            boxShadow: jewelShadow,
            color: '#ffffff',
            opacity: effectivePrice <= 0 ? 0.6 : 1,
            transition: 'all 0.15s ease'
          }}
        >
          {isSubmitting
            ? 'Placing Order...'
            : effectivePrice > 0
              ? `${side.toUpperCase()} ${orderSizeNum.toFixed(2)} L @ ${effectivePrice.toFixed(pricePrecision)}`
              : `Place ${side.toUpperCase()} Order (${orderSizeNum.toFixed(2)} L)`}
        </button>
      </form>

      {/* Positions & Utilities */}
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

        {/* Action Shortcut: [↓ Import Positions] */}
        <button
          type="button"
          onClick={handleOpenImportModal}
          className="tv-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
            padding: '7px 10px',
            borderRadius: 5,
            backgroundColor: 'rgba(59, 130, 246, 0.12)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            color: THEME_TOKENS.colors.accent,
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <span>↓ Import Positions</span>
        </button>

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
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(244, 63, 94, 0.15)',
                        color:
                          pos.side === 'buy'
                            ? THEME_TOKENS.colors.bullish
                            : THEME_TOKENS.colors.bearish
                      }}
                    >
                      {pos.side.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
                      {`${pos.size.toFixed(2)} L`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => closePosition(pos.id, pos.livePrice)}
                    title="Close position"
                    style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      color: THEME_TOKENS.colors.bearish,
                      background: 'none',
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      borderRadius: 4,
                      cursor: 'pointer'
                    }}
                  >
                    ✕
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
                    {`Entry: ${pos.entryPrice.toFixed(pos.precision)}`}
                  </span>
                  <span style={{ color: THEME_TOKENS.colors.textBright }}>
                    {`Mark: ${pos.livePrice.toFixed(pos.precision)}`}
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        pos.pnl >= 0 ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish
                    }}
                  >
                    {`${pos.pnl >= 0 ? '+' : ''}${formatCurrency(pos.pnl)} (${pos.pnlPercent >= 0 ? '+' : ''}${pos.pnlPercent.toFixed(2)}%)`}
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
                    {pos.stopLoss && <span>{`SL: ${pos.stopLoss.toFixed(pos.precision)}`}</span>}
                    {pos.takeProfit && <span>{`TP: ${pos.takeProfit.toFixed(pos.precision)}`}</span>}
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
