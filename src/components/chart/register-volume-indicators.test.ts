import { describe, expect, it, vi } from 'vitest'

const { registerIndicator, registered } = vi.hoisted(() => {
  const registered: Record<string, any> = {}
  return {
    registered,
    registerIndicator: vi.fn((def: any) => { registered[def.name] = def })
  }
})

vi.mock('klinecharts', () => ({ registerIndicator }))

import { registerVolumeIndicators } from './register-volume-indicators'

describe('registerVolumeIndicators', () => {
  it('registers indicators with correct candle open/close for up/down coloring', () => {
    registerVolumeIndicators()
    const tradeVolumeDef = registered['TRADE_VOLUME']
    expect(tradeVolumeDef).toBeDefined()

    const calcResult = tradeVolumeDef.calc([
      { open: 100, close: 105, volume: 10, volumeBasis: 'trade' },
      { open: 105, close: 95, volume: 20, volumeBasis: 'trade' },
      { open: 100, close: 100, volume: 5, volumeBasis: 'trade' }
    ])

    expect(calcResult).toEqual([
      { measurement: 10, open: 100, close: 105 },
      { measurement: 20, open: 105, close: 95 },
      { measurement: 5, open: 100, close: 100 }
    ])

    const stylesFn = tradeVolumeDef.figures[0].styles
    const defaultStyles = {
      bars: [{ upColor: '#00ff00', downColor: '#ff0000', noChangeColor: '#888888' }]
    }

    expect(stylesFn({ data: { current: calcResult[0] }, defaultStyles })).toEqual({ color: '#00ff00' })
    expect(stylesFn({ data: { current: calcResult[1] }, defaultStyles })).toEqual({ color: '#ff0000' })
    expect(stylesFn({ data: { current: calcResult[2] }, defaultStyles })).toEqual({ color: '#888888' })
  })
})
