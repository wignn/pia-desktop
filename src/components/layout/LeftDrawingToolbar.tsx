import React, { useState, useEffect } from 'react'
import { useChartStore, type DrawingToolType } from '../../stores/useChartStore'
import { THEME_TOKENS } from '../../theme/tokens'

interface SubtoolItem {
  id: DrawingToolType
  title: string
  icon?: React.ReactNode
}

interface ToolGroup {
  id: string
  defaultToolId: DrawingToolType
  title: string
  icon: React.ReactNode
  subtools?: SubtoolItem[]
}

export const LeftDrawingToolbar: React.FC = () => {
  const {
    activeTool,
    setActiveTool,
    magnetMode,
    toggleMagnetMode,
    stayInDrawingMode,
    toggleStayInDrawingMode,
    isDrawingsLocked,
    toggleLockDrawings,
    isDrawingsHidden,
    toggleHideDrawings,
    clearAllDrawings
  } = useChartStore()

  const [activeFlyout, setActiveFlyout] = useState<string | null>(null)
  const [isStarred, setIsStarred] = useState(false)
  const [selectedTools, setSelectedTools] = useState<Record<string, DrawingToolType>>({
    cursor_group: 'cursor',
    lines_group: 'segment',
    gann_group: 'fibonacciLine',
    shapes_group: 'brush',
    text_group: 'simpleAnnotation',
    prediction_group: 'measure'
  })

  // Close flyout on click outside
  useEffect(() => {
    if (!activeFlyout) return
    const handleClickOutside = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      if (!target?.closest('.tv-drawing-group')) {
        setActiveFlyout(null)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [activeFlyout])

  // Primary TradingView Tool Groups
  const TOOL_GROUPS: ToolGroup[] = [
    {
      id: 'cursor_group',
      defaultToolId: 'cursor',
      title: 'Crosshair / Pointer (Esc)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="2" x2="12" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      )
    },
    {
      id: 'lines_group',
      defaultToolId: 'segment',
      title: 'Trend Line Tools',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="5" cy="19" r="2" />
          <circle cx="19" cy="5" r="2" />
          <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" />
        </svg>
      ),
      subtools: [
        { id: 'segment', title: 'Trend Line' },
        { id: 'rayLine', title: 'Ray Line' },
        { id: 'straightLine', title: 'Extended Line' },
        { id: 'horizontalStraightLine', title: 'Horizontal Line' },
        { id: 'horizontalRayLine', title: 'Horizontal Ray' },
        { id: 'horizontalSegment', title: 'Horizontal Segment' },
        { id: 'verticalStraightLine', title: 'Vertical Line' },
        { id: 'verticalRayLine', title: 'Vertical Ray' }
      ]
    },
    {
      id: 'gann_group',
      defaultToolId: 'fibonacciLine',
      title: 'Gann and Fibonacci Tools',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="4" x2="21" y2="4" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="3" y1="20" x2="21" y2="20" />
          <line x1="4" y1="4" x2="20" y2="20" strokeDasharray="2 2" />
        </svg>
      ),
      subtools: [
        { id: 'fibonacciLine', title: 'Fib Retracement' },
        { id: 'parallelStraightLine', title: 'Parallel Channel' },
        { id: 'priceChannelLine', title: 'Price Channel' }
      ]
    },
    {
      id: 'shapes_group',
      defaultToolId: 'brush',
      title: 'Geometric Shapes',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <path d="M2 2l7.586 7.586" />
          <circle cx="11" cy="11" r="2" />
        </svg>
      ),
      subtools: [
        { id: 'brush', title: 'Brush (Freehand)' },
        { id: 'rect', title: 'Rectangle' },
        { id: 'circle', title: 'Circle' }
      ]
    },
    {
      id: 'text_group',
      defaultToolId: 'simpleAnnotation',
      title: 'Annotation Tools (Text & Tags)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 7 4 4 20 4 20 7" />
          <line x1="12" y1="4" x2="12" y2="20" />
          <line x1="8" y1="20" x2="16" y2="20" />
        </svg>
      ),
      subtools: [
        { id: 'simpleAnnotation', title: 'Text Note' },
        { id: 'simpleTag', title: 'Price Tag' }
      ]
    },
    {
      id: 'prediction_group',
      defaultToolId: 'measure',
      title: 'Prediction and Measurement',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="4" width="16" height="8" fill="rgba(8, 153, 129, 0.2)" stroke="#089981" />
          <rect x="4" y="12" width="16" height="8" fill="rgba(242, 54, 69, 0.2)" stroke="#f23645" />
        </svg>
      ),
      subtools: [
        { id: 'measure', title: 'Measure / Ruler' },
        { id: 'priceLine', title: 'Price Line' }
      ]
    }
  ]

  const handleToolSelect = (groupId: string, toolId: DrawingToolType): void => {
    setSelectedTools((prev) => ({ ...prev, [groupId]: toolId }))
    setActiveTool(toolId)
    setActiveFlyout(null)
  }

  // ponytail: Drawing toolbar layout; upgrade to user-draggable floating favorite toolbar when favorites customization UI is requested.
  return (
    <div
      style={{
        width: THEME_TOKENS.dimensions.leftToolbarWidth,
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgApp,
        borderRight: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '4px 0',
        gap: 2,
        zIndex: 25,
        userSelect: 'none'
      }}
    >
      {/* Tool Groups */}
      {TOOL_GROUPS.map((group) => {
        const currentToolId = selectedTools[group.id] || group.defaultToolId
        const isGroupActive = activeTool === currentToolId

        return (
          <div key={group.id} className="tv-drawing-group" style={{ position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                position: 'relative'
              }}
            >
              {/* Main Tool Button */}
              <button
                type="button"
                onClick={() => handleToolSelect(group.id, currentToolId)}
                onContextMenu={(e) => {
                  if (group.subtools && group.subtools.length > 1) {
                    e.preventDefault()
                    setActiveFlyout(activeFlyout === group.id ? null : group.id)
                  }
                }}
                className={`tv-btn ${isGroupActive ? 'active' : ''}`}
                title={group.title}
                style={{
                  width: 32,
                  height: 30,
                  padding: 0,
                  position: 'relative',
                  borderRadius: 4,
                  color: isGroupActive ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textPrimary,
                  backgroundColor: isGroupActive ? 'rgba(41, 98, 255, 0.15)' : 'transparent'
                }}
              >
                {group.icon}

                {/* Corner triangle for flyout */}
                {group.subtools && group.subtools.length > 1 && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveFlyout(activeFlyout === group.id ? null : group.id)
                    }}
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: 14,
                      height: 14,
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'flex-end',
                      padding: '0 2px 2px 0',
                      cursor: 'pointer'
                    }}
                    title="More tools in group (or right-click)"
                  >
                    <span
                      style={{
                        width: 0,
                        height: 0,
                        borderStyle: 'solid',
                        borderWidth: '0 0 5px 5px',
                        borderColor: `transparent transparent ${isGroupActive ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textMuted} transparent`
                      }}
                    />
                  </span>
                )}
              </button>
            </div>

            {/* Flyout Submenu */}
            {activeFlyout === group.id && group.subtools && (
              <div
                style={{
                  position: 'absolute',
                  left: '100%',
                  top: 0,
                  marginLeft: 4,
                  width: 180,
                  backgroundColor: THEME_TOKENS.colors.bgSurface,
                  border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
                  borderRadius: 4,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  zIndex: 100,
                  padding: '4px 0'
                }}
              >
                {group.subtools.map((sub) => (
                  <div
                    key={sub.id}
                    onClick={() => handleToolSelect(group.id, sub.id)}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: currentToolId === sub.id ? THEME_TOKENS.colors.bgActive : 'transparent',
                      color: currentToolId === sub.id ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textPrimary
                    }}
                    onMouseEnter={(e) => {
                      if (currentToolId !== sub.id) e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                    }}
                    onMouseLeave={(e) => {
                      if (currentToolId !== sub.id) e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    <span>{sub.title}</span>
                    {currentToolId === sub.id && <span style={{ fontSize: 10 }}>✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div style={{ width: 22, height: 1, backgroundColor: THEME_TOKENS.colors.borderSubtle, margin: '2px 0' }} />

      {/* Measure / Ruler Tool */}
      <button
        type="button"
        onClick={() => setActiveTool(activeTool === 'measure' ? 'cursor' : 'measure')}
        className={`tv-btn ${activeTool === 'measure' ? 'active' : ''}`}
        title="Measure (Shift+Click on Chart)"
        style={{
          width: 32,
          height: 30,
          padding: 0,
          color: activeTool === 'measure' ? THEME_TOKENS.colors.accent : 'currentColor',
          backgroundColor: activeTool === 'measure' ? 'rgba(41, 98, 255, 0.15)' : 'transparent'
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.3 15.3l-6.6 6.6c-.4.4-1 .4-1.4 0l-11-11c-.4-.4-.4-1 0-1.4l6.6-6.6c.4-.4 1-.4 1.4 0l11 11c.4.4.4 1 0 1.4z" />
          <line x1="8.5" y1="4.5" x2="10.5" y2="6.5" />
          <line x1="12" y1="8" x2="14" y2="10" />
          <line x1="15.5" y1="11.5" x2="17.5" y2="13.5" />
        </svg>
      </button>

      {/* Magnet Mode */}
      <button
        type="button"
        onClick={toggleMagnetMode}
        className={`tv-btn ${magnetMode ? 'active' : ''}`}
        title={`Magnet Mode (${magnetMode ? 'Active - Snap to OHLC' : 'Inactive'})`}
        style={{
          width: 32,
          height: 30,
          padding: 0,
          color: magnetMode ? THEME_TOKENS.colors.accent : 'currentColor',
          backgroundColor: magnetMode ? 'rgba(41, 98, 255, 0.15)' : 'transparent'
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
          <path d="M7 10v4" />
          <path d="M17 10v4" />
          <line x1="7" y1="4" x2="7" y2="7" />
          <line x1="17" y1="4" x2="17" y2="7" />
        </svg>
      </button>

      {/* Stay in Drawing Mode */}
      <button
        type="button"
        onClick={toggleStayInDrawingMode}
        className={`tv-btn ${stayInDrawingMode ? 'active' : ''}`}
        title={`Stay in Drawing Mode (${stayInDrawingMode ? 'ON' : 'OFF'})`}
        style={{
          width: 32,
          height: 30,
          padding: 0,
          color: stayInDrawingMode ? THEME_TOKENS.colors.accent : 'currentColor',
          backgroundColor: stayInDrawingMode ? 'rgba(41, 98, 255, 0.15)' : 'transparent'
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
      </button>

      {/* Lock All Drawings */}
      <button
        type="button"
        onClick={toggleLockDrawings}
        className={`tv-btn ${isDrawingsLocked ? 'active' : ''}`}
        title={isDrawingsLocked ? 'Unlock All Drawings' : 'Lock All Drawings'}
        style={{
          width: 32,
          height: 30,
          padding: 0,
          color: isDrawingsLocked ? THEME_TOKENS.colors.accent : 'currentColor',
          backgroundColor: isDrawingsLocked ? 'rgba(41, 98, 255, 0.15)' : 'transparent'
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d={isDrawingsLocked ? 'M7 11V7a5 5 0 0 1 10 0v4' : 'M7 11V7a5 5 0 0 1 9.9-1'} />
        </svg>
      </button>

      {/* Hide All Drawings */}
      <button
        type="button"
        onClick={toggleHideDrawings}
        className={`tv-btn ${isDrawingsHidden ? 'active' : ''}`}
        title={isDrawingsHidden ? 'Show All Drawings' : 'Hide All Drawings'}
        style={{
          width: 32,
          height: 30,
          padding: 0,
          color: isDrawingsHidden ? THEME_TOKENS.colors.accent : 'currentColor',
          backgroundColor: isDrawingsHidden ? 'rgba(41, 98, 255, 0.15)' : 'transparent'
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
          {isDrawingsHidden && <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" />}
        </svg>
      </button>

      {/* Remove / Trash Bin */}
      <button
        type="button"
        onClick={clearAllDrawings}
        className="tv-btn"
        title="Remove All Drawings"
        style={{ width: 32, height: 30, padding: 0, color: THEME_TOKENS.colors.textMuted }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>

      <div style={{ flex: 1 }} />

      {/* Favorites Star */}
      <button
        type="button"
        onClick={() => setIsStarred(!isStarred)}
        className={`tv-btn ${isStarred ? 'active' : ''}`}
        title="Favorite Drawing Tools Toolbar"
        style={{
          width: 32,
          height: 30,
          padding: 0,
          color: isStarred ? '#ffb703' : THEME_TOKENS.colors.textMuted
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={isStarred ? '#ffb703' : 'none'} stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </button>
    </div>
  )
}
