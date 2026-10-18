import React, { useEffect, useMemo, useRef, useState } from 'react'
import { dispose, init, type Chart, type KLineData } from 'klinecharts'
import { TIMEFRAMES } from '@shared/types'
import type { Timeframe } from '@shared/types'
import { getSymbolPrecision } from '@shared/market-utils'
import { useMarketStore } from '../../../stores/useMarketStore'
import { useWorkspaceStore } from '../../../stores/useWorkspaceStore'
import { CandleEngine, registerCandleEngine } from '../../../services/candle-engine'
import { timeframeToPeriod } from '../../../utils/timeframe'
import { resolveControlWidgetTimeframe } from '../../../utils/control-panel-helpers'
import { getChartThemeStyles, THEME_TOKENS } from '../../../theme/tokens'

const PREFERRED_SYMBOLS = ['XAUUSD', 'BTCUSDT', 'ETHUSDT', 'NVDA', 'SPY', 'DXY', 'AAPL', 'TSLA']

interface MiniChartWidgetProps {
  symbol?: string
  timeframe?: Timeframe
  onUpdateConfig?: (config: { symbol?: string; timeframe?: Timeframe }) => void
}

export const MiniChartWidget: React.FC<MiniChartWidgetProps> = ({
  symbol,
  timeframe = '15m',
  onUpdateConfig
}) => {
  const symbols = useMarketStore((state) => state.symbols)
  const prices = useMarketStore((state) => state.prices)
  const theme = useWorkspaceStore((state) => state.theme)
  const activeTimeframe = resolveControlWidgetTimeframe(timeframe)
  const [displayBar, setDisplayBar] = useState<KLineData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const subscriberRef = useRef<((bar: KLineData) => void) | null>(null)
  const timeframeRef = useRef(activeTimeframe)
  const [engine] = useState(() => new CandleEngine('', activeTimeframe))

  const selectableSymbols = useMemo(() => {
    const preferred = new Map(PREFERRED_SYMBOLS.map((item, index) => [item, index]))
    return [...symbols]
      .filter((item) => item.capabilities.candles)
      .sort((left, right) => {
        const leftRank = preferred.get(left.symbol) ?? Number.MAX_SAFE_INTEGER
        const rightRank = preferred.get(right.symbol) ?? Number.MAX_SAFE_INTEGER
        return leftRank - rightRank || left.symbol.localeCompare(right.symbol)
      })
      .slice(0, 12)
  }, [symbols])

  const requestedSymbol = symbol?.trim().toUpperCase() ?? ''
  const activeSymbol = symbols.some(
    (item) => item.symbol === requestedSymbol && item.capabilities.candles
  )
    ? requestedSymbol
    : (selectableSymbols[0]?.symbol ?? '')
  const activeSymbolInfo = symbols.find((item) => item.symbol === activeSymbol)
  const currentQuote = prices[activeSymbol]
  const precision = getSymbolPrecision(
    activeSymbol,
    activeSymbolInfo?.category,
    currentQuote?.price ?? displayBar?.close
  )

  useEffect(() => registerCandleEngine(engine), [engine])

  useEffect(() => {
    if (!activeSymbol || !activeSymbolInfo?.capabilities.candles) return

    void window.api.market.subscribePrice(activeSymbol)
    return (): void => {
      void window.api.market.unsubscribePrice(activeSymbol)
    }
  }, [activeSymbol, activeSymbolInfo?.capabilities.candles])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = init(container, { styles: getChartThemeStyles(theme) })
    if (!chart) return
    chartRef.current = chart

    chart.setDataLoader({
      getBars: async ({ type, timestamp, symbol: chartSymbol, callback }): Promise<void> => {
        if (!chartSymbol.ticker) {
          callback([], false)
          return
        }

        if (type === 'forward') {
          if (!timestamp) {
            callback([], false)
            return
          }
          const result = await engine.fetchOlderBars(timestamp, 300)
          callback(result.bars, result.hasMore)
          return
        }

        if (type === 'backward') {
          callback([], false)
          return
        }

        setIsLoading(true)
        setStatusMessage(null)
        setDisplayBar(null)
        const bars = await engine.setSymbolAndTimeframe(
          chartSymbol.ticker,
          timeframeRef.current,
          500
        )
        setIsLoading(false)
        if (bars.length === 0) {
          setStatusMessage(
            engine.getLastLoadError() ? 'Failed to load candles' : 'Candle data unavailable'
          )
        }
        callback(bars, bars.length > 0)
      },
      subscribeBar: ({ callback }): void => {
        subscriberRef.current = callback
      },
      unsubscribeBar: (): void => {
        subscriberRef.current = null
      }
    })

    const removeEngineListener = engine.addListener({
      onHistoryLoaded: (_generationId, bars): void => {
        setDisplayBar(bars.at(-1) ?? null)
      },
      onBarUpdate: (_generationId, bar): void => {
        setDisplayBar(bar)
        subscriberRef.current?.(bar)
      }
    })

    const resizeObserver = new ResizeObserver((): void => chart.resize())
    resizeObserver.observe(container)

    return (): void => {
      removeEngineListener()
      resizeObserver.disconnect()
      subscriberRef.current = null
      dispose(container)
      chartRef.current = null
    }
  }, [engine])

  useEffect(() => {
    chartRef.current?.setStyles(getChartThemeStyles(theme))
  }, [theme])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !activeSymbol || !activeSymbolInfo?.capabilities.candles) return

    timeframeRef.current = activeTimeframe
    setDisplayBar(null)
    setStatusMessage(null)
    chart.setPeriod(timeframeToPeriod(activeTimeframe))
    chart.setSymbol({
      ticker: activeSymbol,
      pricePrecision: precision.pricePrecision,
      volumePrecision: precision.volumePrecision
    })
  }, [
    activeSymbol,
    activeTimeframe,
    activeSymbolInfo?.capabilities.candles,
    precision.pricePrecision,
    precision.volumePrecision
  ])

  const handleSelectSymbol = (nextSymbol: string): void => {
    if (nextSymbol === activeSymbol) return
    onUpdateConfig?.({ symbol: nextSymbol, timeframe: activeTimeframe })
  }

  const handleSelectTimeframe = (nextTimeframe: Timeframe): void => {
    if (nextTimeframe === activeTimeframe) return
    timeframeRef.current = nextTimeframe
    onUpdateConfig?.({ symbol: activeSymbol, timeframe: nextTimeframe })
  }

  const formatPrice = (value?: number): string => {
    if (value === undefined || !Number.isFinite(value)) return '--'
    return value.toLocaleString(undefined, {
      minimumFractionDigits: precision.pricePrecision,
      maximumFractionDigits: precision.pricePrecision
    })
  }

  const open = displayBar?.open
  const close = displayBar?.close ?? currentQuote?.price
  const change = open !== undefined && close !== undefined ? close - open : 0
  const changePercent = open !== undefined && open > 0 ? (change / open) * 100 : 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        color: THEME_TOKENS.colors.textPrimary,
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          backgroundColor: THEME_TOKENS.colors.bgApp,
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          flexWrap: 'wrap',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {selectableSymbols.map((item) => (
            <button
              key={item.symbol}
              type="button"
              onClick={() => handleSelectSymbol(item.symbol)}
              style={{
                padding: '1px 6px',
                borderRadius: 3,
                fontSize: 10,
                fontWeight: item.symbol === activeSymbol ? 700 : 500,
                border:
                  item.symbol === activeSymbol ? `1px solid ${THEME_TOKENS.colors.accent}` : '1px solid transparent',
                backgroundColor:
                  item.symbol === activeSymbol ? 'rgba(41, 98, 255, 0.2)' : 'transparent',
                color: item.symbol === activeSymbol ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textSecondary,
                cursor: 'pointer'
              }}
            >
              {item.symbol}
            </button>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 3,
            marginLeft: 'auto',
            overflowX: 'auto',
            scrollbarWidth: 'none'
          }}
        >
          {TIMEFRAMES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => handleSelectTimeframe(item)}
              style={{
                padding: '1px 5px',
                borderRadius: 2,
                fontSize: 9,
                fontWeight: item === activeTimeframe ? 700 : 500,
                backgroundColor: item === activeTimeframe ? THEME_TOKENS.colors.bgActive : 'transparent',
                color: item === activeTimeframe ? THEME_TOKENS.colors.textBright : THEME_TOKENS.colors.textSecondary,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 10px',
          minHeight: 27,
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          fontSize: 10,
          flexWrap: 'wrap',
          flexShrink: 0
        }}
      >
        <strong style={{ color: THEME_TOKENS.colors.textBright, fontSize: 13 }}>{formatPrice(close)}</strong>
        <span style={{ color: change >= 0 ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish, fontWeight: 700 }}>
          {change >= 0 ? '+' : ''}
          {changePercent.toFixed(2)}%
        </span>
        <span>
          O <strong>{formatPrice(open)}</strong>
        </span>
        <span>
          H <strong>{formatPrice(displayBar?.high)}</strong>
        </span>
        <span>
          L <strong>{formatPrice(displayBar?.low)}</strong>
        </span>
        <span>
          C <strong>{formatPrice(close)}</strong>
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {(isLoading || statusMessage || symbols.length === 0) && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none',
              color: statusMessage ? THEME_TOKENS.colors.bearish : THEME_TOKENS.colors.textSecondary,
              fontSize: 11,
              backgroundColor: statusMessage ? THEME_TOKENS.colors.modalBackdrop : 'transparent'
            }}
          >
            {symbols.length === 0
              ? 'Loading symbol catalog...'
              : isLoading
                ? 'Loading candles...'
                : statusMessage}
          </div>
        )}
      </div>
    </div>
  )
}
