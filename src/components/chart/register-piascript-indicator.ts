// ponytail: PiaScript indicator hooks directly into KlineCharts indicator registry.
// Upgrade path: separate panes for sub-indicators if PiaScript supports oscillator plots (RSI/MACD in subwindows).

import { registerIndicator } from 'klinecharts'
import { usePiaScriptStore } from '../../stores/usePiaScriptStore'

let isRegistered = false

export function registerPiaScriptIndicator(): void {
  if (isRegistered) return
  isRegistered = true

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
