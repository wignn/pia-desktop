import React, { useState } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { useChartStore } from '../../stores/useChartStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useLayoutStore } from '../../stores/useLayoutStore'
import { useTabStore } from '../../stores/useTabStore'
import { THEME_TOKENS } from '../../theme/tokens'
import type { Timeframe } from '@shared/types'

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']

export const TopToolbar: React.FC = () => {
  const { symbol, timeframe, setTimeframe, prices } = useMarketStore()
  const { chartType, setChartType, activeIndicators, clearAllDrawings, isReplaying, setReplaying } =
    useChartStore()
  const { theme, toggleTheme, setSymbolSearchOpen, setIndicatorModalOpen, setSettingsModalOpen } =
    useWorkspaceStore()
  const { activeLayout, layouts, saveCurrentLayout, loadLayoutById } = useLayoutStore()
  const { openHubInNewTab } = useTabStore()

  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false)
  const [saveToast, setSaveToast] = useState(false)

  const currentPrice = symbol ? prices[symbol]?.price : undefined
  const priceChange24h = symbol ? prices[symbol]?.change24hPercent ?? 0 : 0
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

  return (
    <div
      style={{
        height: THEME_TOKENS.dimensions.topToolbarHeight,
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 8,
        zIndex: 20,
        position: 'relative'
      }}
    >
      {/* Brand / Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            backgroundColor: THEME_TOKENS.colors.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: 0.5
          }}
        >
          P
        </div>
        <span
          style={{
            fontWeight: 700,
            fontSize: 13,
            color: THEME_TOKENS.colors.textBright,
            letterSpacing: 0.5
          }}
        >
          PIA
        </span>
      </div>

      <div style={{ width: 1, height: 20, backgroundColor: THEME_TOKENS.colors.borderMedium }} />

      {/* Symbol Search Button */}
      <button
        type="button"
        onClick={() => setSymbolSearchOpen(true)}
        className="tv-btn"
        style={{
          backgroundColor: THEME_TOKENS.colors.bgSurfaceHover,
          border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
          padding: '4px 10px',
          fontWeight: 700,
          fontSize: 13,
          color: THEME_TOKENS.colors.textBright,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}
        title="Search Symbol (Ctrl+K)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span>{symbol}</span>
        {currentPrice !== undefined && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish
            }}
          >
            {currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        )}
      </button>

      <div style={{ width: 1, height: 20, backgroundColor: THEME_TOKENS.colors.borderMedium }} />

      {/* Timeframe Selector Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => setTimeframe(tf)}
            className={`tv-btn ${timeframe === tf ? 'active' : ''}`}
            style={{ fontSize: 12, padding: '3px 7px', minWidth: 30 }}
          >
            {tf}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 20, backgroundColor: THEME_TOKENS.colors.borderMedium }} />

      {/* Chart Style Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          type="button"
          onClick={() => setChartType('candle_solid')}
          className={`tv-btn ${chartType === 'candle_solid' ? 'active' : ''}`}
          title="Candlestick (Solid)"
          style={{ padding: '4px 6px' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <rect x="9" y="5" width="6" height="14" rx="1" />
            <line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" strokeWidth="2" />
            <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => setChartType('candle_stroke')}
          className={`tv-btn ${chartType === 'candle_stroke' ? 'active' : ''}`}
          title="Hollow Candles"
          style={{ padding: '4px 6px' }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="9" y="5" width="6" height="14" rx="1" />
            <line x1="12" y1="2" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => setChartType('line')}
          className={`tv-btn ${chartType === 'line' || chartType === 'area' ? 'active' : ''}`}
          title="Line / Area"
          style={{ padding: '4px 6px' }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="3 17 9 11 13 15 21 7" />
          </svg>
        </button>
      </div>

      <div style={{ width: 1, height: 20, backgroundColor: THEME_TOKENS.colors.borderMedium }} />

      {/* Indicators Modal Trigger */}
      <button
        type="button"
        onClick={() => setIndicatorModalOpen(true)}
        className="tv-btn"
        style={{ fontSize: 12, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}
        title="Indicators & Strategies (Alt+I)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 20v-6M6 20V10M18 20V4" />
        </svg>
        <span>Indicators</span>
        <span
          style={{
            backgroundColor: THEME_TOKENS.colors.bgActive,
            color: THEME_TOKENS.colors.accent,
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 10
          }}
        >
          {activeIndicators.length}
        </span>
      </button>

      {/* Bar Replay Mode Toggle */}
      <button
        type="button"
        onClick={() => setReplaying(!isReplaying)}
        className={`tv-btn ${isReplaying ? 'active' : ''}`}
        style={{ fontSize: 12, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}
        title="Bar Replay Simulation"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polygon points="11 19 2 12 11 5 11 19" fill={isReplaying ? 'currentColor' : 'none'} />
          <polygon points="22 19 13 12 22 5 22 19" fill={isReplaying ? 'currentColor' : 'none'} />
        </svg>
        <span>Replay</span>
      </button>

      {/* Clear Drawings Button */}
      <button
        type="button"
        onClick={clearAllDrawings}
        className="tv-btn"
        style={{ fontSize: 12, padding: '4px 8px', color: THEME_TOKENS.colors.textSecondary }}
        title="Remove All Drawings"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>

      <div style={{ flex: 1 }} />

      {/* Layout Manager & SQLite Persistence */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleSave}
            className="tv-btn"
            style={{
              fontSize: 12,
              padding: '4px 9px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
              borderRight: 'none'
            }}
            title="Save changes to SQLite"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={saveToast ? THEME_TOKENS.colors.bullish : 'currentColor'}
              strokeWidth="2"
            >
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            <span
              style={{
                maxWidth: 140,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {saveToast ? 'Saved!' : activeLayout?.name || 'Save Layout'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsLayoutMenuOpen(!isLayoutMenuOpen)}
            className={`tv-btn ${isLayoutMenuOpen ? 'active' : ''}`}
            style={{
              padding: '4px 6px',
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
              height: 28
            }}
            title="Layout Options"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* Layout Dropdown Menu */}
        {isLayoutMenuOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              width: 240,
              backgroundColor: THEME_TOKENS.colors.bgSurface,
              border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              zIndex: 100,
              padding: '6px 0'
            }}
          >
            <div
              style={{
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 700,
                color: THEME_TOKENS.colors.textSecondary,
                textTransform: 'uppercase'
              }}
            >
              Layout Actions
            </div>

            <div
              onClick={handleSave}
              className="tv-dropdown-item"
              style={{
                padding: '7px 12px',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: THEME_TOKENS.colors.textPrimary
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              <span>Save Current Layout</span>
            </div>

            <div
              onClick={handleSaveAs}
              className="tv-dropdown-item"
              style={{
                padding: '7px 12px',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: THEME_TOKENS.colors.textPrimary
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>Save As New Layout...</span>
            </div>

            <div
              onClick={() => {
                setIsLayoutMenuOpen(false)
                openHubInNewTab()
              }}
              className="tv-dropdown-item"
              style={{
                padding: '7px 12px',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: THEME_TOKENS.colors.accent,
                borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span>Manage in Supercharts Hub</span>
            </div>

            {layouts.length > 0 && (
              <>
                <div
                  style={{
                    padding: '8px 12px 4px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: THEME_TOKENS.colors.textSecondary,
                    textTransform: 'uppercase'
                  }}
                >
                  Load Layout
                </div>
                <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                  {layouts.map((l) => (
                    <div
                      key={l.id}
                      onClick={async () => {
                        setIsLayoutMenuOpen(false)
                        await loadLayoutById(l.id, false)
                      }}
                      style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor:
                          activeLayout?.id === l.id ? THEME_TOKENS.colors.bgActive : 'transparent',
                        color:
                          activeLayout?.id === l.id
                            ? THEME_TOKENS.colors.accent
                            : THEME_TOKENS.colors.textPrimary
                      }}
                      onMouseEnter={(e) => {
                        if (activeLayout?.id !== l.id) {
                          e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (activeLayout?.id !== l.id) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {l.name}
                      </span>
                      <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                        {l.symbol}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 20, backgroundColor: THEME_TOKENS.colors.borderMedium }} />

      {/* Theme Toggle (TradingView Light / Dark) */}
      <button
        type="button"
        onClick={toggleTheme}
        className="tv-btn"
        style={{ padding: '5px 8px', color: THEME_TOKENS.colors.textSecondary }}
        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {theme === 'dark' ? (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>

      {/* Settings Quick Access */}
      <button
        type="button"
        onClick={() => setSettingsModalOpen(true)}
        className="tv-btn"
        style={{ padding: '5px 8px', color: THEME_TOKENS.colors.textSecondary }}
        title="API Keys & Settings"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  )
}
