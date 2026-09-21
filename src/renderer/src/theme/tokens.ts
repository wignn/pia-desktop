/**
 * PIA Terminal - Design Tokens & TradingView Theming System
 * Supports seamless dynamic toggling between institutional TradingView Dark & Light palettes.
 */

import type { DeepPartial, Styles } from 'klinecharts'

export const THEME_COLORS_DARK = {
  bgApp: '#0f0f0f',
  bgSurface: '#171717',
  bgSurfaceHover: '#1f1f1f',
  bgActive: '#262b35',
  borderSubtle: '#232323',
  borderMedium: '#2b2b2b',
  borderFocus: '#2962ff',
  textPrimary: '#d1d4dc',
  textSecondary: '#848e9c',
  textMuted: '#50535e',
  textBright: '#ffffff',
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
  borderSubtle: '#f0f3fa',
  borderMedium: '#e0e3eb',
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
    topToolbarHeight: '42px',
    leftToolbarWidth: '48px',
    rightPanelWidth: '320px',
    rightRailWidth: '44px',
    bottomStatusHeight: '28px'
  },
  typography: {
    fontSans: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
    fontMono: "'SF Pro Text', 'Consolas', 'Roboto Mono', 'Courier New', monospace"
  }
} as const

/**
 * Returns concrete KLineChart Styles configuration mapped to dark or light themes.
 * Canvas 2D contexts cannot parse CSS variables, requiring direct hex/rgba definitions.
 */
export function getChartThemeStyles(theme: 'dark' | 'light'): DeepPartial<Styles> {
  const isDark = theme === 'dark'
  return {
    grid: {
      show: true,
      horizontal: {
        show: true,
        size: 1,
        color: isDark ? '#1f1f1f' : '#f0f3fa',
        style: 'dashed',
        dashedValue: [2, 2]
      },
      vertical: {
        show: true,
        size: 1,
        color: isDark ? '#1f1f1f' : '#f0f3fa',
        style: 'dashed',
        dashedValue: [2, 2]
      }
    },
    candle: {
      bar: {
        upColor: '#089981',
        downColor: '#f23645',
        noChangeColor: isDark ? '#848e9c' : '#787b86',
        upBorderColor: '#089981',
        downBorderColor: '#f23645',
        noChangeBorderColor: isDark ? '#848e9c' : '#787b86',
        upWickColor: '#089981',
        downWickColor: '#f23645',
        noChangeWickColor: isDark ? '#848e9c' : '#787b86'
      },
      area: {
        lineSize: 2,
        lineColor: '#2962ff',
        value: 'close',
        smooth: true,
        backgroundColor: [
          { offset: 0, color: 'rgba(41, 98, 255, 0.25)' },
          { offset: 1, color: 'rgba(41, 98, 255, 0.0)' }
        ]
      },
      priceMark: {
        high: {
          show: true,
          color: isDark ? '#848e9c' : '#787b86'
        },
        low: {
          show: true,
          color: isDark ? '#848e9c' : '#787b86'
        },
        last: {
          show: true,
          upColor: '#089981',
          downColor: '#f23645',
          noChangeColor: isDark ? '#848e9c' : '#787b86',
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
            family: 'sans-serif'
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
        offsetTop: 30
      }
    },
    xAxis: {
      show: true,
      size: 'auto',
      axisLine: {
        show: true,
        color: isDark ? '#2b2b2b' : '#e0e3eb',
        size: 1
      },
      tickLine: {
        show: true,
        size: 1,
        length: 3,
        color: isDark ? '#2b2b2b' : '#e0e3eb'
      },
      tickText: {
        show: true,
        color: isDark ? '#848e9c' : '#787b86',
        family: 'sans-serif',
        size: 11
      }
    },
    yAxis: {
      show: true,
      size: 'auto',
      axisLine: {
        show: true,
        color: isDark ? '#2b2b2b' : '#e0e3eb',
        size: 1
      },
      tickLine: {
        show: true,
        size: 1,
        length: 3,
        color: isDark ? '#2b2b2b' : '#e0e3eb'
      },
      tickText: {
        show: true,
        color: isDark ? '#848e9c' : '#787b86',
        family: 'sans-serif',
        size: 11
      }
    },
    separator: {
      size: 1,
      color: isDark ? '#2b2b2b' : '#e0e3eb',
      fill: true,
      activeBackgroundColor: '#2962ff'
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
          color: isDark ? '#6e7382' : '#9598a1'
        },
        text: {
          show: true,
          color: '#ffffff',
          size: 11,
          family: 'sans-serif',
          backgroundColor: isDark ? '#262b35' : '#131722'
        }
      },
      vertical: {
        show: true,
        line: {
          show: true,
          style: 'dashed',
          dashedValue: [3, 3],
          size: 1,
          color: isDark ? '#6e7382' : '#9598a1'
        },
        text: {
          show: true,
          color: '#ffffff',
          size: 11,
          family: 'sans-serif',
          backgroundColor: isDark ? '#262b35' : '#131722'
        }
      }
    },
    overlay: {
      point: {
        color: '#2962ff',
        borderColor: '#ffffff',
        borderSize: 1,
        radius: 4,
        activeColor: '#2962ff',
        activeBorderColor: '#ffffff',
        activeBorderSize: 2,
        activeRadius: 5
      },
      line: {
        color: '#2962ff',
        size: 2,
        style: 'solid'
      },
      rect: {
        color: 'rgba(41, 98, 255, 0.15)',
        borderColor: '#2962ff',
        borderSize: 1,
        borderStyle: 'solid'
      },
      polygon: {
        color: 'rgba(41, 98, 255, 0.15)',
        borderColor: '#2962ff',
        borderSize: 1,
        borderStyle: 'solid'
      },
      circle: {
        color: 'rgba(41, 98, 255, 0.15)',
        borderColor: '#2962ff',
        borderSize: 1,
        borderStyle: 'solid'
      },
      text: {
        color: isDark ? '#d1d4dc' : '#131722',
        size: 12,
        family: 'sans-serif'
      }
    }
  }
}
