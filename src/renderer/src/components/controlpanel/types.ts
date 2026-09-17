export type WidgetType =
  | 'live_tv'
  | 'mini_chart'
  | 'social_x'
  | 'breaking_news'
  | 'yield_curve'
  | 'dxy_macro'
  | 'order_book'
  | 'economic_calendar'
  | 'energy_complex'

export interface DashboardWidget {
  id: string
  type: WidgetType
  title: string
  colSpan: number // 1 to 12 columns
  minHeightPx?: number
  config?: {
    symbol?: string
    timeframe?: string
    channelId?: string
  }
}

export interface WidgetCatalogItem {
  type: WidgetType
  title: string
  description: string
  defaultColSpan: number
  defaultMinHeight: number
  icon: string
  badge: string
}

export const WIDGET_CATALOG: WidgetCatalogItem[] = [
  {
    type: 'live_tv',
    title: 'Live Financial TV',
    description: '24/7 Global broadcast (Bloomberg, CNBC, Fed, CNBC Indonesia, IDX)',
    defaultColSpan: 6,
    defaultMinHeight: 320,
    icon: '📺',
    badge: 'LIVE'
  },
  {
    type: 'mini_chart',
    title: 'Custom Mini Chart',
    description: 'Interactive candlestick chart for any crypto, stock, or commodity',
    defaultColSpan: 6,
    defaultMinHeight: 320,
    icon: '📈',
    badge: 'CHART'
  },
  {
    type: 'breaking_news',
    title: 'Breaking News Wire',
    description: 'Real-time financial headlines, wire updates, and market alerts',
    defaultColSpan: 4,
    defaultMinHeight: 300,
    icon: '📰',
    badge: 'WIRE'
  },
  {
    type: 'social_x',
    title: 'X / Twitter Sentiment',
    description: 'Market chatter, sentiment scores, and influential trader posts',
    defaultColSpan: 4,
    defaultMinHeight: 300,
    icon: '🐦',
    badge: 'SOCIAL'
  },
  {
    type: 'yield_curve',
    title: 'Treasury Yields & 2s10s',
    description: 'US Treasury curve, benchmark yields, and inversion spread monitor',
    defaultColSpan: 4,
    defaultMinHeight: 300,
    icon: '📊',
    badge: 'RATES'
  },
  {
    type: 'dxy_macro',
    title: 'DXY & FX Currency Radar',
    description: 'US Dollar Index, major currency pairs, and central bank stance',
    defaultColSpan: 4,
    defaultMinHeight: 280,
    icon: '💵',
    badge: 'FOREX'
  },
  {
    type: 'order_book',
    title: 'Order Book Depth Ladder',
    description: 'Real-time bids, asks, spread calculation, and order density',
    defaultColSpan: 4,
    defaultMinHeight: 280,
    icon: '📑',
    badge: 'L2'
  },
  {
    type: 'economic_calendar',
    title: 'Economic Calendar',
    description: 'Scheduled macro events, CPI, rate decisions, actual vs forecast',
    defaultColSpan: 4,
    defaultMinHeight: 300,
    icon: '📅',
    badge: 'MACRO'
  },
  {
    type: 'energy_complex',
    title: 'Energy Complex & Cracks',
    description: 'WTI, Brent, Natural Gas prices, EIA storage, and crack spreads',
    defaultColSpan: 4,
    defaultMinHeight: 280,
    icon: '⚡',
    badge: 'COMMODITIES'
  }
]
