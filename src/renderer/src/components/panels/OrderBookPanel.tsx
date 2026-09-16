import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'
import { getSymbolPrecision } from '@shared/market-utils'
import type { OrderBookData } from '@shared/types'

function isUnsupportedOrderBookError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { code?: unknown; statusCode?: unknown; message?: unknown }
  return (
    value.code === 'ORDER_BOOK_NOT_SUPPORTED' ||
    (value.statusCode === 404 &&
      typeof value.message === 'string' &&
      value.message.includes('ORDER_BOOK_NOT_SUPPORTED'))
  )
}

export const OrderBookPanel: React.FC = () => {
  const { symbol, prices, symbols } = useMarketStore()
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true)
  const [unsupportedSymbol, setUnsupportedSymbol] = useState<string | null>(null)

  const currentPrice = symbol ? prices[symbol]?.price : undefined
  const symInfo = symbol ? symbols.find((s) => s.symbol === symbol) : undefined
  const precision = getSymbolPrecision(symbol || 'XAUUSD', symInfo?.category, currentPrice)

  const loadBook = useCallback(
    async (showLoading = false) => {
      try {
        if (!symbol || !symInfo?.capabilities.orderBook) return
        if (showLoading) setIsLoading(true)
        const data = await window.api.orderbook.get(symbol)
        if (data && (data.bids.length > 0 || data.asks.length > 0)) setOrderBook(data)
        else setOrderBook(null)
      } catch (err) {
        if (isUnsupportedOrderBookError(err)) {
          setUnsupportedSymbol(symbol)
          setOrderBook(null)
        } else {
          console.error('[OrderBookPanel] Failed to fetch order book:', err)
        }
      } finally {
        setIsLoading(false)
      }
    },
    [symbol, symInfo]
  )

  useEffect(() => {
    let cancelled = false
    setUnsupportedSymbol(null)
    setOrderBook(null)
    if (!symbol || !symInfo?.capabilities.orderBook) {
      setIsLoading(false)
      return () => {
        cancelled = true
      }
    }
    window.api.orderbook
      .get(symbol)
      .then((data) => {
        if (!cancelled) {
          setOrderBook(data)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (isUnsupportedOrderBookError(err)) {
            setUnsupportedSymbol(symbol)
            setOrderBook(null)
          } else {
            console.error('[OrderBookPanel] Failed to fetch order book:', err)
          }
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [symbol])

  useEffect(() => {
    if (!autoRefresh || !symbol || unsupportedSymbol === symbol || !symInfo?.capabilities.orderBook) {
      return undefined
    }

    let inFlight = false
    const poll = async (): Promise<void> => {
      if (inFlight) return
      inFlight = true
      try {
        const data = await window.api.orderbook.get(symbol)
        if (data && (data.bids.length > 0 || data.asks.length > 0)) setOrderBook(data)
        else setOrderBook(null)
      } catch (err) {
        if (isUnsupportedOrderBookError(err)) {
          setUnsupportedSymbol(symbol)
          setOrderBook(null)
        } else {
          console.error('[OrderBookPanel] Polling failed:', err)
        }
      } finally {
        inFlight = false
      }
    }

    const interval = setInterval(() => {
      void poll()
    }, 2500)
    return () => clearInterval(interval)
  }, [autoRefresh, symbol, symInfo, unsupportedSymbol])

  // Calculate cumulative sizes and max totals for visual depth bars
  const { asksWithTotal, bidsWithTotal, maxTotal } = useMemo(() => {
    if (!orderBook) {
      return { asksWithTotal: [], bidsWithTotal: [], maxTotal: 1 }
    }

    let askSum = 0
    // Asks are displayed top to bottom, highest price down to lowest ask (near mid)
    const asksReversed = [...orderBook.asks].reverse().slice(0, 12)
    const asksWithTotal = asksReversed.map((a) => {
      askSum += a.size
      return { ...a, total: askSum }
    })

    let bidSum = 0
    const bidsWithTotal = orderBook.bids.slice(0, 12).map((b) => {
      bidSum += b.size
      return { ...b, total: bidSum }
    })

    const maxTotal = Math.max(askSum, bidSum, 1)
    return { asksWithTotal, bidsWithTotal, maxTotal }
  }, [orderBook])

  const formatPrice = (val: number): string => {
    return val.toLocaleString(undefined, {
      minimumFractionDigits: precision.pricePrecision,
      maximumFractionDigits: precision.pricePrecision
    })
  }

  const formatSize = (val: number): string => {
    if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M'
    if (val >= 1e3) return (val / 1e3).toFixed(2) + 'K'
    return val.toFixed(val < 10 ? 3 : 1)
  }

  if (!symbol) {
    return <div style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}>Select a symbol to view order book depth.</div>
  }

  if (unsupportedSymbol === symbol || !symInfo?.capabilities.orderBook) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}>
        Order book depth is not supported for {symbol}.
      </div>
    )
  }

  if (!isLoading && (!orderBook || (orderBook.bids.length === 0 && orderBook.asks.length === 0))) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}>
        No live order book depth available for {symbol}.
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        fontSize: 12,
        fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 12px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: 13,
              color: THEME_TOKENS.colors.textBright,
              fontFamily: THEME_TOKENS.typography?.fontSans
            }}
          >
            Order Book
          </span>
          <span
            style={{
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 3,
              backgroundColor: THEME_TOKENS.colors.bgActive,
              color: THEME_TOKENS.colors.accent,
              fontWeight: 600
            }}
          >
            {symbol}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`tv-btn ${autoRefresh ? 'active' : ''}`}
            title={autoRefresh ? 'Pause auto-refresh' : 'Resume live stream'}
            style={{
              fontSize: 10,
              padding: '2px 6px',
              color: autoRefresh ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.textSecondary
            }}
          >
            {autoRefresh ? 'LIVE' : 'PAUSED'}
          </button>
          <button
            type="button"
            onClick={() => loadBook(true)}
            className="tv-btn"
            title="Refresh Order Book"
            disabled={isLoading}
            style={{ padding: 4 }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                animation: isLoading ? 'spin 1s linear infinite' : 'none'
              }}
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>
        </div>
      </div>

      {/* Column Headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          padding: '6px 12px',
          fontSize: 10,
          fontWeight: 600,
          color: THEME_TOKENS.colors.textSecondary,
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
        }}
      >
        <span>PRICE</span>
        <span style={{ textAlign: 'right' }}>SIZE</span>
        <span style={{ textAlign: 'right' }}>TOTAL</span>
      </div>

      {/* Asks (Sells) */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          minHeight: 120
        }}
      >
        {asksWithTotal.map((ask, idx) => {
          const depthPct = Math.min(100, Math.round(((ask.total || 0) / maxTotal) * 100))
          return (
            <div
              key={`ask-${idx}-${ask.price}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                padding: '2px 12px',
                fontSize: 11,
                position: 'relative',
                lineHeight: '18px'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: `${depthPct}%`,
                  backgroundColor: THEME_TOKENS.colors.bearish,
                  opacity: 0.14,
                  pointerEvents: 'none'
                }}
              />
              <span style={{ color: THEME_TOKENS.colors.bearish, fontWeight: 600, zIndex: 1 }}>
                {formatPrice(ask.price)}
              </span>
              <span
                style={{ textAlign: 'right', color: THEME_TOKENS.colors.textPrimary, zIndex: 1 }}
              >
                {formatSize(ask.size)}
              </span>
              <span
                style={{ textAlign: 'right', color: THEME_TOKENS.colors.textSecondary, zIndex: 1 }}
              >
                {formatSize(ask.total || 0)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Mid Market Spread Bar */}
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: THEME_TOKENS.colors.bgApp,
          borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontWeight: 700
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, color: THEME_TOKENS.colors.textBright }}>
            {currentPrice !== undefined ? formatPrice(currentPrice) : '--'}
          </span>
          <span
            style={{
              fontSize: 10,
              color: THEME_TOKENS.colors.textSecondary,
              fontFamily: THEME_TOKENS.typography?.fontSans
            }}
          >
            LAST
          </span>
        </div>

        <div style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
          Spread:{' '}
          <span style={{ color: THEME_TOKENS.colors.textPrimary }}>
            {orderBook ? formatPrice(orderBook.spread) : '--'} (
            {orderBook ? orderBook.spreadPercent.toFixed(3) : '0.000'}%)
          </span>
        </div>
      </div>

      {/* Bids (Buys) */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 120
        }}
      >
        {bidsWithTotal.map((bid, idx) => {
          const depthPct = Math.min(100, Math.round(((bid.total || 0) / maxTotal) * 100))
          return (
            <div
              key={`bid-${idx}-${bid.price}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                padding: '2px 12px',
                fontSize: 11,
                position: 'relative',
                lineHeight: '18px'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: `${depthPct}%`,
                  backgroundColor: THEME_TOKENS.colors.bullish,
                  opacity: 0.14,
                  pointerEvents: 'none'
                }}
              />
              <span style={{ color: THEME_TOKENS.colors.bullish, fontWeight: 600, zIndex: 1 }}>
                {formatPrice(bid.price)}
              </span>
              <span
                style={{ textAlign: 'right', color: THEME_TOKENS.colors.textPrimary, zIndex: 1 }}
              >
                {formatSize(bid.size)}
              </span>
              <span
                style={{ textAlign: 'right', color: THEME_TOKENS.colors.textSecondary, zIndex: 1 }}
              >
                {formatSize(bid.total || 0)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
