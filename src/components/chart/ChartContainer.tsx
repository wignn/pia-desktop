import React, { useEffect, useRef, useCallback } from 'react'
import {
  init,
  dispose,
  type Chart,
  type KLineData,
  type CandleType,
  type Point,
  type Overlay,
  type Period
} from 'klinecharts'
import { timeframeToPeriod, periodToTimeframe } from '../../utils/timeframe'
import { candleEngine } from '../../services/candle-engine'
import { useMarketStore } from '../../stores/useMarketStore'
import { useChartStore, isOverlayIndicator } from '../../stores/useChartStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { THEME_TOKENS, getChartThemeStyles } from '../../theme/tokens'
import { Loader2, RefreshCw } from 'lucide-react'
import { SymbolLogo } from '../common/SymbolLogo'
import { ChartLegend } from './ChartLegend'
import { DrawingPropertyBar } from './DrawingPropertyBar'
import { ReplayControlBar } from './ReplayControlBar'
import { registerCustomOverlays } from './register-overlays'
import { registerPiaScriptIndicator } from './register-piascript-indicator'
import { usePiaScriptStore } from '../../stores/usePiaScriptStore'
import { syncPositionOverlays, clearPositionOverlays } from './position-overlay-sync'
import { usePaperTradingStore } from '../../stores/usePaperTradingStore'
import { getSymbolPrecision } from '@shared/market-utils'
import type { DomainPoint, DrawingItem } from '@shared/types'
function extractDomainPoints(points: Array<Partial<Point>>, dataList: KLineData[]): DomainPoint[] {
  return points
    .filter((p): p is Partial<Point> => p !== undefined && p !== null)
    .map((p) => {
      let ts = p.timestamp
      if ((ts === undefined || ts === null) && p.dataIndex !== undefined) {
        const idx = Math.round(p.dataIndex)
        if (dataList[idx]) {
          ts = dataList[idx].timestamp
        } else if (dataList.length > 1) {
          const last = dataList[dataList.length - 1]
          const prev = dataList[dataList.length - 2]
          const interval = Math.max(1000, last.timestamp - prev.timestamp)
          const delta = idx - (dataList.length - 1)
          ts = last.timestamp + delta * interval
        }
      }
      return {
        timestamp: ts ?? Date.now(),
        value: typeof p.value === 'number' && !isNaN(p.value) ? p.value : 0
      }
    })
}

function isSamePeriod(a?: Period | null, b?: Period | null): boolean {
  if (!a || !b) return false
  return a.type === b.type && a.span === b.span
}

export const ChartContainer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const liveSubscriberRef = useRef<((bar: KLineData) => void) | null>(null)
  const wasReplayActiveRef = useRef(false)
  const [hasHistoricalBars, setHasHistoricalBars] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const isClearingForSymbolSwitchRef = useRef(false)
  const selectedOverlayIdRef = useRef<string | null>(null)
  const [selectedOverlayId, setSelectedOverlayId] = React.useState<string | null>(null)

  const theme = useWorkspaceStore((state) => state.theme)
  const symbol = useMarketStore((state) => state.symbol)
  const timeframe = useMarketStore((state) => state.timeframe)
  const prices = useMarketStore((state) => state.prices)
  const positions = usePaperTradingStore((state) => state.account.positions)
  const orders = usePaperTradingStore((state) => state.account.orders)
  const accountType = usePaperTradingStore((state) => state.accountType)
  const closePosition = usePaperTradingStore((state) => state.closePosition)
  const updatePosition = usePaperTradingStore((state) => state.updatePosition)
  const cancelOrder = usePaperTradingStore((state) => state.cancelOrder)
  const updateOrder = usePaperTradingStore((state) => state.updateOrder)
  const customEntryDraft = usePaperTradingStore((state) => state.customEntryDraft)
  const setCustomEntryDraft = usePaperTradingStore((state) => state.setCustomEntryDraft)
  const setSelectedBar = useMarketStore((state) => state.setSelectedBar)
  const setLatestBar = useMarketStore((state) => state.setLatestBar)
  const isLoadingCandles = useMarketStore((state) => state.isLoadingCandles)
  const setIsLoadingCandles = useMarketStore((state) => state.setIsLoadingCandles)
  const positionOverlayIdsRef = useRef<Set<string>>(new Set())
  const piascriptOverlayIdsRef = useRef<Set<string>>(new Set())
  const isPiaScriptApplied = usePiaScriptStore((s) => s.isAppliedToChart)
  const piaScriptResult = usePiaScriptStore((s) => s.result)
  const isPositionOverlayDraggingRef = useRef(false)
  const {
    chartType,
    activeTool,
    magnetMode,
    isDrawingsLocked,
    isDrawingsHidden,
    activeIndicators,
    drawingsClearSignal,
    snapshotSignal,
    isReplaying,
    setActiveTool
  } = useChartStore()

  const renderedIndicatorsRef = useRef<Set<string>>(new Set())
  const lastHandledSnapshotSignalRef = useRef<number>(snapshotSignal)

  const handleOverlaySave = useCallback(async (overlay: Overlay): Promise<void> => {
    if (!overlay || !overlay.id) return
    const currentSymbol = useMarketStore.getState().symbol
    const currentTimeframe = useMarketStore.getState().timeframe
    const bars = candleEngine.getActiveBars()
    const domainPoints = extractDomainPoints(overlay.points, bars)
    if (domainPoints.length === 0 || !currentSymbol) return

    const drawingItem: DrawingItem = {
      id: overlay.id,
      type: overlay.name,
      symbol: currentSymbol,
      timeframe: currentTimeframe,
      points: domainPoints,
      style: {
        color: THEME_TOKENS.colors.accent
      },
      lock: overlay.lock,
      visible: overlay.visible,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    try {
      await window.api.drawings.save(drawingItem)
    } catch (err) {
      console.error('[ChartContainer] Failed to save drawing:', err)
    }
  }, [])

  const handleOverlayRemoved = useCallback(async (overlay: Overlay): Promise<void> => {
    if (isClearingForSymbolSwitchRef.current) {
      return
    }
    if (!overlay || !overlay.id) return
    try {
      await window.api.drawings.delete(overlay.id)
    } catch (err) {
      console.error('[ChartContainer] Failed to delete drawing:', err)
    }
  }, [])

  const restoreDrawingsForSymbol = useCallback(
    async (targetSymbol: string): Promise<void> => {
      const chart = chartRef.current
      if (!chart) return

      isClearingForSymbolSwitchRef.current = true
      try {
        clearPositionOverlays(chart, positionOverlayIdsRef)
        chart.removeOverlay()
      } finally {
        isClearingForSymbolSwitchRef.current = false
      }

      try {
        if (!targetSymbol) return
        const drawings = await window.api.drawings.get({ symbol: targetSymbol })
        const currentSymbol = useMarketStore.getState().symbol
        if (currentSymbol !== targetSymbol) return

        for (const d of drawings) {
          const lineStyle = d.style?.lineStyle === 'dashed' ? 'dashed' : 'solid'
          const overlayStyles = d.style
            ? ({
                line: {
                  color: d.style.color || '#D4AF37',
                  size: d.style.lineWidth || 1.5,
                  style: lineStyle
                },
                polygon: {
                  borderColor: d.style.color || '#D4AF37',
                  borderSize: d.style.lineWidth || 1,
                  borderStyle: lineStyle,
                  color: d.style.fillColor || 'rgba(212, 175, 55, 0.15)'
                },
                text: {
                  color: d.style.fontColor || '#F4F6FC',
                  size: d.style.fontSize || 12,
                  text: d.style.text
                }
              } as any)
            : undefined

          chart.createOverlay({
            id: d.id,
            name: d.type,
            points: d.points.map((pt) => ({
              timestamp: pt.timestamp,
              value: pt.value
            })),
            styles: overlayStyles,
            lock: d.lock,
            visible: d.visible !== false,
            onPressedMoveEnd: (event): void => {
              handleOverlaySave(event.overlay)
            },
            onRemoved: (event): void => {
              handleOverlayRemoved(event.overlay)
            },
            onSelected: (event): void => {
              selectedOverlayIdRef.current = event.overlay.id
              setSelectedOverlayId(event.overlay.id)
            },
            onDeselected: (event): void => {
              if (selectedOverlayIdRef.current === event.overlay.id) {
                selectedOverlayIdRef.current = null
                setSelectedOverlayId(null)
              }
            }
          })
        }
      } catch (err) {
        console.error(`[ChartContainer] Failed to restore drawings for ${targetSymbol}:`, err)
      }
    },
    [handleOverlaySave, handleOverlayRemoved]
  )

  // Keyboard shortcut listener for deleting selected overlays
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      if (isInput) return

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedOverlayIdRef.current) {
        const overlayId = selectedOverlayIdRef.current
        selectedOverlayIdRef.current = null
        setSelectedOverlayId(null)
        if (chartRef.current) {
          chartRef.current.removeOverlay({ id: overlayId })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Watchdog timer: automatically clear candle loading overlay if stuck for more than 10 seconds
  // ponytail: 10s watchdog guarantees chart loading overlay never gets stuck permanently on network stalls or race conditions
  useEffect(() => {
    if (!isLoadingCandles) return
    const timer = setTimeout(() => {
      console.warn('[ChartContainer] Candle loading watchdog triggered after 10s timeout, forcing isLoadingCandles=false')
      setIsLoadingCandles(false)
    }, 10_000)
    return () => clearTimeout(timer)
  }, [isLoadingCandles, setIsLoadingCandles])

  const handleRetryCandles = useCallback(async () => {
    const chart = chartRef.current
    const sym = useMarketStore.getState().symbol
    const tf = useMarketStore.getState().timeframe
    if (!chart || !sym) return

    setIsLoadingCandles(true)
    setLoadError(null)
    setHasHistoricalBars(true)

    try {
      const bars = await candleEngine.setSymbolAndTimeframe(sym, tf, 300)
      if (bars.length > 0) {
        setHasHistoricalBars(true)
        setLoadError(null)
        const currentSym = chart.getSymbol()
        if (currentSym) {
          chart.setSymbol({ ...currentSym })
        }
      } else {
        const err = candleEngine.getLastLoadError()
        setHasHistoricalBars(false)
        setLoadError(err ? String(err) : null)
      }
    } catch (err: any) {
      setHasHistoricalBars(false)
      setLoadError(err?.message || 'Failed to load candle feed')
    } finally {
      setIsLoadingCandles(false)
    }
  }, [setIsLoadingCandles])

  // Listen for programmatic drawing updates (e.g. from AI MCP engine)
  useEffect(() => {
    const handleReloadDrawings = (e: Event): void => {
      const customEvent = e as CustomEvent<{ symbol?: string }>
      const sym = customEvent?.detail?.symbol || useMarketStore.getState().symbol
      if (sym && chartRef.current) {
        restoreDrawingsForSymbol(sym).catch((err) => {
          console.error('[ChartContainer] Failed to reload drawings on event:', err)
        })
      }
    }

    window.addEventListener('pia:reload-drawings', handleReloadDrawings)
    return (): void => {
      window.removeEventListener('pia:reload-drawings', handleReloadDrawings)
    }
  }, [restoreDrawingsForSymbol])

  // Initialize KLineChart instance
  useEffect(() => {
    registerCustomOverlays()
    registerPiaScriptIndicator()
    const container = containerRef.current
    if (!container) return

    const chart = init(container, {
      styles: getChartThemeStyles(useWorkspaceStore.getState().theme)
    })

    if (!chart) return
    chartRef.current = chart

    // Configure DataLoader lifecycle
    chart.setDataLoader({
      getBars: async (params): Promise<void> => {
        const { type, timestamp, symbol: sym, callback } = params
        const currentActiveSymbol = useMarketStore.getState().symbol
        const currentActiveTf = useMarketStore.getState().timeframe
        const period = (params as { period?: Period }).period
        const tf = period ? periodToTimeframe(period) : currentActiveTf

        // Guard against initial empty symbol or superseded/mismatched requests
        if (type === 'init' && (!sym.ticker || sym.ticker !== currentActiveSymbol || tf !== currentActiveTf)) {
          callback([], false)
          if (!sym.ticker) {
            setIsLoadingCandles(false)
          }
          return
        }

        // Forward pagination: user panned left to older historical candles
        if (type === 'forward') {
          if (!timestamp || candleEngine.getReplayState().isReplayMode) {
            callback([], false)
            return
          }
          const { bars: olderBars, hasMore } = await candleEngine.fetchOlderBars(timestamp, 300)
          callback(olderBars, hasMore)
          return
        }

        if (type === 'backward') {
          callback([], false)
          return
        }

        // Initial load (type === 'init')
        if (candleEngine.getReplayState().isReplayMode) {
          callback(candleEngine.getActiveBars(), false)
          setIsLoadingCandles(false)
          return
        }

        setIsLoadingCandles(true)

        try {
          const bars = await candleEngine.setSymbolAndTimeframe(sym.ticker, tf, 300)

          // Verify request was not superseded while in flight
          const latestSymbol = useMarketStore.getState().symbol
          const latestTf = useMarketStore.getState().timeframe
          if (sym.ticker !== latestSymbol || tf !== latestTf) {
            callback([], false)
            return
          }

          const lastError = candleEngine.getLastLoadError()
          setLoadError(bars.length === 0 && lastError ? String(lastError) : null)
          setHasHistoricalBars(bars.length > 0)
          if (bars.length > 0 && useMarketStore.getState().connectionState.status === 'connecting') {
            useMarketStore.setState({
              connectionState: {
                status: 'connected',
                latencyMs: 35,
                lastHeartbeat: Date.now()
              }
            })
          }
          callback(bars, true)
          await restoreDrawingsForSymbol(sym.ticker)
        } catch (err: unknown) {
          console.error('[ChartContainer] Failed to load initial bars:', err)
          callback([], false)
        } finally {
          const latestSymbol = useMarketStore.getState().symbol
          const latestTf = useMarketStore.getState().timeframe
          if (sym.ticker === latestSymbol && tf === latestTf) {
            setIsLoadingCandles(false)
          }
        }
      },
      subscribeBar: ({ callback }): void => {
        liveSubscriberRef.current = callback
      },
      unsubscribeBar: (): void => {
        liveSubscriberRef.current = null
      }
    })

    // Listen to CandleEngine updates for live tick forwarding & replay bar simulation
    const unsubEngine = candleEngine.addListener({
      onHistoryLoaded: (_genId, bars): void => {
        const curSym = useMarketStore.getState().symbol
        const curTf = useMarketStore.getState().timeframe
        if (candleEngine.getSymbol() && curSym && candleEngine.getSymbol() !== curSym) {
          return
        }
        if (candleEngine.getTimeframe() && curTf && candleEngine.getTimeframe() !== curTf) {
          return
        }
        setLatestBar(bars.at(-1) ?? null)
        const lastErr = candleEngine.getLastLoadError()
        setLoadError(bars.length === 0 && lastErr ? String(lastErr) : null)
        setHasHistoricalBars(bars.length > 0)
        setIsLoadingCandles(false)
        if (bars.length > 0 && useMarketStore.getState().connectionState.status === 'connecting') {
          useMarketStore.setState({
            connectionState: {
              status: 'connected',
              latencyMs: 35,
              lastHeartbeat: Date.now()
            }
          })
        }
        const isReplaying = candleEngine.getReplayState().isReplayMode
        // Only reset chart data when replay mode starts, jumps, or stops.
        // NEVER call resetData() during normal left panning or pagination!
        if (isReplaying || wasReplayActiveRef.current) {
          wasReplayActiveRef.current = isReplaying
          if (chartRef.current) {
            chartRef.current.resetData()
          }
        }
      },
      onBarUpdate: (_genId, bar): void => {
        setLatestBar(bar)
        if (liveSubscriberRef.current) {
          liveSubscriberRef.current(bar)
        }
      }
    })

    // Crosshair listener for Legend / Status Bar
    chart.subscribeAction('onCrosshairChange', (data): void => {
      setSelectedBar((data as { kLineData?: KLineData })?.kLineData ?? null)
    })

    // Initial symbol and timeframe from current store state
    const currentMarketState = useMarketStore.getState()
    const activeSymbol = currentMarketState.symbol ?? ''
    const symInfo = currentMarketState.symbols.find((s) => s.symbol === activeSymbol)
    const currentPrice = currentMarketState.symbol
      ? currentMarketState.prices[currentMarketState.symbol]?.price
      : undefined
    const { pricePrecision, volumePrecision } = getSymbolPrecision(
      activeSymbol,
      symInfo?.category,
      currentPrice
    )

    chart.setPeriod(timeframeToPeriod(currentMarketState.timeframe))
    chart.setSymbol({
      ticker: activeSymbol,
      pricePrecision,
      volumePrecision
    })

    // Create initial indicators from saved preferences
    const savedIndicators = useChartStore.getState().activeIndicators
    const renderedIndicators = renderedIndicatorsRef.current
    renderedIndicators.clear()
    for (const ind of savedIndicators) {
      const isStack = isOverlayIndicator(ind.name)
      chart.createIndicator(
        {
          name: ind.name,
          paneId: ind.paneId
        },
        isStack
      )
      renderedIndicators.add(ind.name)
    }

    // Resize observer for responsive canvas adjustments
    const resizeObserver = new ResizeObserver((): void => {
      chart.resize()
    })
    resizeObserver.observe(container)

    return (): void => {
      unsubEngine()
      resizeObserver.disconnect()
      clearPositionOverlays(chartRef.current, positionOverlayIdsRef)
      if (chartRef.current) {
        piascriptOverlayIdsRef.current.forEach((id) => {
          chartRef.current?.removeOverlay({ id })
        })
      }
      piascriptOverlayIdsRef.current.clear()
      dispose(container)
      chartRef.current = null
      liveSubscriberRef.current = null
      renderedIndicators.clear()
    }
  }, [restoreDrawingsForSymbol, setIsLoadingCandles, setLatestBar, setSelectedBar])

  // Synchronize symbol and timeframe changes atomically
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    setHasHistoricalBars(true)

    const targetPeriod = timeframeToPeriod(timeframe)
    const currentPeriod = chart.getPeriod()
    const periodChanged = !isSamePeriod(currentPeriod, targetPeriod)
    if (periodChanged) {
      chart.setPeriod(targetPeriod)
    }

    const activeSymbol = symbol ?? ''
    const symInfo = useMarketStore.getState().symbols.find((s) => s.symbol === activeSymbol)
    const currentPrice = symbol ? useMarketStore.getState().prices[symbol]?.price : undefined
    const { pricePrecision, volumePrecision } = getSymbolPrecision(
      activeSymbol,
      symInfo?.category,
      currentPrice
    )

    const currentSym = chart.getSymbol()
    const symbolChanged =
      !currentSym ||
      currentSym.ticker !== activeSymbol ||
      currentSym.pricePrecision !== pricePrecision ||
      currentSym.volumePrecision !== volumePrecision

    if (symbolChanged) {
      chart.setSymbol({
        ticker: activeSymbol,
        pricePrecision,
        volumePrecision
      })
    }

    // ponytail: if neither period nor symbol changed on chart instance, clear loading overlay immediately since klinecharts will not invoke getBars
    if (!periodChanged && !symbolChanged && useMarketStore.getState().isLoadingCandles) {
      setIsLoadingCandles(false)
    }
  }, [symbol, timeframe, setIsLoadingCandles])

  // Synchronize dynamic dark/light theme styles
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setStyles(getChartThemeStyles(theme))
  }, [theme])

  // Synchronize chart type (candle_solid, candle_stroke, line/area)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    let candleType: CandleType = 'candle_solid'
    if (chartType === 'candle_stroke') candleType = 'candle_stroke'
    else if (chartType === 'line' || chartType === 'area') candleType = 'area'

    chart.setStyles({
      candle: {
        type: candleType
      }
    })
  }, [chartType])

  // Synchronize drawing tool overlays
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || activeTool === 'cursor') return

    chart.createOverlay({
      name: activeTool,
      mode: magnetMode ? 'weak_magnet' : 'normal',
      lock: isDrawingsLocked,
      visible: !isDrawingsHidden,
      onDrawEnd: (event): void => {
        if (!useChartStore.getState().stayInDrawingMode) {
          setActiveTool('cursor')
        }
        if (event.overlay) {
          handleOverlaySave(event.overlay)
        }
      },
      onPressedMoveEnd: (event): void => {
        handleOverlaySave(event.overlay)
      },
      onRemoved: (event): void => {
        handleOverlayRemoved(event.overlay)
      },
      onSelected: (event): void => {
        selectedOverlayIdRef.current = event.overlay.id
        setSelectedOverlayId(event.overlay.id)
      },
      onDeselected: (event): void => {
        if (selectedOverlayIdRef.current === event.overlay.id) {
          selectedOverlayIdRef.current = null
          setSelectedOverlayId(null)
        }
      }
    })
  }, [
    activeTool,
    magnetMode,
    isDrawingsLocked,
    isDrawingsHidden,
    setActiveTool,
    handleOverlaySave,
    handleOverlayRemoved
  ])

  // Synchronize drawing lock status
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.overrideOverlay({ lock: isDrawingsLocked })
    }
  }, [isDrawingsLocked])

  // Synchronize drawing visibility
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.overrideOverlay({ visible: !isDrawingsHidden })
    }
  }, [isDrawingsHidden])

  const handleClosePositionFromOverlay = useCallback(
    (positionId: string): void => {
      const currentSym = useMarketStore.getState().symbol
      const markPrice = currentSym ? useMarketStore.getState().prices[currentSym]?.price ?? 0 : 0
      void closePosition(positionId, markPrice).finally(() => {
        requestAnimationFrame(() => {
          isPositionOverlayDraggingRef.current = false
        })
      })
    },
    [closePosition]
  )

  const handleUpdatePositionFromOverlay = useCallback(
    (
      positionId: string,
      updates: { entryPrice?: number; takeProfit?: number; stopLoss?: number }
    ): void => {
      void updatePosition(positionId, updates).finally(() => {
        requestAnimationFrame(() => {
          isPositionOverlayDraggingRef.current = false
        })
      })
    },
    [updatePosition]
  )

  const handleUpdateCustomEntryPrice = useCallback(
    (newPrice: number): void => {
      const currentDraft = usePaperTradingStore.getState().customEntryDraft
      if (currentDraft && currentDraft.active) {
        setCustomEntryDraft({ ...currentDraft, price: newPrice })
      }
      requestAnimationFrame(() => {
        isPositionOverlayDraggingRef.current = false
      })
    },
    [setCustomEntryDraft]
  )

  const handleCancelOrderFromOverlay = useCallback(
    (orderId: string): void => {
      void cancelOrder(orderId).finally(() => {
        requestAnimationFrame(() => {
          isPositionOverlayDraggingRef.current = false
        })
      })
    },
    [cancelOrder]
  )

  const handleUpdateOrderFromOverlay = useCallback(
    (orderId: string, updates: { price: number }): void => {
      void updateOrder(orderId, updates).finally(() => {
        requestAnimationFrame(() => {
          isPositionOverlayDraggingRef.current = false
        })
      })
    },
    [updateOrder]
  )

  // Handle clearing all drawings signal
  useEffect(() => {
    if (drawingsClearSignal > 0 && chartRef.current) {
      selectedOverlayIdRef.current = null
      setSelectedOverlayId(null)
      const currentSymbol = useMarketStore.getState().symbol
      isClearingForSymbolSwitchRef.current = true
      try {
        chartRef.current.removeOverlay()
      } finally {
        isClearingForSymbolSwitchRef.current = false
      }
      window.api.drawings.clear({ symbol: currentSymbol ?? undefined }).catch((err) => {
        console.error('[ChartContainer] Failed to clear drawings:', err)
      })
      if (currentSymbol) {
        positionOverlayIdsRef.current.clear()
        syncPositionOverlays(
          {
            chart: chartRef.current,
            positions,
            orders,
            currentSymbol,
            prices,
            accountType,
            customEntryDraft,
            onClosePosition: handleClosePositionFromOverlay,
            onUpdatePosition: handleUpdatePositionFromOverlay,
            onCancelOrder: handleCancelOrderFromOverlay,
            onUpdateOrder: handleUpdateOrderFromOverlay,
            onUpdateCustomEntryPrice: handleUpdateCustomEntryPrice,
            isOverlayDragging: (active) => {
              if (active !== undefined) isPositionOverlayDraggingRef.current = active
              return isPositionOverlayDraggingRef.current
            }
          },
          positionOverlayIdsRef
        )
      }
    }
  }, [
    drawingsClearSignal,
    positions,
    orders,
    prices,
    accountType,
    customEntryDraft,
    handleClosePositionFromOverlay,
    handleUpdatePositionFromOverlay,
    handleCancelOrderFromOverlay,
    handleUpdateOrderFromOverlay,
    handleUpdateCustomEntryPrice
  ])

  // Synchronize live paper trading position overlays (Entry, TP, SL, Custom Draft)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !symbol) return

    syncPositionOverlays(
      {
        chart,
        positions,
        orders,
        currentSymbol: symbol,
        prices,
        accountType,
        customEntryDraft,
        onClosePosition: handleClosePositionFromOverlay,
        onUpdatePosition: handleUpdatePositionFromOverlay,
        onCancelOrder: handleCancelOrderFromOverlay,
        onUpdateOrder: handleUpdateOrderFromOverlay,
            onUpdateCustomEntryPrice: handleUpdateCustomEntryPrice,
            isOverlayDragging: (active) => {
              if (active !== undefined) isPositionOverlayDraggingRef.current = active
              return isPositionOverlayDraggingRef.current
            }
      },
      positionOverlayIdsRef
    )
  }, [
    positions,
    orders,
    prices,
    symbol,
    accountType,
    customEntryDraft,
    handleClosePositionFromOverlay,
    handleUpdatePositionFromOverlay,
    handleCancelOrderFromOverlay,
    handleUpdateOrderFromOverlay,
    handleUpdateCustomEntryPrice
  ])

  // Clear position overlays on symbol switch or unmount
  useEffect(() => {
    return (): void => {
      clearPositionOverlays(chartRef.current, positionOverlayIdsRef)
    }
  }, [symbol])

  // Synchronize active indicators
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const currentActiveNames = new Set(activeIndicators.map((i) => i.name))

    // Remove indicators that are no longer active
    for (const name of renderedIndicatorsRef.current) {
      if (!currentActiveNames.has(name)) {
        chart.removeIndicator({ name })
        renderedIndicatorsRef.current.delete(name)
      }
    }

    // Add newly activated indicators
    for (const ind of activeIndicators) {
      if (!renderedIndicatorsRef.current.has(ind.name)) {
        const isStack = isOverlayIndicator(ind.name)
        chart.createIndicator(
          {
            name: ind.name,
            paneId: ind.paneId
          },
          isStack
        )
        renderedIndicatorsRef.current.add(ind.name)
      }
    }
  }, [activeIndicators])

  // Synchronize PiaScript custom indicators and strategy signals
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    piascriptOverlayIdsRef.current.forEach((id) => {
      chart.removeOverlay({ id })
    })
    piascriptOverlayIdsRef.current.clear()

    if (isPiaScriptApplied && piaScriptResult?.success) {
      chart.removeIndicator({ name: 'PiaScript' })
      if (piaScriptResult.plots && piaScriptResult.plots.length > 0) {
        chart.createIndicator({ name: 'PiaScript', paneId: 'candle_pane' }, true)
      }
      if (piaScriptResult.signals && piaScriptResult.signals.length > 0) {
        for (const sig of piaScriptResult.signals) {
          const id = chart.createOverlay({
            name: 'simpleAnnotation',
            points: [{ timestamp: sig.timestamp, value: sig.price }],
            extendData: `${sig.action} @ ${sig.price}`,
            lock: true
          })
          if (typeof id === 'string') piascriptOverlayIdsRef.current.add(id)
        }
      }
    } else {
      chart.removeIndicator({ name: 'PiaScript' })
    }
  }, [isPiaScriptApplied, piaScriptResult])

  // Handle Chart Image Snapshot (Save to PNG and Copy to Clipboard)
  useEffect(() => {
    if (snapshotSignal === 0 || snapshotSignal <= lastHandledSnapshotSignalRef.current) return
    lastHandledSnapshotSignalRef.current = snapshotSignal

    const chart = chartRef.current
    if (!chart) return

    try {
      const bgColor = theme === 'dark' ? '#0b0e14' : '#ffffff'
      const dataUrl = chart.getConvertPictureUrl(true, 'png', bgColor)
      if (dataUrl) {
        useWorkspaceStore.getState().openSnapshotModal(dataUrl)
      }
    } catch (err) {
      console.error('Failed to take chart snapshot:', err)
    }
  }, [snapshotSignal, theme])

  const handleUpdateOverlayStyle = useCallback(
    (styles: { color?: string; borderSize?: number; borderStyle?: 'solid' | 'dashed' }): void => {
      chartRef.current?.overrideOverlay({
        id: selectedOverlayId ?? undefined,
        styles: {
          ...styles,
          line: {
            color: styles.color,
            size: styles.borderSize,
            style: styles.borderStyle
          },
          polygon: {
            borderColor: styles.color,
            borderSize: styles.borderSize,
            borderStyle: styles.borderStyle
          },
          circle: {
            borderColor: styles.color,
            borderSize: styles.borderSize,
            borderStyle: styles.borderStyle
          }
        }
      })
    },
    [selectedOverlayId]
  )

  const handleDeleteSelectedOverlay = useCallback((): void => {
    if (selectedOverlayId) {
      chartRef.current?.removeOverlay({ id: selectedOverlayId })
      selectedOverlayIdRef.current = null
      setSelectedOverlayId(null)
    }
  }, [selectedOverlayId])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: THEME_TOKENS.colors.bgApp,
        touchAction: 'none'
      }}
    >
      <ChartLegend />
      <DrawingPropertyBar
        selectedId={selectedOverlayId}
        onUpdateStyle={handleUpdateOverlayStyle}
        onDelete={handleDeleteSelectedOverlay}
      />
      {isReplaying && <ReplayControlBar />}

      {/* Institutional Loading Overlay when switching symbols or timeframes */}
      {isLoadingCandles && (
        <div
          data-testid="chart-loading-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            backgroundColor: 'rgba(11, 14, 20, 0.45)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            zIndex: 15,
            pointerEvents: 'none',
            transition: 'opacity 0.15s ease'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 18px',
              backgroundColor: 'rgba(24, 28, 39, 0.88)',
              borderRadius: 24,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)'
            }}
          >
            {symbol && <SymbolLogo symbol={symbol} size={22} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#ffffff', letterSpacing: '0.02em' }}>
                  {symbol || 'Chart'}
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                  {timeframe}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#38bdf8' }}>
                <Loader2 size={12} className="tv-spin" />
                <span>Loading chart data...</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!hasHistoricalBars && !isLoadingCandles && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            color: THEME_TOKENS.colors.textSecondary,
            zIndex: 2,
            backgroundColor: 'rgba(7, 9, 14, 0.45)'
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#F4F6FC' }}>
            {loadError
              ? `Unable to load candle data for ${symbol || 'selected symbol'} (${timeframe})`
              : `No historical candle data for ${symbol || 'the selected symbol'} (${timeframe})`}
          </div>
          {loadError ? (
            <div style={{ fontSize: 11, color: '#838896', maxWidth: 360, textAlign: 'center', lineHeight: 1.5 }}>
              The server connection timed out or was interrupted. Check your network connection.
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#838896' }}>
              No recorded trades found for this timeframe yet.
            </div>
          )}
          <button
            type="button"
            onClick={handleRetryCandles}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              backgroundColor: 'rgba(212, 175, 55, 0.15)',
              border: '1px solid rgba(212, 175, 55, 0.35)',
              borderRadius: 6,
              color: '#FDE68A',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: 4
            }}
          >
            <RefreshCw size={12} />
            <span>Retry Feed</span>
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          touchAction: 'none'
        }}
      />
    </div>
  )
}
