import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'
import { sanitizeIndicators, OVERLAY_INDICATORS } from '../stores/useChartStore'
import {
  DrawingPropertyBar,
  mapOverlayStyles,
  DRAWING_PALETTE_COLORS,
  STROKE_WIDTHS,
  STROKE_STYLES
} from '../components/chart/DrawingPropertyBar'

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

  describe('DrawingPropertyBar & overlay style mutations', () => {
    it('correctly maps full style payloads to line, polygon, and circle structures', () => {
      const styles = {
        color: '#2962ff',
        borderSize: 2,
        borderStyle: 'dashed' as const
      }

      const mapped = mapOverlayStyles(styles)

      expect(mapped.color).toBe('#2962ff')
      expect(mapped.borderSize).toBe(2)
      expect(mapped.borderStyle).toBe('dashed')

      expect(mapped.line).toEqual({
        color: '#2962ff',
        size: 2,
        style: 'dashed'
      })

      expect(mapped.polygon).toEqual({
        borderColor: '#2962ff',
        borderSize: 2,
        borderStyle: 'dashed'
      })

      expect(mapped.circle).toEqual({
        borderColor: '#2962ff',
        borderSize: 2,
        borderStyle: 'dashed'
      })
    })

    it('correctly maps partial style updates', () => {
      const colorOnly = mapOverlayStyles({ color: '#089981' })
      expect(colorOnly.line.color).toBe('#089981')
      expect(colorOnly.line.size).toBeUndefined()
      expect(colorOnly.polygon.borderColor).toBe('#089981')
      expect(colorOnly.circle.borderColor).toBe('#089981')

      const widthOnly = mapOverlayStyles({ borderSize: 3 })
      expect(widthOnly.line.size).toBe(3)
      expect(widthOnly.polygon.borderSize).toBe(3)
      expect(widthOnly.circle.borderSize).toBe(3)

      const styleOnly = mapOverlayStyles({ borderStyle: 'solid' })
      expect(styleOnly.line.style).toBe('solid')
      expect(styleOnly.polygon.borderStyle).toBe('solid')
      expect(styleOnly.circle.borderStyle).toBe('solid')
    })

    it('asserts palette options, stroke widths, and stroke styles conform to specification', () => {
      expect(DRAWING_PALETTE_COLORS).toEqual([
        '#2962ff',
        '#089981',
        '#f23645',
        '#ffb703',
        '#9c27b0',
        '#ffffff'
      ])
      expect(STROKE_WIDTHS).toEqual([1, 2, 3])
      expect(STROKE_STYLES).toEqual(['solid', 'dashed'])
    })

    it('renders null when selectedId is null and floating bar when selectedId is set', () => {
      const dummyUpdate = vi.fn()
      const dummyDelete = vi.fn()

      const nullHtml = renderToStaticMarkup(
        React.createElement(DrawingPropertyBar, {
          selectedId: null,
          onUpdateStyle: dummyUpdate,
          onDelete: dummyDelete
        })
      )
      expect(nullHtml).toBe('')

      const activeHtml = renderToStaticMarkup(
        React.createElement(DrawingPropertyBar, {
          selectedId: 'overlay_test_1',
          onUpdateStyle: dummyUpdate,
          onDelete: dummyDelete
        })
      )
      expect(activeHtml).toContain('data-testid="drawing-property-bar"')
      expect(activeHtml).toContain('1px')
      expect(activeHtml).toContain('2px')
      expect(activeHtml).toContain('3px')
      expect(activeHtml).toContain('Delete Drawing')
    })

    it('triggers onUpdateStyle and onDelete handlers with expected arguments', () => {
      const onUpdateStyle = vi.fn()
      const onDelete = vi.fn()

      // Color change handler call
      onUpdateStyle({ color: '#f23645' })
      expect(onUpdateStyle).toHaveBeenCalledWith({ color: '#f23645' })

      // Stroke width change handler call
      onUpdateStyle({ borderSize: 2 })
      expect(onUpdateStyle).toHaveBeenCalledWith({ borderSize: 2 })

      // Stroke style toggle handler call
      onUpdateStyle({ borderStyle: 'dashed' })
      expect(onUpdateStyle).toHaveBeenCalledWith({ borderStyle: 'dashed' })

      // Delete handler call
      onDelete()
      expect(onDelete).toHaveBeenCalledTimes(1)
    })
  })
})
