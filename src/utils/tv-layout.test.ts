import { describe, it, expect } from 'vitest'
import { sanitizeIndicators, OVERLAY_INDICATORS } from '../stores/useChartStore'

describe('TradingView Layout & Chart helpers', () => {
  it('correctly maps overlay indicators to candle_pane', () => {
    const raw = [
      { name: 'EMA', shortName: 'EMA', paneId: 'wrong_pane', visible: true },
      { name: 'RSI', shortName: 'RSI', paneId: 'candle_pane', visible: true }
    ]

    const sanitized = sanitizeIndicators(raw)
    expect(sanitized[0].paneId).toBe('candle_pane')
    expect(sanitized[1].paneId).toBe('rsi_pane')
  })

  it('recognizes standard TradingView overlay indicators', () => {
    expect(OVERLAY_INDICATORS.has('EMA')).toBe(true)
    expect(OVERLAY_INDICATORS.has('SMA')).toBe(true)
    expect(OVERLAY_INDICATORS.has('BOLL')).toBe(true)
    expect(OVERLAY_INDICATORS.has('RSI')).toBe(false)
  })

  it('correctly clamps dock and drawer resizing limits', () => {
    const clamp = (val: number, min: number, max: number): number => Math.min(max, Math.max(min, val))
    
    // Right dock width bounds: [240, 600]
    expect(clamp(150, 240, 600)).toBe(240)
    expect(clamp(400, 240, 600)).toBe(400)
    expect(clamp(800, 240, 600)).toBe(600)

    // Bottom drawer height bounds: [120, 520]
    expect(clamp(50, 120, 520)).toBe(120)
    expect(clamp(300, 120, 520)).toBe(300)
    expect(clamp(700, 120, 520)).toBe(520)
  })

  it('handles keyboard index wrap navigation', () => {
    const listLen = 5
    const nextDown = (cur: number): number => (cur < listLen - 1 ? cur + 1 : 0)
    const nextUp = (cur: number): number => (cur > 0 ? cur - 1 : listLen - 1)

    expect(nextDown(0)).toBe(1)
    expect(nextDown(4)).toBe(0)
    expect(nextUp(0)).toBe(4)
    expect(nextUp(3)).toBe(2)
  })

  it('manages drawing tool selection and toggles properly', () => {
    const { useChartStore } = require('../stores/useChartStore')
    const store = useChartStore.getState()
    
    expect(store.activeTool).toBe('cursor')
    expect(store.stayInDrawingMode).toBe(false)
    expect(store.isDrawingsLocked).toBe(false)
    expect(store.isDrawingsHidden).toBe(false)

    useChartStore.getState().setActiveTool('rect')
    expect(useChartStore.getState().activeTool).toBe('rect')

    useChartStore.getState().toggleStayInDrawingMode()
    expect(useChartStore.getState().stayInDrawingMode).toBe(true)

    useChartStore.getState().toggleLockDrawings()
    expect(useChartStore.getState().isDrawingsLocked).toBe(true)

    useChartStore.getState().toggleHideDrawings()
    expect(useChartStore.getState().isDrawingsHidden).toBe(true)

    useChartStore.getState().clearAllDrawings()
    expect(useChartStore.getState().drawingsClearSignal).toBe(1)
  })
})
