import { registerIndicator } from 'klinecharts'
import type { CandleBar } from '../../shared/types'
import { projectHistogram } from '../../services/volume-measurement'

let registered = false

export function registerVolumeIndicators(): void {
  if (registered) return
  registered = true
  for (const [name, shortName, mode] of [
    ['TRADE_VOLUME', 'Trade Volume', 'trade'],
    ['TICK_ACTIVITY', 'Tick Activity', 'activity']
  ] as const) {
    registerIndicator({
      name,
      shortName,
      series: 'volume',
      figures: [{ key: 'measurement', title: `${shortName}: `, type: 'bar' as const }],
      calc: (bars) => bars.map(bar => {
        const value = projectHistogram(bar as unknown as CandleBar, mode)
        return value === undefined ? {} : { measurement: value }
      })
    })
  }
}
