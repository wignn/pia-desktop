import React, { useState, useRef, useEffect } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { useChartStore } from '../../stores/useChartStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useLayoutStore } from '../../stores/useLayoutStore'
import { useTabStore } from '../../stores/useTabStore'
import { THEME_TOKENS } from '../../theme/tokens'
import { TIMEFRAMES, type Timeframe } from '@shared/types'
import { SymbolLogo } from '../common/SymbolLogo'

export const TopToolbar: React.FC = () => {
  const symbol = useMarketStore((state) => state.symbol)
  const timeframe = useMarketStore((state) => state.timeframe)
  const setTimeframe = useMarketStore((state) => state.setTimeframe)
  const quote = useMarketStore((state) => (state.symbol ? state.prices[state.symbol] : undefined))
  const symInfo = useMarketStore((state) =>
    state.symbol ? state.symbols.find((s) => s.symbol === state.symbol) : undefined
  )

  const {
    chartType,
    setChartType,
    activeIndicators,
    clearAllDrawings,
    isReplaying,
    setReplaying,
    triggerSnapshot,
    snapshotToast
  } = useChartStore()

  const { theme, toggleTheme, setSymbolSearchOpen, setIndicatorModalOpen, setSettingsModalOpen } =
    useWorkspaceStore()
  const { activeLayout, layouts, saveCurrentLayout, loadLayoutById } = useLayoutStore()
  const { openHubInNewTab, openMacroMapsInNewTab, openControlPanelInNewTab } = useTabStore()

  // Dropdown states
  const [isMainMenuOpen, setIsMainMenuOpen] = useState(false)
  const [isChartTypeMenuOpen, setIsChartTypeMenuOpen] = useState(false)
  const [isTimeframeMenuOpen, setIsTimeframeMenuOpen] = useState(false)
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false)
  const [saveToast, setSaveToast] = useState(false)

  const menuRef = useRef<HTMLDivElement>(null)

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMainMenuOpen(false)
        setIsChartTypeMenuOpen(false)
        setIsTimeframeMenuOpen(false)
        setIsLayoutMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentPrice = quote?.price
  const priceChange24h = quote?.change24hPercent ?? 0
  const isUp = priceChange24h >= 0

  const handleSave = async (): Promise<void> => {
    await saveCurrentLayout()
    setSaveToast(true)
    setTimeout(() => setSaveToast(false), 2000)
  }

  const handleSaveAs = async (): Promise<void> => {
    const name = prompt(
      'Enter layout name:',
      activeLayout ? `${activeLayout.name} (Copy)` : 'Custom Layout'
    )
    if (name && name.trim()) {
      await saveCurrentLayout(name.trim())
      setSaveToast(true)
      setTimeout(() => setSaveToast(false), 2000)
    }
    setIsLayoutMenuOpen(false)
  }

  const toggleFullscreen = (): void => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  // Common quick timeframes shown directly on the toolbar
  const pinnedTimeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d']

  return (
    <div
      ref={menuRef}
      style={{
        height: THEME_TOKENS.dimensions.topToolbarHeight,
        minHeight: THEME_TOKENS.dimensions.topToolbarHeight,
        backgroundColor: THEME_TOKENS.colors.bgApp,
        borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 6px',
        gap: 2,
        zIndex: 30,
        position: 'relative',
        userSelect: 'none'
      }}
    >
      {/* 1. Hamburger / Profile Menu Button (Exact TradingView 3-bar icon) */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setIsMainMenuOpen(!isMainMenuOpen)}
          className={`tv-btn ${isMainMenuOpen ? 'active' : ''}`}
          style={{ width: 28, height: 28, padding: 0 }}
          title="Main Menu"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {isMainMenuOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              width: 240,
              backgroundColor: THEME_TOKENS.colors.bgSurface,
              border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
              borderRadius: 6,
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7)',
              zIndex: 100,
              padding: '6px 0',
              fontSize: 12
            }}
          >
            <div style={{ padding: '8px 14px', borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
              <div style={{ fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>PIA Terminal Pro</div>
              <div style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>v2.0 · TradingView Edition</div>
            </div>

            <div
              onClick={() => { setIsMainMenuOpen(false); openHubInNewTab() }}
              className="tv-btn"
              style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 14px', borderRadius: 0, height: 'auto', gap: 10 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
              <span>Supercharts Hub</span>
            </div>

            <div
              onClick={() => { setIsMainMenuOpen(false); openMacroMapsInNewTab() }}
              className="tv-btn"
              style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 14px', borderRadius: 0, height: 'auto', gap: 10 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
              <span>Macro Global Maps</span>
            </div>

            <div
              onClick={() => { setIsMainMenuOpen(false); openControlPanelInNewTab() }}
              className="tv-btn"
              style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 14px', borderRadius: 0, height: 'auto', gap: 10 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
              <span>Trading & Analytics Panel</span>
            </div>

            <div style={{ height: 1, backgroundColor: THEME_TOKENS.colors.borderSubtle, margin: '4px 0' }} />

            <div
              onClick={() => { toggleTheme(); setIsMainMenuOpen(false) }}
              className="tv-btn"
              style={{ width: '100%', justifyContent: 'space-between', padding: '8px 14px', borderRadius: 0, height: 'auto' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                <span>Dark Color Theme</span>
              </span>
              <span style={{ fontSize: 11, color: THEME_TOKENS.colors.accent, fontWeight: 600 }}>{theme === 'dark' ? 'ON' : 'OFF'}</span>
            </div>

            <div
              onClick={() => { setSettingsModalOpen(true); setIsMainMenuOpen(false) }}
              className="tv-btn"
              style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 14px', borderRadius: 0, height: 'auto', gap: 10 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
              <span>Settings & API Keys</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle, margin: '0 2px' }} />

      {/* 2. Symbol Search Button (Exact TradingView bold symbol pill) */}
      <button
        type="button"
        onClick={() => setSymbolSearchOpen(true)}
        className="tv-btn"
        style={{
          height: 28,
          padding: '0 6px',
          fontWeight: 700,
          fontSize: 13,
          color: THEME_TOKENS.colors.textBright,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
        title="Search Symbol (Ctrl+K)"
      >
        <SymbolLogo symbol={symbol} size={18} />
        <span style={{ letterSpacing: '0.2px' }}>{symbol || 'Select'}</span>
        {symInfo?.category && (
          <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary, textTransform: 'uppercase', fontWeight: 600 }}>
            {symInfo.category}
          </span>
        )}
        {currentPrice !== undefined && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              fontFamily: THEME_TOKENS.typography.fontMono,
              color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish,
              marginLeft: 2
            }}
          >
            {currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        )}
      </button>

      {/* 3. Compare / Add Symbol button (+) */}
      <button
        type="button"
        onClick={() => setSymbolSearchOpen(true)}
        className="tv-btn"
        style={{ width: 28, height: 28, padding: 0 }}
        title="Compare or Add Symbol"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle, margin: '0 2px' }} />

      {/* 4. Timeframe Selector (TradingView style pills + dropdown arrow) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {pinnedTimeframes.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => setTimeframe(tf)}
            className={`tv-btn ${timeframe === tf ? 'active' : ''}`}
            style={{
              fontSize: 12,
              height: 28,
              padding: '0 6px',
              minWidth: 26,
              color: timeframe === tf ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textPrimary
            }}
          >
            {tf}
          </button>
        ))}

        {/* Dropdown for all timeframes */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setIsTimeframeMenuOpen(!isTimeframeMenuOpen)}
            className={`tv-btn ${isTimeframeMenuOpen ? 'active' : ''}`}
            style={{ width: 20, height: 28, padding: 0 }}
            title="More Intervals"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {isTimeframeMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                width: 130,
                backgroundColor: THEME_TOKENS.colors.bgSurface,
                border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
                borderRadius: 4,
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                zIndex: 100,
                padding: '4px 0'
              }}
            >
              {TIMEFRAMES.map((tf) => (
                <div
                  key={tf}
                  onClick={() => { setTimeframe(tf); setIsTimeframeMenuOpen(false) }}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: timeframe === tf ? THEME_TOKENS.colors.bgActive : 'transparent',
                    color: timeframe === tf ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textPrimary
                  }}
                  onMouseEnter={(e) => {
                    if (timeframe !== tf) e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                  }}
                  onMouseLeave={(e) => {
                    if (timeframe !== tf) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <span>{tf.toUpperCase()}</span>
                  {timeframe === tf && <span style={{ fontSize: 10 }}>✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle, margin: '0 2px' }} />

      {/* 5. Chart Style Switcher (Dropdown with Candles Icon + down arrow) */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setIsChartTypeMenuOpen(!isChartTypeMenuOpen)}
          className={`tv-btn ${isChartTypeMenuOpen ? 'active' : ''}`}
          style={{ height: 28, padding: '0 4px', display: 'flex', alignItems: 'center', gap: 3 }}
          title="Chart Type"
        >
          {chartType === 'candle_solid' && (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <rect x="9" y="5" width="6" height="14" rx="1" />
              <line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" strokeWidth="2" />
              <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="2" />
            </svg>
          )}
          {chartType === 'candle_stroke' && (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="5" width="6" height="14" rx="1" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          )}
          {(chartType === 'line' || chartType === 'area') && (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 17 9 11 13 15 21 7" />
            </svg>
          )}
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {isChartTypeMenuOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              width: 160,
              backgroundColor: THEME_TOKENS.colors.bgSurface,
              border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
              borderRadius: 4,
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              zIndex: 100,
              padding: '4px 0'
            }}
          >
            {[
              { id: 'candle_solid', label: 'Candles (Solid)' },
              { id: 'candle_stroke', label: 'Hollow Candles' },
              { id: 'line', label: 'Line' },
              { id: 'area', label: 'Area' }
            ].map((style) => (
              <div
                key={style.id}
                onClick={() => { setChartType(style.id as any); setIsChartTypeMenuOpen(false) }}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: chartType === style.id ? THEME_TOKENS.colors.bgActive : 'transparent',
                  color: chartType === style.id ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textPrimary
                }}
                onMouseEnter={(e) => {
                  if (chartType !== style.id) e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                }}
                onMouseLeave={(e) => {
                  if (chartType !== style.id) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <span>{style.label}</span>
                {chartType === style.id && <span style={{ fontSize: 10 }}>✓</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle, margin: '0 2px' }} />

      {/* 6. Indicators Button (Exact TradingView fx icon) */}
      <button
        type="button"
        onClick={() => setIndicatorModalOpen(true)}
        className="tv-btn"
        style={{ height: 28, fontSize: 12, padding: '0 6px', display: 'flex', alignItems: 'center', gap: 5 }}
        title="Indicators, Metrics & Strategies (Alt+I)"
      >
        <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: 13, color: THEME_TOKENS.colors.accent }}>
          fx
        </span>
        <span>Indicators</span>
        {activeIndicators.length > 0 && (
          <span
            style={{
              backgroundColor: 'rgba(41, 98, 255, 0.15)',
              color: THEME_TOKENS.colors.accent,
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 8
            }}
          >
            {activeIndicators.length}
          </span>
        )}
      </button>

      {/* 7. Alerts Button (Clock icon) */}
      <button
        type="button"
        onClick={() => useWorkspaceStore.getState().setActiveTab('alerts')}
        className="tv-btn"
        style={{ height: 28, fontSize: 12, padding: '0 6px', display: 'flex', alignItems: 'center', gap: 5 }}
        title="Create Alert (Alt+A)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="13" r="8" />
          <polyline points="12 9 12 13 15 15" />
          <path d="M5 3L2 6" />
          <path d="M22 6L19 3" />
        </svg>
        <span>Alert</span>
      </button>

      {/* 8. Bar Replay Button */}
      <button
        type="button"
        onClick={() => setReplaying(!isReplaying)}
        className={`tv-btn ${isReplaying ? 'active' : ''}`}
        style={{
          height: 28,
          fontSize: 12,
          padding: '0 6px',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          color: isReplaying ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textPrimary,
          backgroundColor: isReplaying ? 'rgba(41, 98, 255, 0.15)' : 'transparent',
          fontWeight: isReplaying ? 600 : 500
        }}
        title="Bar Replay Simulation"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11 19 2 12 11 5 11 19" fill={isReplaying ? 'currentColor' : 'none'} />
          <polygon points="22 19 13 12 22 5 22 19" fill={isReplaying ? 'currentColor' : 'none'} />
        </svg>
        <span>Replay</span>
      </button>

      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle, margin: '0 2px' }} />

      {/* 9. Undo / Redo Buttons */}
      <button
        type="button"
        onClick={() => clearAllDrawings()}
        className="tv-btn"
        style={{ width: 26, height: 28, padding: 0 }}
        title="Undo / Clear Drawings"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>

      <button
        type="button"
        className="tv-btn"
        disabled
        style={{ width: 26, height: 28, padding: 0, opacity: 0.3 }}
        title="Redo"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>

      <div style={{ flex: 1 }} />

      {/* 10. Multi-chart Layout Split Button (Grid icon) */}
      <button
        type="button"
        className="tv-btn"
        style={{ width: 28, height: 28, padding: 0 }}
        title="Select Layout Grid"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="12" y1="3" x2="12" y2="21" />
        </svg>
      </button>

      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle, margin: '0 2px' }} />

      {/* 11. Cloud Layout Save Pill (TradingView Cloud Icon + Save) */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleSave}
          className="tv-btn"
          style={{
            height: 28,
            fontSize: 12,
            padding: '0 6px',
            display: 'flex',
            alignItems: 'center',
            gap: 5
          }}
          title="Save Layout (Ctrl+S)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={saveToast ? THEME_TOKENS.colors.bullish : 'currentColor'}
            strokeWidth="2"
          >
            <path d="M19 16.9A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
            <polyline points="16 16 12 12 8 16" />
            <line x1="12" y1="12" x2="12" y2="21" />
          </svg>
          <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {saveToast ? 'Saved!' : activeLayout?.name || 'Unnamed'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIsLayoutMenuOpen(!isLayoutMenuOpen)}
          className={`tv-btn ${isLayoutMenuOpen ? 'active' : ''}`}
          style={{ width: 16, height: 28, padding: 0 }}
          title="Layout Options"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {isLayoutMenuOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              width: 200,
              backgroundColor: THEME_TOKENS.colors.bgSurface,
              border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
              borderRadius: 4,
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              zIndex: 100,
              padding: '4px 0'
            }}
          >
            <div onClick={handleSave} className="tv-btn" style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 12px', borderRadius: 0, height: 'auto' }}>
              Save Layout
            </div>
            <div onClick={handleSaveAs} className="tv-btn" style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 12px', borderRadius: 0, height: 'auto' }}>
              Save As New Layout...
            </div>
            <div onClick={() => { setIsLayoutMenuOpen(false); openHubInNewTab() }} className="tv-btn" style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 12px', borderRadius: 0, height: 'auto', color: THEME_TOKENS.colors.accent }}>
              Manage Layouts in Hub
            </div>
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle, margin: '0 2px' }} />

      {/* 12. Quick Search (Magnifier) */}
      <button
        type="button"
        onClick={() => setSymbolSearchOpen(true)}
        className="tv-btn"
        style={{ width: 28, height: 28, padding: 0 }}
        title="Quick Search"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {/* 13. Chart Settings (Gear Icon) */}
      <button
        type="button"
        onClick={() => setSettingsModalOpen(true)}
        className="tv-btn"
        style={{ width: 28, height: 28, padding: 0 }}
        title="Chart Properties / Settings"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* 14. Fullscreen Button */}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="tv-btn"
        style={{ width: 28, height: 28, padding: 0 }}
        title="Full Screen Mode (F11)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      </button>

      {/* 15. Camera / Snapshot Button */}
      <button
        type="button"
        onClick={triggerSnapshot}
        className="tv-btn"
        style={{
          width: 28,
          height: 28,
          padding: 0,
          color: snapshotToast ? THEME_TOKENS.colors.bullish : 'currentColor'
        }}
        title="Take a Snapshot (Alt+S)"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </button>

      {/* 16. Publish / Action Button (TradingView signature blue pill button) */}
      <button
        type="button"
        onClick={handleSave}
        style={{
          height: 26,
          backgroundColor: THEME_TOKENS.colors.accent,
          color: '#ffffff',
          border: 'none',
          borderRadius: 4,
          padding: '0 12px',
          fontWeight: 600,
          fontSize: 12,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginLeft: 4,
          transition: 'background 0.1s ease'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.accentHover }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.accent }}
        title="Save & Share Chart"
      >
        <span>Publish</span>
      </button>
    </div>
  )
}
