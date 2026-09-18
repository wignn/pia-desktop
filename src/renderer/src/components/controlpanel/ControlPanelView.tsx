import React, { useState, useEffect, useCallback } from 'react'
import { Plus, RotateCcw, X, Move, ChevronLeft, ChevronRight } from 'lucide-react'
import { DashboardWidget, WIDGET_CATALOG, WidgetType } from './types'
import { LiveTvWidget } from './widgets/LiveTvWidget'
import { MiniChartWidget } from './widgets/MiniChartWidget'
import { YieldCurveWidget } from './widgets/YieldCurveWidget'
import { SocialXWidget } from './widgets/SocialXWidget'
import { NewsWireWidget } from './widgets/NewsWireWidget'
import { DxyMacroWidget } from './widgets/DxyMacroWidget'
import { OrderBookWidget } from './widgets/OrderBookWidget'
import { CalendarWidget } from './widgets/CalendarWidget'
import { EnergyWidget } from './widgets/EnergyWidget'
import { useMarketStore } from '../../stores/useMarketStore'
import { resolveControlWidgetSymbol } from '../../utils/control-panel-helpers'

const STORAGE_KEY = 'pia_control_panel_widgets'

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'w_live_tv_1', type: 'live_tv', title: 'Live Financial TV Broadcast', colSpan: 6, minHeightPx: 330, config: { channelId: 'bloomberg_live' } },
  { id: 'w_chart_gold', type: 'mini_chart', title: 'XAUUSD (Spot Gold)', colSpan: 6, minHeightPx: 330, config: { symbol: 'XAUUSD', timeframe: '15m' } },
  { id: 'w_chart_btc', type: 'mini_chart', title: 'BTCUSDT (Bitcoin)', colSpan: 4, minHeightPx: 290, config: { symbol: 'BTCUSDT', timeframe: '15m' } },
  { id: 'w_yields', type: 'yield_curve', title: 'US Treasury Yields & 2s10s', colSpan: 4, minHeightPx: 290 },
  { id: 'w_dxy', type: 'dxy_macro', title: 'DXY Dollar Index & Major FX', colSpan: 4, minHeightPx: 290 },
  { id: 'w_news', type: 'breaking_news', title: 'Breaking Market Wire', colSpan: 4, minHeightPx: 280 },
  { id: 'w_social', type: 'social_x', title: 'X / Twitter Sentiment Radar', colSpan: 4, minHeightPx: 280 },
  { id: 'w_cal', type: 'economic_calendar', title: 'Economic Calendar Events', colSpan: 4, minHeightPx: 280 }
]

export const ControlPanelView: React.FC = () => {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed) && parsed.length > 0) return parsed
        }
      }
    } catch {
      // fallback
    }
    return DEFAULT_WIDGETS
  })

  const [isCatalogOpen, setIsCatalogOpen] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const activeSymbol = useMarketStore((s) => s.symbol)
  const symbols = useMarketStore((s) => s.symbols)
  const activeTimeframe = useMarketStore((s) => s.timeframe)

  // Auto-persist widgets to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets))
    } catch {
      // ignore
    }
  }, [widgets])

  // Remove widget
  const handleRemoveWidget = useCallback((id: string): void => {
    setWidgets((prev) => prev.filter((w) => w.id !== id))
  }, [])

  // Reset to default war room layout
  const handleResetLayout = useCallback((): void => {
    setWidgets(DEFAULT_WIDGETS)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  // Add new widget from catalog
  const handleAddWidget = useCallback((type: WidgetType): void => {
    const meta = WIDGET_CATALOG.find((c) => c.type === type)
    if (!meta) return

    const validatedSymbol = resolveControlWidgetSymbol(activeSymbol, symbols, 'XAUUSD')
    const config =
      type === 'mini_chart'
        ? { symbol: validatedSymbol, timeframe: activeTimeframe || '15m' }
        : type === 'order_book'
          ? { symbol: validatedSymbol }
          : undefined

    const newWidget: DashboardWidget = {
      id: `w_${type}_${Date.now()}`,
      type,
      title:
        type === 'mini_chart'
          ? `${validatedSymbol} Mini Chart`
          : type === 'order_book'
            ? `${validatedSymbol} Order Book`
            : meta.title,
      colSpan: meta.defaultColSpan,
      minHeightPx: meta.defaultMinHeight,
      config
    }

    setWidgets((prev) => [newWidget, ...prev])
    setIsCatalogOpen(false)
  }, [activeSymbol, symbols, activeTimeframe])

  // Change column span width (3 -> 4 -> 6 -> 8 -> 12 -> 3)
  const handleAdjustWidth = useCallback((id: string, delta: number): void => {
    const steps = [3, 4, 6, 8, 12]
    setWidgets((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w
        const currentIdx = steps.indexOf(w.colSpan)
        let nextIdx = currentIdx + delta
        if (nextIdx < 0) nextIdx = 0
        if (nextIdx >= steps.length) nextIdx = steps.length - 1
        return { ...w, colSpan: steps[nextIdx] }
      })
    )
  }, [])

  // Shift position left / right
  const handleShiftPosition = useCallback((index: number, direction: -1 | 1): void => {
    setWidgets((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const updated = [...prev]
      const [moved] = updated.splice(index, 1)
      updated.splice(target, 0, moved)
      return updated
    })
  }, [])

  // HTML5 Drag and drop reordering
  const handleDragStart = useCallback((e: React.DragEvent, index: number): void => {
    e.dataTransfer.setData('text/plain', String(index))
    e.dataTransfer.effectAllowed = 'move'
    setDraggedIndex(index)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex((prev) => (prev !== index ? index : prev))
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, index: number): void => {
    e.preventDefault()
    setWidgets((prev) => {
      const fromIndex = draggedIndex !== null ? draggedIndex : parseInt(e.dataTransfer.getData('text/plain'), 10)
      if (isNaN(fromIndex) || fromIndex === index || fromIndex < 0 || fromIndex >= prev.length) {
        return prev
      }
      const updated = [...prev]
      const [moved] = updated.splice(fromIndex, 1)
      updated.splice(index, 0, moved)
      return updated
    })

    setDraggedIndex(null)
    setDragOverIndex(null)
  }, [draggedIndex])

  // Render widget inner body based on type
  const renderWidgetContent = (w: DashboardWidget): React.ReactNode => {
    switch (w.type) {
      case 'live_tv':
        return (
          <LiveTvWidget
            channelId={w.config?.channelId}
            onUpdateChannel={(chId) => {
              setWidgets((prev) =>
                prev.map((item) => (item.id === w.id ? { ...item, config: { ...item.config, channelId: chId } } : item))
              )
            }}
          />
        )
      case 'mini_chart':
        return (
          <MiniChartWidget
            symbol={w.config?.symbol}
            timeframe={w.config?.timeframe}
            onUpdateConfig={(cfg) => {
              setWidgets((prev) =>
                prev.map((item) => (item.id === w.id ? { ...item, config: { ...item.config, ...cfg } } : item))
              )
            }}
          />
        )
      case 'yield_curve':
        return <YieldCurveWidget />
      case 'social_x':
        return <SocialXWidget />
      case 'breaking_news':
        return <NewsWireWidget />
      case 'dxy_macro':
        return <DxyMacroWidget />
      case 'order_book':
        return (
          <OrderBookWidget
            symbol={w.config?.symbol || resolveControlWidgetSymbol(activeSymbol, symbols, 'XAUUSD')}
          />
        )
      case 'economic_calendar':
        return <CalendarWidget />
      case 'energy_complex':
        return <EnergyWidget />
      default:
        return <div style={{ padding: 20, color: '#787b86' }}>Widget content</div>
    }
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#0d111a',
        color: '#d1d4dc',
        overflow: 'hidden'
      }}
    >
      {/* Top War Room Control Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          backgroundColor: '#131722',
          borderBottom: '1px solid #2a2e39',
          gap: 12,
          flexShrink: 0,
          zIndex: 20
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#089981', boxShadow: '0 0 8px #089981' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', letterSpacing: '0.02em' }}>
              CONTROL PANEL & WAR ROOM
            </span>
          </div>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, backgroundColor: '#1e222d', color: '#787b86', border: '1px solid #2a2e39' }}>
            {widgets.length} Widgets Active
          </span>
          <span style={{ fontSize: 10, color: '#787b86', display: 'none' }} className="sm-show">
            Drag header to reorder • Use -/+ to resize width
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setIsCatalogOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 4,
              backgroundColor: '#2962ff',
              color: '#ffffff',
              border: 'none',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.12s'
            }}
          >
            <Plus size={14} />
            <span>Add Widget</span>
          </button>

          <button
            type="button"
            onClick={handleResetLayout}
            title="Reset to default financial dashboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 4,
              backgroundColor: '#1e222d',
              color: '#d1d4dc',
              border: '1px solid #2a2e39',
              fontSize: 11,
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={13} />
            <span>Reset Layout</span>
          </button>
        </div>
      </div>

      {/* Main Responsive 12-Column Drag Grid Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gap: 12,
          alignContent: 'start'
        }}
      >
        {widgets.map((w, index) => {
          const isDragging = draggedIndex === index
          const isDragOver = dragOverIndex === index

          return (
            <div
              key={w.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={() => {
                setDraggedIndex(null)
                setDragOverIndex(null)
              }}
              style={{
                gridColumn: `span ${Math.min(w.colSpan, 12)}`,
                minHeight: w.minHeightPx || 280,
                backgroundColor: '#131722',
                border: isDragOver
                  ? '2px dashed #2962ff'
                  : '1px solid #2a2e39',
                borderRadius: 6,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                opacity: isDragging ? 0.4 : 1,
                transition: 'border-color 0.15s, opacity 0.15s',
                boxShadow: '0 4px 16px rgba(0,0,0,0.35)'
              }}
            >
              {/* Card Header (Drag Handle + Controls) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  backgroundColor: '#181d28',
                  borderBottom: '1px solid #2a2e39',
                  cursor: 'grab',
                  userSelect: 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Move size={12} color="#787b86" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#ffffff' }}>{w.title}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {/* Position shift buttons (1-click move) */}
                  <button
                    type="button"
                    onClick={() => handleShiftPosition(index, -1)}
                    disabled={index === 0}
                    title="Move widget position left / earlier"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 2,
                      backgroundColor: '#1e222d',
                      border: '1px solid #2a2e39',
                      color: index === 0 ? '#444955' : '#089981',
                      cursor: index === 0 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      fontSize: 10
                    }}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShiftPosition(index, 1)}
                    disabled={index === widgets.length - 1}
                    title="Move widget position right / later"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 2,
                      backgroundColor: '#1e222d',
                      border: '1px solid #2a2e39',
                      color: index === widgets.length - 1 ? '#444955' : '#089981',
                      cursor: index === widgets.length - 1 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      fontSize: 10
                    }}
                  >
                    ▶
                  </button>

                  <div style={{ width: 1, height: 12, backgroundColor: '#2a2e39', margin: '0 2px' }} />

                  {/* Width adjust buttons */}
                  <span style={{ fontSize: 9, color: '#787b86', marginRight: 2 }}>{w.colSpan}/12 col</span>
                  <button
                    type="button"
                    onClick={() => handleAdjustWidth(w.id, -1)}
                    title="Narrower"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 2,
                      backgroundColor: '#1e222d',
                      border: '1px solid #2a2e39',
                      color: '#d1d4dc',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0
                    }}
                  >
                    <ChevronLeft size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdjustWidth(w.id, 1)}
                    title="Wider"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 2,
                      backgroundColor: '#1e222d',
                      border: '1px solid #2a2e39',
                      color: '#d1d4dc',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0
                    }}
                  >
                    <ChevronRight size={11} />
                  </button>

                  <div style={{ width: 1, height: 12, backgroundColor: '#2a2e39', margin: '0 2px' }} />

                  {/* Close Widget */}
                  <button
                    type="button"
                    onClick={() => handleRemoveWidget(w.id)}
                    title="Remove Widget"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 2,
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#787b86',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#f23645')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#787b86')}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Card Body */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  position: 'relative',
                  pointerEvents: draggedIndex !== null ? 'none' : 'auto'
                }}
              >
                {renderWidgetContent(w)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add Widget Catalog Modal */}
      {isCatalogOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setIsCatalogOpen(false)}
        >
          <div
            style={{
              width: 580,
              maxHeight: '80vh',
              backgroundColor: '#1e222d',
              border: '1px solid #2a2e39',
              borderRadius: 8,
              boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid #2a2e39'
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>Add Financial Widget</span>
              <button
                type="button"
                onClick={() => setIsCatalogOpen(false)}
                style={{ background: 'none', border: 'none', color: '#787b86', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {WIDGET_CATALOG.map((cat) => (
                <div
                  key={cat.type}
                  onClick={() => handleAddWidget(cat.type)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    backgroundColor: '#131722',
                    border: '1px solid #2a2e39',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.12s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.12)'
                    e.currentTarget.style.borderColor = '#2962ff'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#131722'
                    e.currentTarget.style.borderColor = '#2a2e39'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20 }}>{cat.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>{cat.title}</div>
                      <div style={{ fontSize: 11, color: '#787b86', marginTop: 2 }}>{cat.description}</div>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#2962ff',
                      backgroundColor: 'rgba(41, 98, 255, 0.15)',
                      padding: '3px 8px',
                      borderRadius: 3
                    }}
                  >
                    {cat.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default ControlPanelView
