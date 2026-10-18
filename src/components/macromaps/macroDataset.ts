import type { MacroMetricType } from '@shared/types'

export interface MacroMetricConfig {
  id: MacroMetricType
  label: string
  unit: string
  description: string
  minVal: number
  maxVal: number
  colorRamp: { stop: number; color: string }[]
}

export const MACRO_METRICS: MacroMetricConfig[] = [
  {
    id: 'inflation',
    label: 'Inflation Rate',
    unit: '%',
    description: 'Year-over-year percentage change in Consumer Price Index (CPI)',
    minVal: 0,
    maxVal: 80,
    colorRamp: [
      { stop: 0, color: '#321c12' },
      { stop: 3, color: '#4a2815' },
      { stop: 6, color: '#6d3916' },
      { stop: 10, color: '#9a4f1a' },
      { stop: 25, color: '#c2621c' },
      { stop: 50, color: '#ea7317' },
      { stop: 80, color: '#ff8a24' }
    ]
  },
  {
    id: 'interest_rate',
    label: 'Interest Rate',
    unit: '%',
    description: 'Central bank benchmark policy lending rate',
    minVal: 0,
    maxVal: 50,
    colorRamp: [
      { stop: 0, color: '#1a2836' },
      { stop: 2, color: '#1e3a5f' },
      { stop: 5, color: '#2563eb' },
      { stop: 10, color: '#7c3aed' },
      { stop: 25, color: '#c026d3' },
      { stop: 50, color: '#e11d48' }
    ]
  },
  {
    id: 'gdp_growth',
    label: 'GDP',
    unit: '%',
    description: 'Real annual Gross Domestic Product growth rate YoY',
    minVal: -2,
    maxVal: 10,
    colorRamp: [
      { stop: -2, color: '#3e1616' },
      { stop: 0, color: '#332314' },
      { stop: 2, color: '#4d3806' },
      { stop: 5, color: '#14532d' },
      { stop: 7, color: '#16a34a' },
      { stop: 10, color: '#4ade80' }
    ]
  },
  {
    id: 'unemployment',
    label: 'Unemployment Rate',
    unit: '%',
    description: 'Percentage of the total labor force that is unemployed',
    minVal: 2,
    maxVal: 35,
    colorRamp: [
      { stop: 2, color: '#143828' },
      { stop: 4, color: '#1f4e38' },
      { stop: 6, color: '#4d4716' },
      { stop: 10, color: '#784615' },
      { stop: 20, color: '#a13318' },
      { stop: 35, color: '#dc2626' }
    ]
  },
  {
    id: 'debt_to_gdp',
    label: 'Government Debt to GDP',
    unit: '%',
    description: 'Gross general government debt expressed as percentage of GDP',
    minVal: 15,
    maxVal: 260,
    colorRamp: [
      { stop: 15, color: '#1e293b' },
      { stop: 40, color: '#334155' },
      { stop: 70, color: '#64748b' },
      { stop: 100, color: '#d97706' },
      { stop: 140, color: '#ea580c' },
      { stop: 260, color: '#ef4444' }
    ]
  }
]

// Convert metric value to choropleth fill color
export function getChoroplethColor(value: number, metric: MacroMetricType): string {
  const cfg = MACRO_METRICS.find((m) => m.id === metric) || MACRO_METRICS[0]
  const ramp = cfg.colorRamp

  if (value <= ramp[0].stop) return ramp[0].color
  if (value >= ramp[ramp.length - 1].stop) return ramp[ramp.length - 1].color

  for (let i = 0; i < ramp.length - 1; i++) {
    const curr = ramp[i]
    const next = ramp[i + 1]
    if (value >= curr.stop && value <= next.stop) {
      // Interpolate between colors
      return next.color
    }
  }

  return ramp[ramp.length - 1].color
}
