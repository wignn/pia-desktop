import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useMarketStore } from '../../../stores/useMarketStore'
import type { CandleBar } from '@shared/types'

const POPULAR_SYMBOLS = ['XAUUSD', 'BTCUSDT', 'ETHUSDT', 'NVDA', 'SPY', 'DXY', 'AAPL', 'TSLA']
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '1d']

export const MiniChartWidget: React.FC<{
  symbol?: string
  timeframe?: string
  onUpdateConfig?: (cfg: { symbol?: string; timeframe?: string }) => void
}> = ({ symbol = 'XAUUSD', timeframe = '15m', onUpdateConfig }) => {
  const [activeSymbol, setActiveSymbol] = useState(symbol)
  const [activeTf, setActiveTf] = useState(timeframe)
  const [candles, setCandles] = useState<CandleBar[]>([])
  const [hoveredBar, setHoveredBar] = useState<CandleBar | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const { prices } = useMarketStore()
  const currentQuote = prices[activeSymbol]
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Fetch candle data
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    window.api.market
      .getCandles({
        symbol: activeSymbol,
        timeframe: activeTf as any,
        limit: 80
      })
      .then((bars) => {
        if (cancelled) return
        setCandles(bars || [])
        setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeSymbol, activeTf])

  const handleSelectSymbol = (sym: string) => {
    setActiveSymbol(sym)
    if (onUpdateConfig) onUpdateConfig({ symbol: sym, timeframe: activeTf })
  }

  const handleSelectTf = (tf: string) => {
    setActiveTf(tf)
    if (onUpdateConfig) onUpdateConfig({ symbol: activeSymbol, timeframe: tf })
  }

  // Calculate high, low, and SVG candle geometry
  const chartData = useMemo(() => {
    if (candles.length === 0) return null
    let minPrice = Infinity
    let maxPrice = -Infinity
    let maxVol = 0

    for (const b of candles) {
      if (b.low < minPrice) minPrice = b.low
      if (b.high > maxPrice) maxPrice = b.high
      if (b.volume && b.volume > maxVol) maxVol = b.volume
    }

    const priceRange = maxPrice - minPrice || 1
    return { minPrice, maxPrice, priceRange, maxVol }
  }, [candles])

  const latestBar = candles[candles.length - 1]
  const displayPrice =
    currentQuote?.price !== undefined
      ? currentQuote.price
      : latestBar?.close !== undefined
        ? latestBar.close
        : 0
  const displayChange =
    currentQuote?.change24hPercent !== undefined
      ? currentQuote.change24hPercent
      : latestBar && candles.length > 1
        ? ((latestBar.close - candles[0].open) / candles[0].open) * 100
        : 0
  const isPositive = displayChange >= 0

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#131722',
        color: '#d1d4dc',
        overflow: 'hidden'
      }}
    >
      {/* Top Header: Symbol Pills & Timeframe */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          backgroundColor: '#181d28',
          borderBottom: '1px solid #2a2e39',
          gap: 6,
          flexWrap: 'wrap',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {POPULAR_SYMBOLS.map((sym) => {
            const isSel = sym === activeSymbol
            return (
              <button
                key={sym}
                type="button"
                onClick={() => handleSelectSymbol(sym)}
                style={{
                  padding: '1px 6px',
                  borderRadius: 3,
                  fontSize: 10,
                  fontWeight: isSel ? 700 : 500,
                  border: isSel ? '1px solid #2962ff' : '1px solid transparent',
                  backgroundColor: isSel ? 'rgba(41, 98, 255, 0.2)' : 'transparent',
                  color: isSel ? '#2962ff' : '#787b86',
                  cursor: 'pointer'
                }}
              >
                {sym}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
          {TIMEFRAMES.map((tf) => {
            const isSel = tf === activeTf
            return (
              <button
                key={tf}
                type="button"
                onClick={() => handleSelectTf(tf)}
                style={{
                  padding: '1px 5px',
                  borderRadius: 2,
                  fontSize: 9,
                  fontWeight: isSel ? 700 : 500,
                  backgroundColor: isSel ? '#2a2e39' : 'transparent',
                  color: isSel ? '#ffffff' : '#787b86',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {tf}
              </button>
            )
          })}
        </div>
      </div>

      {/* Stats Sub-header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderBottom: '1px solid #1e222d',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
            {displayPrice >= 1000
              ? displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : displayPrice.toFixed(displayPrice >= 1 ? 3 : 5)}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isPositive ? '#089981' : '#f23645'
            }}
          >
            {isPositive ? '+' : ''}
            {displayChange.toFixed(2)}%
          </span>
        </div>

        {hoveredBar && (
          <div style={{ fontSize: 10, color: '#787b86', display: 'flex', gap: 8 }}>
            <span>O: <strong style={{ color: '#d1d4dc' }}>{hoveredBar.open}</strong></span>
            <span>H: <strong style={{ color: '#d1d4dc' }}>{hoveredBar.high}</strong></span>
            <span>L: <strong style={{ color: '#d1d4dc' }}>{hoveredBar.low}</strong></span>
            <span>C: <strong style={{ color: '#d1d4dc' }}>{hoveredBar.close}</strong></span>
          </div>
        )}
      </div>

      {/* SVG Candlestick Canvas Area */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          width: '100%',
          minHeight: 0,
          backgroundColor: '#131722',
          padding: '4px 8px'
        }}
      >
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: 11,
              color: '#787b86'
            }}
          >
            Loading candles...
          </div>
        )}

        {chartData && candles.length > 0 && (
          <svg
            style={{ width: '100%', height: '100%', overflow: 'visible' }}
            viewBox={`0 0 1000 300`}
            preserveAspectRatio="none"
          >
            {/* Horizontal Grid lines */}
            <line x1="0" y1="75" x2="1000" y2="75" stroke="#1e222d" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="0" y1="150" x2="1000" y2="150" stroke="#1e222d" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="0" y1="225" x2="1000" y2="225" stroke="#1e222d" strokeWidth="1" strokeDasharray="3 3" />

            {candles.map((bar, idx) => {
              const candleW = 1000 / candles.length
              const x = idx * candleW + candleW * 0.15
              const bodyW = Math.max(candleW * 0.7, 1.5)
              const centerX = x + bodyW / 2

              const chartH = 240 // upper 80% for price, lower 20% for volume
              const scaleY = (p: number) =>
                chartH - ((p - chartData.minPrice) / chartData.priceRange) * (chartH - 20) - 10

              const yOpen = scaleY(bar.open)
              const yClose = scaleY(bar.close)
              const yHigh = scaleY(bar.high)
              const yLow = scaleY(bar.low)

              const isUp = bar.close >= bar.open
              const color = isUp ? '#089981' : '#f23645'
              const bodyY = Math.min(yOpen, yClose)
              const bodyH = Math.max(Math.abs(yOpen - yClose), 1.5)

              // Volume bar in lower section
              const volH = chartData.maxVol > 0 ? ((bar.volume || 0) / chartData.maxVol) * 45 : 0
              const volY = 295 - volH

              return (
                <g
                  key={bar.timestamp}
                  onMouseEnter={() => setHoveredBar(bar)}
                  onMouseLeave={() => setHoveredBar(null)}
                  style={{ cursor: 'crosshair' }}
                >
                  {/* Volume Bar */}
                  <rect x={x} y={volY} width={bodyW} height={volH} fill={color} opacity="0.3" />

                  {/* Wick */}
                  <line x1={centerX} y1={yHigh} x2={centerX} y2={yLow} stroke={color} strokeWidth="1.2" />

                  {/* Candle Body */}
                  <rect x={x} y={bodyY} width={bodyW} height={bodyH} fill={color} />
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}
