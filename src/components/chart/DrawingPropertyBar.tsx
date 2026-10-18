import React, { useState } from 'react'
import { THEME_TOKENS } from '../../theme/tokens'

export interface DrawingPropertyBarProps {
  selectedId: string | null
  onUpdateStyle: (styles: { color?: string; borderSize?: number; borderStyle?: 'solid' | 'dashed' }) => void
  onDelete: () => void
}

export const DRAWING_PALETTE_COLORS = [
  '#2962ff',
  '#089981',
  '#f23645',
  '#ffb703',
  '#9c27b0',
  '#ffffff'
] as const

export const STROKE_WIDTHS = [1, 2, 3] as const
export const STROKE_STYLES = ['solid', 'dashed'] as const

export function mapOverlayStyles(styles: {
  color?: string
  borderSize?: number
  borderStyle?: 'solid' | 'dashed'
}) {
  return {
    ...styles,
    line: {
      color: styles.color,
      size: styles.borderSize,
      style: styles.borderStyle
    },
    polygon: {
      borderColor: styles.color,
      borderSize: styles.borderSize,
      borderStyle: styles.borderStyle
    },
    circle: {
      borderColor: styles.color,
      borderSize: styles.borderSize,
      borderStyle: styles.borderStyle
    }
  }
}

export const DrawingPropertyBar: React.FC<DrawingPropertyBarProps> = ({
  selectedId,
  onUpdateStyle,
  onDelete
}) => {
  const [currentColor, setCurrentColor] = useState<string>('#2962ff')
  const [currentWidth, setCurrentWidth] = useState<number>(1)
  const [currentStyle, setCurrentStyle] = useState<'solid' | 'dashed'>('solid')

  if (!selectedId) {
    return null
  }

  // ponytail: Floating bar styles overlay line, polygon, circle in memory via overrideOverlay; upgrade path: persist custom styles per drawing to DB and overlay templates.
  return (
    <div
      data-testid="drawing-property-bar"
      style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
        userSelect: 'none',
        fontFamily: THEME_TOKENS.typography?.fontSans || 'sans-serif',
        fontSize: 11
      }}
    >
      {/* Quick Color Palette Pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {DRAWING_PALETTE_COLORS.map((color) => {
          const isSelected = currentColor === color
          return (
            <button
              key={color}
              type="button"
              aria-label={`Color ${color}`}
              title={`Color ${color}`}
              onClick={() => {
                setCurrentColor(color)
                onUpdateStyle({ color })
              }}
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                backgroundColor: color,
                border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.3)',
                boxShadow: isSelected ? '0 0 4px rgba(0, 0, 0, 0.5)' : 'none',
                cursor: 'pointer',
                padding: 0,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          )
        })}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle }} />

      {/* Stroke Width Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {STROKE_WIDTHS.map((width) => {
          const isSelected = currentWidth === width
          return (
            <button
              key={width}
              type="button"
              aria-label={`${width}px stroke width`}
              title={`${width}px stroke width`}
              onClick={() => {
                setCurrentWidth(width)
                onUpdateStyle({ borderSize: width })
              }}
              style={{
                padding: '2px 6px',
                fontSize: 11,
                fontWeight: isSelected ? 600 : 400,
                borderRadius: 4,
                border: isSelected ? `1px solid ${THEME_TOKENS.colors.accent}` : '1px solid transparent',
                backgroundColor: isSelected ? THEME_TOKENS.colors.bgSurfaceHover : 'transparent',
                color: isSelected ? THEME_TOKENS.colors.textBright : THEME_TOKENS.colors.textSecondary,
                cursor: 'pointer'
              }}
            >
              {width}px
            </button>
          )
        })}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle }} />

      {/* Stroke Style Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {STROKE_STYLES.map((style) => {
          const isSelected = currentStyle === style
          return (
            <button
              key={style}
              type="button"
              aria-label={`${style} stroke style`}
              title={`${style.charAt(0).toUpperCase() + style.slice(1)} line`}
              onClick={() => {
                setCurrentStyle(style)
                onUpdateStyle({ borderStyle: style })
              }}
              style={{
                padding: '3px 6px',
                fontSize: 11,
                fontWeight: isSelected ? 600 : 400,
                borderRadius: 4,
                border: isSelected ? `1px solid ${THEME_TOKENS.colors.accent}` : '1px solid transparent',
                backgroundColor: isSelected ? THEME_TOKENS.colors.bgSurfaceHover : 'transparent',
                color: isSelected ? THEME_TOKENS.colors.textBright : THEME_TOKENS.colors.textSecondary,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 26,
                height: 22
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 18,
                  borderTop: style === 'solid' ? '2px solid currentColor' : '2px dashed currentColor'
                }}
              />
            </button>
          )
        })}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle }} />

      {/* Trash / Delete button */}
      <button
        type="button"
        aria-label="Delete drawing"
        title="Delete Drawing (Del)"
        onClick={onDelete}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          color: THEME_TOKENS.colors.textSecondary,
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = THEME_TOKENS.colors.bearish
          e.currentTarget.style.backgroundColor = 'rgba(242, 54, 69, 0.12)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = THEME_TOKENS.colors.textSecondary
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  )
}
