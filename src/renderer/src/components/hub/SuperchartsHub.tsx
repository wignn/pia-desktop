import React, { useEffect, useState, useCallback } from 'react'
import { useLayoutStore } from '../../stores/useLayoutStore'
import { useTabStore } from '../../stores/useTabStore'
import { useWorkspaceStore, type RightPanelTab } from '../../stores/useWorkspaceStore'
import { THEME_TOKENS } from '../../theme/tokens'
import type { ChartLayoutData, Timeframe } from '@shared/types'

const formatTimeAgo = (ts: number, nowMs: number): string => {
  const diffMin = Math.floor((nowMs - ts) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

export const SuperchartsHub: React.FC = () => {
  const {
    layouts,
    isLoading,
    searchQuery,
    setSearchQuery,
    filterFavoritesOnly,
    setFilterFavoritesOnly,
    fetchLayouts,
    loadLayoutById,
    createBlankLayout,
    duplicateLayout,
    deleteLayout,
    toggleFavorite
  } = useLayoutStore()

  const { setActiveTab } = useWorkspaceStore()

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newLayoutName, setNewLayoutName] = useState('')
  const [newLayoutSymbol, setNewLayoutSymbol] = useState('')
  const [newLayoutTimeframe, setNewLayoutTimeframe] = useState<Timeframe>('1h')
  const [currentTimestamp] = useState<number>(() => Date.now())

  useEffect(() => {
    fetchLayouts()
  }, [fetchLayouts])

  const handleCreateSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!newLayoutName.trim()) return

    const created = await createBlankLayout(
      newLayoutName.trim(),
      newLayoutSymbol,
      newLayoutTimeframe
    )
    if (created) {
      setIsCreateModalOpen(false)
      setNewLayoutName('')
      await loadLayoutById(created.id, false)
    }
  }

  const handleOpenSuite = useCallback(
    (panelTab: RightPanelTab, symbol = ''): void => {
      const now = Date.now()
      // Launch a new tab with chart and automatically switch right panel
      const createdBlank: ChartLayoutData = {
        id: `suite_${panelTab}_${now}`,
        name: `${panelTab.toUpperCase()} Analysis`,
        symbol,
        timeframe: '1h',
        chartType: 'candle_solid',
        indicators: [
          { id: 'ema_20', name: 'EMA', paneId: 'candle_pane', calcParams: [20], visible: true }
        ],
        activePanel: panelTab,
        createdAt: now,
        updatedAt: now
      }
      useTabStore.getState().openLayoutInActiveTab(createdBlank)
      setActiveTab(panelTab)
    },
    [setActiveTab]
  )

  const filteredLayouts = layouts.filter((l) => {
    if (filterFavoritesOnly && !l.isFavorite) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      l.name.toLowerCase().includes(q) ||
      l.symbol.toLowerCase().includes(q) ||
      l.timeframe.toLowerCase().includes(q) ||
      (l.description && l.description.toLowerCase().includes(q))
    )
  })

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        overflowY: 'auto',
        backgroundColor: THEME_TOKENS.colors.bgApp,
        color: THEME_TOKENS.colors.textPrimary,
        padding: '24px 32px'
      }}
    >
      {/* Top Banner & Search */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: THEME_TOKENS.colors.textBright,
              margin: '0 0 6px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke={THEME_TOKENS.colors.accent}
              strokeWidth="2.2"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            Supercharts Hub
          </h1>
          <div style={{ fontSize: 13, color: THEME_TOKENS.colors.textSecondary }}>
            Manage custom multi-timeframe chart layouts and institutional analytical setups with
            local SQLite persistence.
          </div>
        </div>

        {/* Search & Favorites Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 260 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search layout, symbol..."
              className="tv-input"
              style={{
                width: '100%',
                paddingLeft: 30,
                fontSize: 12,
                height: 32
              }}
            />
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={THEME_TOKENS.colors.textSecondary}
              strokeWidth="2"
              style={{ position: 'absolute', left: 9, top: 9 }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>

          <button
            type="button"
            onClick={() => setFilterFavoritesOnly(!filterFavoritesOnly)}
            className={`tv-btn ${filterFavoritesOnly ? 'active' : ''}`}
            title="Show only favorites"
            style={{ height: 32, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ color: filterFavoritesOnly ? '#fbc02d' : 'inherit' }}>★</span>
            Favorites
          </button>
        </div>
      </div>

      {/* Hero Quick Actions: Create Layout & Open Macro Maps */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginBottom: 28
        }}
      >
        {/* Create Layout */}
        <div
          onClick={() => setIsCreateModalOpen(true)}
          style={{
            border: `2px dashed ${THEME_TOKENS.colors.borderMedium}`,
            borderRadius: 8,
            backgroundColor: THEME_TOKENS.colors.bgSurface,
            padding: '18px 22px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = THEME_TOKENS.colors.accent
            e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = THEME_TOKENS.colors.borderMedium
            e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurface
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                backgroundColor: 'rgba(41, 98, 255, 0.12)',
                color: THEME_TOKENS.colors.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 700
              }}
            >
              +
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
                Create New Chart Layout
              </div>
              <div style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary, marginTop: 2 }}>
                Configure a fresh chart layout with custom timeframe & indicators.
              </div>
            </div>
          </div>

          <button
            type="button"
            className="tv-btn primary"
            style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600 }}
          >
            + New Layout
          </button>
        </div>

        {/* Macro Maps Hero Card */}
        <div
          onClick={() => useTabStore.getState().openMacroMapsInNewTab('inflation')}
          style={{
            border: `1px solid rgba(41, 98, 255, 0.35)`,
            borderRadius: 8,
            backgroundColor: 'rgba(41, 98, 255, 0.05)',
            padding: '18px 22px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = THEME_TOKENS.colors.accent
            e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.1)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(41, 98, 255, 0.35)'
            e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.05)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                backgroundColor: 'rgba(41, 98, 255, 0.18)',
                color: THEME_TOKENS.colors.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
                Macro Maps (World Thematic)
              </div>
              <div style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary, marginTop: 2 }}>
                Explore global inflation, rates, GDP, & debt with 1914-2026 timeline.
              </div>
            </div>
          </div>

          <button
            type="button"
            className="tv-btn"
            style={{
              padding: '6px 14px',
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: THEME_TOKENS.colors.accent,
              color: '#ffffff',
              border: 'none'
            }}
          >
            Launch Map ➔
          </button>
        </div>
      </div>

      {/* Saved Layouts Section */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: THEME_TOKENS.colors.textBright,
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span>Saved Layouts ({filteredLayouts.length})</span>
          {isLoading && (
            <span style={{ fontSize: 12, color: THEME_TOKENS.colors.textSecondary }}>
              Loading...
            </span>
          )}
        </div>

        {filteredLayouts.length === 0 && !isLoading ? (
          <div
            style={{
              padding: 36,
              textAlign: 'center',
              backgroundColor: THEME_TOKENS.colors.bgSurface,
              borderRadius: 8,
              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              color: THEME_TOKENS.colors.textSecondary,
              fontSize: 13
            }}
          >
            No layouts found matching criteria.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16
            }}
          >
            {filteredLayouts.map((layout) => (
              <div
                key={layout.id}
                style={{
                  backgroundColor: THEME_TOKENS.colors.bgSurface,
                  borderRadius: 8,
                  border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'border-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = THEME_TOKENS.colors.borderMedium
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = THEME_TOKENS.colors.borderSubtle
                }}
              >
                {/* Top: Name & Favorite */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 8
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        color: THEME_TOKENS.colors.textBright
                      }}
                    >
                      {layout.name}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleFavorite(layout.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 16,
                        color: layout.isFavorite ? '#fbc02d' : THEME_TOKENS.colors.textMuted,
                        padding: 2
                      }}
                      title={layout.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      ★
                    </button>
                  </div>

                  {layout.description && (
                    <div
                      style={{
                        fontSize: 12,
                        color: THEME_TOKENS.colors.textSecondary,
                        marginBottom: 12,
                        lineHeight: 1.4
                      }}
                    >
                      {layout.description}
                    </div>
                  )}

                  {/* Pills */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 3,
                        backgroundColor: 'rgba(41, 98, 255, 0.15)',
                        color: THEME_TOKENS.colors.accent
                      }}
                    >
                      {layout.symbol}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 6px',
                        borderRadius: 3,
                        backgroundColor: THEME_TOKENS.colors.bgApp,
                        color: THEME_TOKENS.colors.textPrimary
                      }}
                    >
                      {layout.timeframe}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 6px',
                        borderRadius: 3,
                        backgroundColor: THEME_TOKENS.colors.bgApp,
                        color: THEME_TOKENS.colors.textSecondary
                      }}
                    >
                      {layout.chartType}
                    </span>
                    {layout.indicators && layout.indicators.length > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 6px',
                          borderRadius: 3,
                          backgroundColor: THEME_TOKENS.colors.bgApp,
                          color: THEME_TOKENS.colors.textSecondary
                        }}
                      >
                        {layout.indicators.map((i) => i.name).join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom: Modified time & Actions */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 12,
                    borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                  }}
                >
                  <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
                    Updated {formatTimeAgo(layout.updatedAt, currentTimestamp)}
                  </span>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => duplicateLayout(layout.id)}
                      className="tv-btn"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      title="Duplicate Layout"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete layout "${layout.name}"?`)) {
                          deleteLayout(layout.id)
                        }
                      }}
                      className="tv-btn"
                      style={{
                        fontSize: 11,
                        padding: '3px 8px',
                        color: THEME_TOKENS.colors.bearish
                      }}
                      title="Delete Layout"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => loadLayoutById(layout.id, false)}
                      className="tv-btn primary"
                      style={{ fontSize: 11, padding: '3px 12px', fontWeight: 600 }}
                    >
                      Open
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Analytical Suites Launcher */}
      <div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: THEME_TOKENS.colors.textBright,
            marginBottom: 14
          }}
        >
          Institutional Analytics Suites
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12
          }}
        >
          {(
            [
              {
                id: 'options',
                label: 'Options & GEX Gamma Wall',
                desc: 'Derivatives open interest, PCR, and dealer hedging'
              },
              {
                id: 'yields',
                label: 'Sovereign Yield Curve',
                desc: 'US Treasury 1M-30Y curve and 2Y-10Y recession spread'
              },
              {
                id: 'macro',
                label: 'Macro Radar & COT',
                desc: 'CFTC institutional commitments, central banks, Fear & Greed'
              },
              {
                id: 'geosignals',
                label: 'Geopolitical Risk Radar',
                desc: 'Maritime chokepoints, sanctions, and supply chain hotspots'
              },
              {
                id: 'energy',
                label: 'Energy & Refining Margins',
                desc: 'WTI/Brent spread, crack spread 3:2:1, natural gas storage'
              },
              {
                id: 'sec',
                label: 'SEC EDGAR Filings',
                desc: 'Institutional 10-K, 10-Q, 8-K disclosures and Form 4 insider trades'
              },
              {
                id: 'social',
                label: 'Social Sentiment Pulse',
                desc: 'FinTwit intelligence stream and social sentiment velocity'
              },
              {
                id: 'calendar',
                label: 'Economic Calendar',
                desc: 'Global central bank meetings, CPI, NFP, and GDP releases'
              },
              {
                id: 'paper',
                label: 'Paper Trading Simulator',
                desc: 'Real-time simulated order execution and portfolio PnL tracking'
              }
            ] as const
          ).map((suite) => (
            <div
              key={suite.id}
              onClick={() => handleOpenSuite(suite.id)}
              style={{
                backgroundColor: THEME_TOKENS.colors.bgSurface,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                borderRadius: 6,
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'all 0.12s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = THEME_TOKENS.colors.accent
                e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = THEME_TOKENS.colors.borderSubtle
                e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurface
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  color: THEME_TOKENS.colors.textBright,
                  marginBottom: 4
                }}
              >
                {suite.label}
              </div>
              <div
                style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary, lineHeight: 1.4 }}
              >
                {suite.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Layout Modal */}
      {isCreateModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: THEME_TOKENS.colors.bgSurface,
              borderRadius: 8,
              border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
              width: 420,
              padding: 24,
              boxShadow: '0 12px 36px rgba(0,0,0,0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{ margin: '0 0 16px 0', fontSize: 16, color: THEME_TOKENS.colors.textBright }}
            >
              Create New Chart Layout
            </h3>

            <form
              onSubmit={handleCreateSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    marginBottom: 6,
                    color: THEME_TOKENS.colors.textSecondary
                  }}
                >
                  Layout Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newLayoutName}
                  onChange={(e) => setNewLayoutName(e.target.value)}
                  placeholder="e.g. Crypto Swing Setup, Macro Trend..."
                  className="tv-input"
                  style={{ width: '100%', height: 34, fontSize: 13 }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    marginBottom: 6,
                    color: THEME_TOKENS.colors.textSecondary
                  }}
                >
                  Default Symbol
                </label>
                <input
                  type="text"
                  required
                  value={newLayoutSymbol}
                  onChange={(e) => setNewLayoutSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. live provider symbols"
                  className="tv-input"
                  style={{ width: '100%', height: 34, fontSize: 13 }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    marginBottom: 6,
                    color: THEME_TOKENS.colors.textSecondary
                  }}
                >
                  Timeframe
                </label>
                <select
                  value={newLayoutTimeframe}
                  onChange={(e) => setNewLayoutTimeframe(e.target.value as Timeframe)}
                  className="tv-input"
                  style={{ width: '100%', height: 34, fontSize: 13 }}
                >
                  <option value="1m">1m</option>
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                  <option value="1d">1d</option>
                  <option value="1w">1w</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="tv-btn"
                  style={{ padding: '8px 16px', fontSize: 12 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tv-btn primary"
                  style={{ padding: '8px 20px', fontSize: 12, fontWeight: 600 }}
                >
                  Create & Launch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
