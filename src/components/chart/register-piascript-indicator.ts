// ponytail: PiaScript indicator hooks directly into KlineCharts indicator registry.
// Upgrade path: separate panes for sub-indicators if PiaScript supports oscillator plots (RSI/MACD in subwindows).

import { registerIndicator } from 'klinecharts'
import { usePiaScriptStore } from '../../stores/usePiaScriptStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { getCachedKronosRollout } from '../../services/kronos-client'

let isRegistered = false

export function registerPiaScriptIndicator(): void {
  if (isRegistered) return
  isRegistered = true

  registerIndicator({
    name: 'KRONOS',
    shortName: 'Kronos AI',
    series: 'price',
    precision: 2,
    figures: [
      { key: 'q50', title: 'q50: ', type: 'line', styles: () => ({ color: 'transparent' }) },
      { key: 'q10', title: 'q10: ', type: 'line', styles: () => ({ color: 'transparent' }) },
      { key: 'q90', title: 'q90: ', type: 'line', styles: () => ({ color: 'transparent' }) }
    ],
    shouldUpdate: () => ({ calc: true, draw: true }),
    calc: (dataList) => {
      const rollout = getCachedKronosRollout(dataList, 12)
      const tail = rollout.at(-1)
      if (!tail) return dataList.map(() => ({}))
      let minQ10 = Infinity
      let maxQ90 = -Infinity
      for (const s of rollout) {
        minQ10 = Math.min(minQ10, s.q10, s.low)
        maxQ90 = Math.max(maxQ90, s.q90, s.high)
      }
      return dataList.map((_, i) =>
        i === dataList.length - 1
          ? { q50: tail.q50, q10: minQ10, q90: maxQ90 }
          : {}
      )
    },
    draw: ({ ctx, chart, bounding, xAxis, yAxis }) => {
      const dataList = chart.getDataList()
      if (dataList.length < 12) return true
      const rollout = getCachedKronosRollout(dataList, 12, () => {
        chart.overrideIndicator({ name: 'KRONOS', paneId: 'candle_pane' })
        chart.scrollToRealTime()
      })
      if (!rollout.length) return true
      const lastIdx = dataList.length - 1
      const lastBar = dataList[lastIdx]
      const x0 = xAxis.convertToPixel(lastIdx)
      const xPrev = xAxis.convertToPixel(Math.max(0, lastIdx - 1))
      const stepPx = Math.max(4, Math.abs(x0 - xPrev) || 10)
      const y0 = yAxis.convertToPixel(lastBar.close)
      const pts = rollout.map((step, idx) => ({
        x: xAxis.convertToPixel(lastIdx + idx + 1),
        open: step.open,
        close: step.close,
        q50: step.q50,
        yOpen: yAxis.convertToPixel(step.open),
        yHigh: yAxis.convertToPixel(step.high),
        yLow: yAxis.convertToPixel(step.low),
        yClose: yAxis.convertToPixel(step.close),
        y10: yAxis.convertToPixel(step.q10),
        y50: yAxis.convertToPixel(step.q50),
        y90: yAxis.convertToPixel(step.q90)
      }))
      const isDark = useWorkspaceStore.getState().theme === 'dark'
      const lineHex = isDark ? '#ea580c' : '#d97706'
      const fanFill = isDark ? 'rgba(234, 88, 12, 0.22)' : 'rgba(217, 119, 6, 0.20)'
      const fanEdge = isDark ? 'rgba(234, 88, 12, 0.70)' : 'rgba(217, 119, 6, 0.65)'
      const endPt = pts[pts.length - 1]

      ctx.save()
      // 0. Subtle forecast zone background tint
      const zoneWidth = Math.max(24, endPt.x - x0 + stepPx * 0.8)
      ctx.fillStyle = isDark ? 'rgba(234, 88, 12, 0.05)' : 'rgba(217, 119, 6, 0.04)'
      ctx.fillRect(x0, 0, zoneWidth, bounding.height)

      // 1. 80% uncertainty fan polygon (q10-q90)
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      for (const p of pts) ctx.lineTo(p.x, p.y90)
      for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y10)
      ctx.closePath()
      ctx.fillStyle = fanFill
      ctx.fill()

      // 2. Dashed upper/lower quantile bounds
      ctx.beginPath()
      ctx.setLineDash([4, 3])
      ctx.strokeStyle = fanEdge
      ctx.lineWidth = 1.2
      ctx.moveTo(x0, y0)
      for (const p of pts) ctx.lineTo(p.x, p.y90)
      ctx.moveTo(x0, y0)
      for (const p of pts) ctx.lineTo(p.x, p.y10)
      ctx.stroke()

      // 3. Predicted future K-line candles (open, high, low, close)
      const bodyWidth = Math.max(2.5, Math.min(12, stepPx * 0.58))
      ctx.setLineDash([])
      for (const p of pts) {
        const bullish = p.close >= p.open
        ctx.strokeStyle = bullish ? 'rgba(38, 178, 136, 0.75)' : 'rgba(239, 68, 68, 0.75)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(p.x, p.yHigh)
        ctx.lineTo(p.x, p.yLow)
        ctx.stroke()

        const topY = Math.min(p.yOpen, p.yClose)
        const bodyH = Math.max(2, Math.abs(p.yClose - p.yOpen))
        ctx.fillStyle = bullish ? 'rgba(38, 178, 136, 0.45)' : 'rgba(239, 68, 68, 0.45)'
        ctx.fillRect(p.x - bodyWidth / 2, topY, bodyWidth, bodyH)
        ctx.strokeRect(p.x - bodyWidth / 2, topY, bodyWidth, bodyH)
      }

      // 4. Solid q50 median trajectory + terminal marker + price badge
      ctx.beginPath()
      ctx.setLineDash([])
      ctx.strokeStyle = lineHex
      ctx.lineWidth = 2.2
      ctx.moveTo(x0, y0)
      for (const p of pts) ctx.lineTo(p.x, p.y50)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(endPt.x, endPt.y50, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = lineHex
      ctx.fill()

      const targetLabel = `q50 ${endPt.q50.toFixed(2)}`
      ctx.font = '600 10px monospace'
      const targetW = ctx.measureText(targetLabel).width + 10
      const badgeX = Math.min(bounding.width - targetW - 4, endPt.x + 6)
      const badgeY = Math.max(10, Math.min(bounding.height - 14, endPt.y50))
      ctx.fillStyle = lineHex
      ctx.beginPath()
      ctx.roundRect(badgeX, badgeY - 9, targetW, 18, 4)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(targetLabel, badgeX + 5, badgeY + 3.5)

      // 4. Vertical red dashed forecast separator line + badge
      ctx.beginPath()
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#dc2626'
      ctx.lineWidth = 1.5
      ctx.moveTo(x0, 0)
      ctx.lineTo(x0, bounding.height)
      ctx.stroke()

      ctx.setLineDash([])
      const label = 'Kronos AI Forecast'
      ctx.font = '600 10px Inter, sans-serif'
      const textWidth = ctx.measureText(label).width
      ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      ctx.roundRect(x0 + 6, 12, textWidth + 10, 18, 4)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, x0 + 11, 24)
      ctx.restore()
      return true
    }
  })

  registerIndicator({
    name: 'PiaScript',
    shortName: 'PIASCRIPT',
    series: 'price',
    precision: 2,
    figures: [
      { key: 'plot_0', title: 'Plot 1: ', type: 'line', styles: () => ({ color: '#00bcd4' }) },
      { key: 'plot_1', title: 'Plot 2: ', type: 'line', styles: () => ({ color: '#ff9800' }) },
      { key: 'plot_2', title: 'Plot 3: ', type: 'line', styles: () => ({ color: '#e91e63' }) },
      { key: 'plot_3', title: 'Plot 4: ', type: 'line', styles: () => ({ color: '#4caf50' }) }
    ],
    regenerateFigures: () => {
      const res = usePiaScriptStore.getState().result
      if (!res || !res.plots || res.plots.length === 0) {
        return [{ key: 'plot_0', title: 'PiaScript: ', type: 'line' }]
      }
      return res.plots.map((p, idx) => ({
        key: `plot_${idx}`,
        title: `${p.title}: `,
        type: 'line',
        styles: () => ({ color: p.color || '#2962ff' })
      }))
    },
    calc: (dataList) => {
      const res = usePiaScriptStore.getState().result
      if (!res || !res.plots || res.plots.length === 0) return []
      const plots = res.plots
      return dataList.map((_, i) => {
        const item: Record<string, any> = {}
        plots.forEach((p, idx) => {
          const val = p.values[i]
          item[`plot_${idx}`] = val !== null && val !== undefined ? val : undefined
        })
        return item
      })
    }
  })
}
