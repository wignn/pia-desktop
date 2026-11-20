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
      minValue: 0,
      shouldFormatBigNumber: true,
      precision: 0,
      figures: [
        {
          key: 'measurement',
          title: `${shortName}: `,
          type: 'bar' as const,
          baseValue: 0,
          styles: ({ data, defaultStyles }) => {
            const current = data.current as unknown as { open?: number; close?: number }
            if (current && typeof current.close === 'number' && typeof current.open === 'number') {
              if (current.close > current.open) {
                return { color: defaultStyles?.bars?.[0]?.upColor ?? 'rgba(38, 166, 154, 0.7)' }
              }
              if (current.close < current.open) {
                return { color: defaultStyles?.bars?.[0]?.downColor ?? 'rgba(239, 83, 80, 0.7)' }
              }
            }
            return { color: defaultStyles?.bars?.[0]?.noChangeColor ?? 'rgba(150, 150, 150, 0.7)' }
          }
        }
      ],
      calc: (bars) => bars.map(bar => {
        const candle = bar as unknown as CandleBar
        let value = projectHistogram(candle, mode)
        if (value === undefined && candle.volumeBasis !== 'unavailable') {
          if (typeof candle.volume === 'number' && Number.isFinite(candle.volume) && candle.volume >= 0) {
            value = candle.volume
          } else if (typeof candle.tickCount === 'number' && Number.isFinite(candle.tickCount) && candle.tickCount >= 0) {
            value = candle.tickCount
          }
        }
        return value === undefined
          ? { open: candle.open, close: candle.close }
          : { measurement: value, open: candle.open, close: candle.close }
      })
    })
  }
}
