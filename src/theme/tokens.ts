/**
 * PIA Terminal - Design Tokens & TradingView Theming System
 * Canonical TradingView dark/light styling and exact dimension metrics.
 */

import type { DeepPartial, Styles } from 'klinecharts'

export const THEME_COLORS_DARK = {
  bgApp: '#131722',
  bgSurface: '#1e222d',
  bgSurfaceHover: '#2a2e39',
  bgActive: '#2a2e39',
  borderSubtle: '#2a2e39',
  borderMedium: '#363a45',
  borderFocus: '#2962ff',
  textPrimary: '#d1d4dc',
  textSecondary: '#787b86',
  textMuted: '#50535e',
  textBright: '#f0f3fa',
  bullish: '#089981',
  bullishBg: 'rgba(8, 153, 129, 0.12)',
  bearish: '#f23645',
  bearishBg: 'rgba(242, 54, 69, 0.12)',
  accent: '#2962ff',
  accentHover: '#1e53e5'
} as const

export const THEME_COLORS_LIGHT = {
  bgApp: '#ffffff',
  bgSurface: '#ffffff',
  bgSurfaceHover: '#f0f3fa',
  bgActive: '#e0e3eb',
  borderSubtle: '#e0e3eb',
  borderMedium: '#d1d4dc',
  borderFocus: '#2962ff',
  textPrimary: '#131722',
  textSecondary: '#787b86',
  textMuted: '#9598a1',
  textBright: '#131722',
  bullish: '#089981',
  bullishBg: 'rgba(8, 153, 129, 0.10)',
  bearish: '#f23645',
  bearishBg: 'rgba(242, 54, 69, 0.10)',
  accent: '#2962ff',
  accentHover: '#1e53e5'
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

    impactHigh: 'var(--bearish)',
    impactMedium: '#ff9800',
    impactLow: '#26a69a',
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
    fontSans: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
    fontMono: "'Trebuchet MS', Roboto, 'Consolas', monospace"
  }
} as const

/**
 * Returns concrete KLineChart Styles configuration mapped to dark or light themes.
 * Canvas 2D contexts cannot parse CSS variables, requiring direct hex/rgba definitions.
 */
export function getChartThemeStyles(theme: 'dark' | 'light'): DeepPartial<Styles> {
  const isDark = theme === 'dark'
  const bgColor = isDark ? '#131722' : '#ffffff'
  const gridColor = isDark ? 'rgba(42, 46, 57, 0.5)' : '#f0f3fa'
  const axisColor = isDark ? '#2a2e39' : '#e0e3eb'
  const textMuted = isDark ? '#787b86' : '#787b86'
  const textBright = isDark ? '#f0f3fa' : '#131722'

  return {
    grid: {
      show: true,
      horizontal: {
        show: true,
        size: 1,
        color: gridColor,
        style: 'dashed',
        dashedValue: [2, 2]
      },
      vertical: {
        show: true,
        size: 1,
        color: gridColor,
        style: 'dashed',
        dashedValue: [2, 2]
      }
    },
    candle: {
      bar: {
        upColor: '#089981',
        downColor: '#f23645',
        noChangeColor: textMuted,
        upBorderColor: '#089981',
        downBorderColor: '#f23645',
        noChangeBorderColor: textMuted,
        upWickColor: '#089981',
        downWickColor: '#f23645',
        noChangeWickColor: textMuted
      },
      area: {
        lineSize: 2,
        lineColor: '#2962ff',
        value: 'close',
        smooth: true,
        backgroundColor: [
          { offset: 0, color: 'rgba(41, 98, 255, 0.20)' },
          { offset: 1, color: 'rgba(41, 98, 255, 0.0)' }
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
          upColor: '#089981',
          downColor: '#f23645',
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
            family: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif"
          }
        }
      },
      tooltip: {
        showRule: 'none'
      }
    },
    indicator: {
      tooltip: {
        showRule: 'always',
        showType: 'standard',
        offsetTop: 28
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
