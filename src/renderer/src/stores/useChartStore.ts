/**
 * PIA Terminal - Chart Store (Zustand)
 * Manages chart view styles, active overlays/drawing tools, active indicators,
 * and bar-by-bar replay mode state.
 */

import { create } from 'zustand'
import { candleEngine } from '../services/candle-engine'

export type ChartType = 'candle_solid' | 'candle_stroke' | 'line' | 'area'

export type DrawingToolType =
  | 'cursor'
  | 'segment'
  | 'rayLine'
  | 'horizontalStraightLine'
  | 'parallelStraightLine'
  | 'fibonacciLine'
  | 'brush'
  | 'simpleAnnotation'

export interface ActiveIndicator {
  name: string
  shortName: string
  paneId: string
  visible: boolean
}

interface ChartState {
  chartType: ChartType
  activeTool: DrawingToolType
  magnetMode: boolean
  activeIndicators: ActiveIndicator[]
  drawingsClearSignal: number

  // Replay mode state
  isReplaying: boolean
  isReplayPlaying: boolean
  replaySpeedMs: number
  replayCurrentIndex: number
  replayTotalBars: number

  // Actions
  setChartType: (type: ChartType) => void
  setActiveTool: (tool: DrawingToolType) => void
  toggleMagnetMode: () => void
  toggleIndicator: (name: string, defaultPane?: string) => void
  clearAllDrawings: () => void
  setReplaying: (active: boolean) => void
  toggleReplayPlay: () => void
  setReplaySpeed: (speedMs: number) => void
  stepReplayForward: () => void
  jumpReplayTo: (index: number) => void
}

export const useChartStore = create<ChartState>((set, get) => ({
  chartType: 'candle_solid',
  activeTool: 'cursor',
  magnetMode: false,
  activeIndicators: [
    { name: 'EMA', shortName: 'EMA', paneId: 'candle_pane', visible: true },
    { name: 'VOL', shortName: 'VOL', paneId: 'volume_pane', visible: true }
  ],
  drawingsClearSignal: 0,

  isReplaying: false,
  isReplayPlaying: false,
  replaySpeedMs: 1000,
  replayCurrentIndex: 0,
  replayTotalBars: 0,

  setChartType: (type: ChartType) => set({ chartType: type }),
  setActiveTool: (tool: DrawingToolType) => set({ activeTool: tool }),
  toggleMagnetMode: () => set((state) => ({ magnetMode: !state.magnetMode })),

  toggleIndicator: (name: string, defaultPane = 'candle_pane') => {
    const list = get().activeIndicators
    const exists = list.find((item) => item.name === name)

    if (exists) {
      // Toggle off or remove
      set({
        activeIndicators: list.filter((item) => item.name !== name)
      })
    } else {
      // Add indicator
      const isSubPane = ['VOL', 'MACD', 'RSI'].includes(name)
      const paneId = isSubPane ? `${name.toLowerCase()}_pane` : defaultPane
      set({
        activeIndicators: [...list, { name, shortName: name, paneId, visible: true }]
      })
    }
  },

  clearAllDrawings: () => set((state) => ({ drawingsClearSignal: state.drawingsClearSignal + 1 })),

  setReplaying: (active: boolean) => {
    if (active) {
      const { currentIndex, totalBars } = candleEngine.startReplay()
      set({
        isReplaying: true,
        isReplayPlaying: false,
        replayCurrentIndex: currentIndex,
        replayTotalBars: totalBars
      })
    } else {
      candleEngine.stopReplay()
      set({
        isReplaying: false,
        isReplayPlaying: false,
        replayCurrentIndex: 0,
        replayTotalBars: 0
      })
    }
  },

  toggleReplayPlay: () => {
    set((state) => ({ isReplayPlaying: !state.isReplayPlaying }))
  },

  setReplaySpeed: (speedMs: number) => set({ replaySpeedMs: speedMs }),

  stepReplayForward: () => {
    const res = candleEngine.stepReplayForward()
    set({
      replayCurrentIndex: res.currentIndex,
      replayTotalBars: res.totalBars,
      isReplayPlaying: res.currentIndex >= res.totalBars ? false : get().isReplayPlaying
    })
  },

  jumpReplayTo: (index: number) => {
    const res = candleEngine.jumpReplayTo(index)
    set({
      replayCurrentIndex: res.currentIndex,
      replayTotalBars: res.totalBars
    })
  }
}))
