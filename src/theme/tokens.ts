/**
 * PIA Terminal - Design Tokens & TradingView Theming System
 * Canonical TradingView dark/light styling and exact dimension metrics.
 */

import type { DeepPartial, Styles } from 'klinecharts'

export const THEME_COLORS_DARK = {
  bgApp: '#0b0e14',
  bgSurface: '#11151f',
  bgSurfaceHover: '#181e2b',
  bgActive: '#1e2638',
  borderSubtle: 'rgba(255, 255, 255, 0.07)',
  borderMedium: 'rgba(255, 255, 255, 0.12)',
  borderFocus: '#3b82f6',
  textPrimary: '#d8dce6',
  textSecondary: '#838896',
  textMuted: '#525766',
  textBright: '#f4f6fc',
  bullish: '#10b981',
  bullishBg: 'rgba(16, 185, 129, 0.12)',
  bearish: '#f43f5e',
  bearishBg: 'rgba(244, 63, 94, 0.12)',
  accent: '#3b82f6',
  accentHover: '#2563eb',
  gold: '#f59e0b',
  goldBg: 'rgba(245, 158, 11, 0.12)'
} as const

export const THEME_COLORS_LIGHT = {
  bgApp: '#f8fafc',
  bgSurface: '#ffffff',
  bgSurfaceHover: '#f1f5f9',
  bgActive: '#e2e8f0',
  borderSubtle: '#e2e8f0',
  borderMedium: '#cbd5e1',
  borderFocus: '#3b82f6',
  textPrimary: '#0f172a',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  textBright: '#020617',
  bullish: '#10b981',
  bullishBg: 'rgba(16, 185, 129, 0.10)',
  bearish: '#f43f5e',
  bearishBg: 'rgba(244, 63, 94, 0.10)',
  accent: '#3b82f6',
  accentHover: '#2563eb',
  gold: '#f59e0b',
  goldBg: 'rgba(245, 158, 11, 0.10)'
} as const

export const THEME_TOKENS = {
  colors: {
    bgApp: 'var(--bg-app)',
    bgSurface: 'var(--bg-surface)',
    bgSurfaceHover: 'var(--bg-surface-hover)',
    bgActive: 'var(--bg-active)',
    borderSubtle: 'var(--border-subtle)',
    borderMedium: 'var(--border-medium)',
    borderFocus: 'var(--border-focus)',

    textPrimary: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    textMuted: 'var(--text-muted)',
    textBright: 'var(--text-bright)',

    bullish: 'var(--bullish)',
    bullishBg: 'var(--bullish-bg)',
    bearish: 'var(--bearish)',
    bearishBg: 'var(--bearish-bg)',

    accent: 'var(--accent)',
    accentHover: 'var(--accent-hover)',
    gold: 'var(--gold, #f59e0b)',
    goldBg: 'var(--gold-bg, rgba(245, 158, 11, 0.12))',

    impactHigh: 'var(--bearish)',
    impactMedium: '#f59e0b',
    impactLow: '#10b981',
    impactNone: 'var(--text-muted)',

    modalBackdrop: 'var(--modal-backdrop)',
    modalShadow: 'var(--modal-shadow)'
  },
  dimensions: {
    tabBarHeight: '34px',
    topToolbarHeight: '38px',
    leftToolbarWidth: '44px',
    rightPanelWidth: '320px',
    rightRailWidth: '42px',
    bottomStatusHeight: '26px'
  },
  typography: {
    fontSans: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', system-ui, sans-serif",
    fontMono: "'SF Mono', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace"
  }
} as const

/**
 * Returns concrete KLineChart Styles configuration mapped to dark or light themes.
 * Canvas 2D contexts cannot parse CSS variables, requiring direct hex/rgba definitions.
 */
export function getChartThemeStyles(theme: 'dark' | 'light'): DeepPartial<Styles> {
  const isDark = theme === 'dark'
  const bgColor = isDark ? '#0b0e14' : '#f8fafc'
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.04)'
  const axisColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#cbd5e1'
  const textMuted = isDark ? '#838896' : '#64748b'
  const textBright = isDark ? '#f4f6fc' : '#0f172a'

  return {
    grid: {
      show: true,
      horizontal: {
        show: true,
        size: 1,
        color: gridColor,
        style: 'dashed',
        dashedValue: [2, 3]
      },
      vertical: {
        show: true,
        size: 1,
        color: gridColor,
        style: 'dashed',
        dashedValue: [2, 3]
      }
    },
    candle: {
      bar: {
        upColor: '#10b981',
        downColor: '#f43f5e',
        noChangeColor: textMuted,
        upBorderColor: '#10b981',
        downBorderColor: '#f43f5e',
        noChangeBorderColor: textMuted,
        upWickColor: '#10b981',
        downWickColor: '#f43f5e',
        noChangeWickColor: textMuted
      },
      area: {
        lineSize: 2,
        lineColor: '#3b82f6',
        value: 'close',
        smooth: true,
        backgroundColor: [
          { offset: 0, color: 'rgba(59, 130, 246, 0.22)' },
          { offset: 1, color: 'rgba(59, 130, 246, 0.0)' }
        ]
      },
      priceMark: {
        high: {
          show: true,
          color: textMuted
        },
        low: {
          show: true,
          color: textMuted
        },
        last: {
          show: true,
          upColor: '#10b981',
          downColor: '#f43f5e',
          noChangeColor: textMuted,
          line: {
            show: true,
            style: 'dashed',
            dashedValue: [4, 4],
            size: 1
          },
          text: {
            show: true,
            color: '#ffffff',
            size: 11,
            family: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif"
          }
        }
      },
      tooltip: {
        showRule: 'none',
        showType: 'standard',
        offsetTop: 34,
        offsetLeft: 10
      }
    },
    indicator: {
      tooltip: {
        showRule: 'always',
        showType: 'standard',
        offsetTop: 34,
        offsetLeft: 10
      }
    },
    xAxis: {
      show: true,
      size: 'auto',
      axisLine: {
        show: true,
        color: axisColor,
        size: 1
      },
      tickLine: {
        show: true,
        size: 1,
        length: 3,
        color: axisColor
      },
      tickText: {
        show: true,
        color: textMuted,
        family: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif",
        size: 11
      }
    },
    yAxis: {
      show: true,
      size: 'auto',
      axisLine: {
        show: true,
        color: axisColor,
        size: 1
      },
      tickLine: {
        show: true,
        size: 1,
        length: 3,
        color: axisColor
      },
      tickText: {
        show: true,
        color: textMuted,
        family: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif",
        size: 11
      }
    },
    crosshair: {
      show: true,
      horizontal: {
        show: true,
        line: {
          show: true,
          style: 'dashed',
          dashedValue: [3, 3],
          size: 1,
          color: isDark ? '#787b86' : '#787b86'
        },
        text: {
          show: true,
          color: '#ffffff',
          size: 11,
          family: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif",
          backgroundColor: '#363a45',
          borderColor: '#363a45',
          borderRadius: 2,
          paddingLeft: 4,
          paddingRight: 4,
          paddingTop: 2,
          paddingBottom: 2
        }
      },
      vertical: {
        show: true,
        line: {
          show: true,
          style: 'dashed',
          dashedValue: [3, 3],
          size: 1,
          color: isDark ? '#787b86' : '#787b86'
        },
        text: {
          show: true,
          color: '#ffffff',
          size: 11,
          family: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif",
          backgroundColor: '#363a45',
          borderColor: '#363a45',
          borderRadius: 2,
          paddingLeft: 4,
          paddingRight: 4,
          paddingTop: 2,
          paddingBottom: 2
        }
      }
    }
  }
}
