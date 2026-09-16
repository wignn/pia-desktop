import React from 'react'
import { useChartStore, type DrawingToolType } from '../../stores/useChartStore'
import { THEME_TOKENS } from '../../theme/tokens'

interface ToolItem {
  id: DrawingToolType
  title: string
  icon: React.ReactNode
}

const DRAWING_TOOLS: ToolItem[] = [
  {
    id: 'cursor',
    title: 'Crosshair / Pointer (Esc)',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
      </svg>
    )
  },
  {
    id: 'segment',
    title: 'Trend Line',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="5" cy="19" r="2" />
        <circle cx="19" cy="5" r="2" />
        <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" />
      </svg>
    )
  },
  {
    id: 'rayLine',
    title: 'Ray Line',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="5" cy="19" r="2" />
        <line x1="6.5" y1="17.5" x2="21" y2="3" />
        <polyline points="15 3 21 3 21 9" />
      </svg>
    )
  },
  {
    id: 'horizontalStraightLine',
    title: 'Horizontal Line',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <line x1="2" y1="12" x2="22" y2="12" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    )
  },
  {
    id: 'parallelStraightLine',
    title: 'Parallel Channel',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <line x1="3" y1="7" x2="21" y2="7" />
        <line x1="3" y1="17" x2="21" y2="17" />
        <line x1="3" y1="7" x2="3" y2="17" strokeDasharray="2 2" />
        <line x1="21" y1="7" x2="21" y2="17" strokeDasharray="2 2" />
      </svg>
    )
  },
  {
    id: 'fibonacciLine',
    title: 'Fibonacci Retracement',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <line x1="3" y1="4" x2="21" y2="4" />
        <line x1="3" y1="9" x2="21" y2="9" strokeDasharray="2 2" />
        <line x1="3" y1="14" x2="21" y2="14" strokeDasharray="2 2" />
        <line x1="3" y1="20" x2="21" y2="20" />
      </svg>
    )
  },
  {
    id: 'brush',
    title: 'Freehand Brush',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="2" />
      </svg>
    )
  },
  {
    id: 'simpleAnnotation',
    title: 'Text Annotation',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="4 7 4 4 20 4 20 7" />
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="8" y1="20" x2="16" y2="20" />
      </svg>
    )
  }
]

export const LeftDrawingToolbar: React.FC = () => {
  const { activeTool, setActiveTool, magnetMode, toggleMagnetMode, clearAllDrawings } =
    useChartStore()

  return (
    <div
      style={{
        width: THEME_TOKENS.dimensions.leftToolbarWidth,
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        borderRight: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 0',
        gap: 6,
        zIndex: 15
      }}
    >
      {/* Drawing tools */}
      {DRAWING_TOOLS.map((tool) => {
        const isActive = activeTool === tool.id
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => setActiveTool(tool.id)}
            className={`tv-btn ${isActive ? 'active' : ''}`}
            title={tool.title}
            style={{
              width: 36,
              height: 36,
              padding: 0,
              color: isActive ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textSecondary,
              backgroundColor: isActive ? THEME_TOKENS.colors.bgActive : 'transparent'
            }}
          >
            {tool.icon}
          </button>
        )
      })}

      <div
        style={{
          width: 24,
          height: 1,
          backgroundColor: THEME_TOKENS.colors.borderMedium,
          margin: '4px 0'
        }}
      />

      {/* Magnet Mode Toggle */}
      <button
        type="button"
        onClick={toggleMagnetMode}
        className={`tv-btn ${magnetMode ? 'active' : ''}`}
        title={`Magnet Mode (${magnetMode ? 'Active - Snap to OHLC' : 'Inactive'})`}
        style={{
          width: 36,
          height: 36,
          padding: 0,
          color: magnetMode ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textSecondary,
          backgroundColor: magnetMode ? THEME_TOKENS.colors.bgActive : 'transparent'
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
          <path d="M7 10v4" />
          <path d="M17 10v4" />
          <line x1="7" y1="4" x2="7" y2="7" />
          <line x1="17" y1="4" x2="17" y2="7" />
        </svg>
      </button>

      <div style={{ flex: 1 }} />

      {/* Clear All Drawings */}
      <button
        type="button"
        onClick={clearAllDrawings}
        className="tv-btn"
        title="Clear All Drawings"
        style={{
          width: 36,
          height: 36,
          padding: 0,
          color: THEME_TOKENS.colors.textMuted
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        </svg>
      </button>
    </div>
  )
}
