/**
 * PIA Terminal - Custom KlineCharts Overlays
 * Registers TradingView-compatible custom overlays (Rectangle, Circle, Measure).
 */

import { registerOverlay } from 'klinecharts'

let isOverlaysRegistered = false

export function registerCustomOverlays(): void {
  if (isOverlaysRegistered) return

  // 1. Rectangle Overlay
  registerOverlay({
    name: 'rect',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length > 1) {
        const minX = Math.min(coordinates[0].x, coordinates[1].x)
        const maxX = Math.max(coordinates[0].x, coordinates[1].x)
        const minY = Math.min(coordinates[0].y, coordinates[1].y)
        const maxY = Math.max(coordinates[0].y, coordinates[1].y)

        return [
          {
            type: 'polygon',
            attrs: {
              coordinates: [
                { x: minX, y: minY },
                { x: maxX, y: minY },
                { x: maxX, y: maxY },
                { x: minX, y: maxY }
              ]
            },
            styles: {
              style: 'stroke_fill',
              color: 'rgba(41, 98, 255, 0.15)',
              borderColor: '#2962ff',
              borderSize: 1
            }
          }
        ]
      }
      return []
    }
  })

  // 2. Circle Overlay
  registerOverlay({
    name: 'circle',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length > 1) {
        const dx = coordinates[1].x - coordinates[0].x
        const dy = coordinates[1].y - coordinates[0].y
        const r = Math.sqrt(dx * dx + dy * dy)

        return [
          {
            type: 'circle',
            attrs: {
              x: coordinates[0].x,
              y: coordinates[0].y,
              r
            },
            styles: {
              style: 'stroke_fill',
              color: 'rgba(41, 98, 255, 0.15)',
              borderColor: '#2962ff',
              borderSize: 1
            }
          }
        ]
      }
      return []
    }
  })

  // 3. TradingView Measure / Ruler Tool
  registerOverlay({
    name: 'measure',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length > 1) {
        const minX = Math.min(coordinates[0].x, coordinates[1].x)
        const maxX = Math.max(coordinates[0].x, coordinates[1].x)
        const minY = Math.min(coordinates[0].y, coordinates[1].y)
        const maxY = Math.max(coordinates[0].y, coordinates[1].y)

        const p0 = overlay.points[0]
        const p1 = overlay.points[1]
        const v0 = p0?.value ?? 0
        const v1 = p1?.value ?? 0
        const delta = v1 - v0
        const deltaPercent = v0 !== 0 ? (delta / v0) * 100 : 0
        const isUp = delta >= 0
        const text = `${isUp ? '+' : ''}${delta.toFixed(2)} (${isUp ? '+' : ''}${deltaPercent.toFixed(2)}%)`

        return [
          {
            type: 'polygon',
            attrs: {
              coordinates: [
                { x: minX, y: minY },
                { x: maxX, y: minY },
                { x: maxX, y: maxY },
                { x: minX, y: maxY }
              ]
            },
            styles: {
              style: 'stroke_fill',
              color: isUp ? 'rgba(8, 153, 129, 0.15)' : 'rgba(242, 54, 69, 0.15)',
              borderColor: isUp ? '#089981' : '#f23645',
              borderSize: 1,
              borderStyle: 'dashed',
              borderDashedValue: [4, 4]
            }
          },
          {
            type: 'text',
            attrs: {
              x: minX + 6,
              y: minY + 14,
              text
            },
            styles: {
              color: '#ffffff',
              backgroundColor: isUp ? '#089981' : '#f23645',
              paddingLeft: 4,
              paddingRight: 4,
              paddingTop: 2,
              paddingBottom: 2,
              borderRadius: 2,
              size: 11
            }
          }
        ]
      }
      return []
    }
  })

  isOverlaysRegistered = true
}
