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
import { ChartLegend } from './ChartLegend'
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

export const ChartContainer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const liveSubscriberRef = useRef<((bar: KLineData) => void) | null>(null)
  const wasReplayActiveRef = useRef(false)
  const [hasHistoricalBars, setHasHistoricalBars] = React.useState(true)

  const isClearingForSymbolSwitchRef = useRef(false)
  const selectedOverlayIdRef = useRef<string | null>(null)

  const theme = useWorkspaceStore((state) => state.theme)
  const symbol = useMarketStore((state) => state.symbol)
  const timeframe = useMarketStore((state) => state.timeframe)
  const setSelectedBar = useMarketStore((state) => state.setSelectedBar)
  const setLatestBar = useMarketStore((state) => state.setLatestBar)
  const setIsLoadingCandles = useMarketStore((state) => state.setIsLoadingCandles)
  const {
    chartType,
    activeTool,
    magnetMode,
    activeIndicators,
    drawingsClearSignal,
    snapshotSignal,
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
          chart.createOverlay({
            id: d.id,
            name: d.type,
            points: d.points.map((pt) => ({
              timestamp: pt.timestamp,
              value: pt.value
            })),
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
            },
            onDeselected: (event): void => {
              if (selectedOverlayIdRef.current === event.overlay.id) {
                selectedOverlayIdRef.current = null
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

  // Initialize KLineChart instance
  useEffect(() => {
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
        if (type === 'init') setHasHistoricalBars(false)

        // The initial chart is intentionally symbol-less until PIA returns its catalog.
        // Do not cross the IPC boundary with an empty symbol.
        if (type === 'init' && !sym.ticker) {
          callback([], false)
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
          return
        }

        const period = (params as { period?: Period }).period
        const tf = period ? periodToTimeframe(period) : useMarketStore.getState().timeframe
        const bars = await candleEngine.setSymbolAndTimeframe(sym.ticker, tf, 500)
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
        callback(bars, true)
        await restoreDrawingsForSymbol(sym.ticker)
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
        setLatestBar(bars.at(-1) ?? null)
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
      dispose(container)
      chartRef.current = null
      liveSubscriberRef.current = null
      renderedIndicators.clear()
    }
  }, [restoreDrawingsForSymbol, setIsLoadingCandles, setLatestBar, setSelectedBar])

  // Synchronize symbol changes with dynamic precision
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const activeSymbol = symbol ?? ''
    const symInfo = useMarketStore.getState().symbols.find((s) => s.symbol === activeSymbol)
    const currentPrice = symbol ? useMarketStore.getState().prices[symbol]?.price : undefined
    const { pricePrecision, volumePrecision } = getSymbolPrecision(
      activeSymbol,
      symInfo?.category,
      currentPrice
    )

    const currentSym = chart.getSymbol()
    if (
      !currentSym ||
      currentSym.ticker !== activeSymbol ||
      currentSym.pricePrecision !== pricePrecision ||
      currentSym.volumePrecision !== volumePrecision
    ) {
      chart.setSymbol({
        ticker: activeSymbol,
        pricePrecision,
        volumePrecision
      })
    }
  }, [symbol])

  // Synchronize timeframe changes (period only, avoids resetting symbol data store)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setPeriod(timeframeToPeriod(timeframe))
  }, [timeframe])

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
      onDrawEnd: (event): void => {
        setActiveTool('cursor')
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
      },
      onDeselected: (event): void => {
        if (selectedOverlayIdRef.current === event.overlay.id) {
          selectedOverlayIdRef.current = null
        }
      }
    })
  }, [activeTool, magnetMode, setActiveTool, handleOverlaySave, handleOverlayRemoved])

  // Handle clearing all drawings signal
  useEffect(() => {
    if (drawingsClearSignal > 0 && chartRef.current) {
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
    }
  }, [drawingsClearSignal])

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

  // Handle Chart Image Snapshot (Save to PNG and Copy to Clipboard)
  useEffect(() => {
    if (snapshotSignal === 0 || snapshotSignal <= lastHandledSnapshotSignalRef.current) return
    lastHandledSnapshotSignalRef.current = snapshotSignal

    const chart = chartRef.current
    if (!chart) return

    try {
      const bgColor = theme === 'dark' ? '#131722' : '#ffffff'
      const dataUrl = chart.getConvertPictureUrl(true, 'png', bgColor)
      if (dataUrl) {
        useWorkspaceStore.getState().openSnapshotModal(dataUrl)
      }
    } catch (err) {
      console.error('Failed to take chart snapshot:', err)
    }
  }, [snapshotSignal, theme])

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
      {!hasHistoricalBars && !useMarketStore.getState().isLoadingCandles && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: THEME_TOKENS.colors.textSecondary,
            pointerEvents: 'none',
            zIndex: 2
          }}
        >
          No historical candle data for {symbol || 'the selected symbol'} ({timeframe})
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
