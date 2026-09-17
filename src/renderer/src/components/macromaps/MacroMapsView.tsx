import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { THEME_TOKENS } from '../../theme/tokens'
import { MACRO_METRICS } from './macroDataset'
import { MacroMapLibre } from './MacroMapLibre'
import { useTabStore } from '../../stores/useTabStore'
import { useMarketStore } from '../../stores/useMarketStore'
import type { MacroMetricType, CountryMacroData } from '@shared/types'

const HISTORICAL_YEARS = [
  1914, 1929, 1945, 1971, 1980, 1990, 2000, 2008, 2015, 2020, 2022, 2024, 2026
]

export const MacroMapsView: React.FC = () => {
  const { tabs, activeTabId, openLayoutInNewTab } = useTabStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  // Current active metric
  const [selectedMetric, setSelectedMetric] = useState<MacroMetricType>(
    (activeTab?.macroMetric as MacroMetricType) || 'inflation'
  )

  // Regional filtering
  const [selectedRegion, setSelectedRegion] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Timeline scrubber
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)

  // Selected & Hovered Country for tooltip / detail
  const [hoveredCountry, setHoveredCountry] = useState<CountryMacroData | null>(null)
  const [selectedCountryId, setSelectedCountryId] = useState<string>('US')
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [liveMacroData, setLiveMacroData] = useState<CountryMacroData[] | null>(null)
  const [isLiveData, setIsLiveData] = useState(false)

  // Historical animation playback loop
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    if (isPlaying) {
      interval = setInterval(() => {
        setSelectedYear((prev) => {
          const currentIndex = HISTORICAL_YEARS.indexOf(prev)
          const nextIndex = (currentIndex + 1) % HISTORICAL_YEARS.length
          return HISTORICAL_YEARS[nextIndex]
        })
      }, 1400)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isPlaying])

  // Macro maps are provider-backed only; failures remain unavailable.
  useEffect(() => {
    let cancelled = false
    window.api.macro
      .getMap({ indicator: selectedMetric, period: String(selectedYear) })
      .then((result) => {
        if (cancelled) return
        if (result?.countries?.length && result.isLive) {
          setLiveMacroData(result.countries)
          setIsLiveData(true)
        } else {
          setLiveMacroData(null)
          setIsLiveData(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveMacroData(null)
          setIsLiveData(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedMetric, selectedYear])

  const macroData = useMemo(() => liveMacroData ?? [], [liveMacroData])

  // Filtered country ranking list
  const filteredList = useMemo(() => {
    return macroData.filter((c) => {
      if (selectedRegion !== 'All') {
        const id = c.id.toUpperCase()
        const isG7 = ['US', 'CA', 'GB', 'FR', 'DE', 'IT', 'JP'].includes(id)
        const isBRICS = ['BR', 'RU', 'IN', 'CN', 'ZA', 'EG', 'ET', 'IR', 'AE', 'SA'].includes(id)
        const isG20 =
          isG7 ||
          isBRICS ||
          ['ID', 'KR', 'SA', 'TR', 'AU', 'AR', 'MX', 'EU'].includes(id)

        if (selectedRegion === 'G20' && !isG20 && c.region !== 'G20') return false
        if (selectedRegion === 'G7' && !isG7 && c.region !== 'G7') return false
        if (selectedRegion === 'BRICS' && !isBRICS && c.region !== 'BRICS') return false
        if (
          selectedRegion === 'Europe' &&
          c.region !== 'Europe' &&
          !['GB', 'FR', 'DE', 'IT', 'EU', 'ES', 'NL', 'CH', 'SE', 'NO', 'PL', 'IE', 'BE', 'AT', 'PT', 'GR', 'FI', 'DK', 'CZ', 'RO', 'HU', 'UA'].includes(id)
        ) {
          return false
        }
        if (
          selectedRegion === 'Asia' &&
          c.region !== 'Asia' &&
          !['CN', 'IN', 'JP', 'KR', 'ID', 'SG', 'TH', 'MY', 'VN', 'PH', 'SA', 'TR', 'AE', 'PK', 'BD', 'IL', 'TW', 'HK'].includes(id)
        ) {
          return false
        }
        if (
          selectedRegion === 'Americas' &&
          c.region !== 'Americas' &&
          !['US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC'].includes(id)
        ) {
          return false
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          c.name.toLowerCase().includes(q) ||
          c.ticker.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [macroData, selectedRegion, searchQuery])

  const activeMetricConfig = useMemo(() => {
    return MACRO_METRICS.find((m) => m.id === selectedMetric) || MACRO_METRICS[0]
  }, [selectedMetric])

  // Open country macro chart
  const handleOpenChart = useCallback(
    (country: CountryMacroData): void => {
      const now = Date.now()
      openLayoutInNewTab({
        id: `macro_${country.ticker}_${now}`,
        name: `${country.name} ${activeMetricConfig.label}`,
        symbol: useMarketStore.getState().symbol ?? '',
        timeframe: '1d',
        chartType: 'candle_solid',
        indicators: [
          { id: 'ema_20', name: 'EMA', paneId: 'candle_pane', calcParams: [20], visible: true }
        ],
        activePanel: 'macro',
        createdAt: now,
        updatedAt: now
      })
    },
    [activeMetricConfig.label, openLayoutInNewTab]
  )

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#0e1117',
        color: THEME_TOKENS.colors.textPrimary,
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {/* 1. TOP METRIC SWITCHER BAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          backgroundColor: THEME_TOKENS.colors.bgSurface,
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          gap: 12,
          flexWrap: 'nowrap',
          overflowX: 'auto',
          zIndex: 10
        }}
      >
        {/* Metric Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {MACRO_METRICS.map((metric) => {
            const isSelected = selectedMetric === metric.id
            return (
              <button
                key={metric.id}
                type="button"
                onClick={() => setSelectedMetric(metric.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: isSelected ? 700 : 500,
                  border: isSelected
                    ? `1px solid ${THEME_TOKENS.colors.accent}`
                    : `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  backgroundColor: isSelected
                    ? 'rgba(41, 98, 255, 0.16)'
                    : THEME_TOKENS.colors.bgApp,
                  color: isSelected
                    ? THEME_TOKENS.colors.textBright
                    : THEME_TOKENS.colors.textSecondary,
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                {metric.label}
              </button>
            )
          })}
        </div>

        {/* Global Overview / Ticker Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
            {activeMetricConfig.description}
          </span>
          <div
            style={{
              padding: '3px 8px',
              borderRadius: 4,
              backgroundColor: THEME_TOKENS.colors.bgApp,
              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              fontSize: 11,
              fontWeight: 600,
              color: THEME_TOKENS.colors.textBright
            }}
          >
            Year: <span style={{ color: THEME_TOKENS.colors.accent }}>{selectedYear}</span>
          </div>
          <div
            style={{
              fontSize: 10,
              color: isLiveData ? '#26a69a' : THEME_TOKENS.colors.textSecondary
            }}
          >
            {isLiveData ? 'LIVE' : 'LIVE DATA UNAVAILABLE'}
          </div>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE (MAP + RANKING SIDEBAR) */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* MAPLIBRE GL MAP CONTAINER */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            backgroundColor: '#0d111a',
            overflow: 'hidden'
          }}
        >
          <MacroMapLibre
            selectedMetric={selectedMetric}
            selectedYear={selectedYear}
            macroData={macroData}
            selectedCountryId={selectedCountryId}
            onSelectCountry={(countryId) => setSelectedCountryId(countryId)}
            onHoverCountry={(country, x, y) => {
              setHoveredCountry(country)
              if (x !== undefined && y !== undefined) {
                setMousePos({ x, y })
              }
            }}
            onOpenChart={handleOpenChart}
          />

          {/* Interactive Hover Tooltip */}
          {hoveredCountry && (
            <div
              style={{
                position: 'absolute',
                left: Math.min(mousePos.x + 14, window.innerWidth - 620),
                top: Math.max(mousePos.y - 45, 20),
                backgroundColor: THEME_TOKENS.colors.bgSurface,
                border: `1px solid ${THEME_TOKENS.colors.accent}`,
                borderRadius: 6,
                padding: '8px 12px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                pointerEvents: 'none',
                zIndex: 100,
                minWidth: 160
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8
                }}
              >
                <span style={{ fontSize: 14 }}>{hoveredCountry.flag}</span>
                <span
                  style={{ fontWeight: 700, fontSize: 12, color: THEME_TOKENS.colors.textBright }}
                >
                  {hoveredCountry.name}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 4px',
                    borderRadius: 2,
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    color: THEME_TOKENS.colors.textSecondary
                  }}
                >
                  #{hoveredCountry.rank}
                </span>
              </div>

              <div
                style={{
                  marginTop: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline'
                }}
              >
                <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
                  {hoveredCountry.ticker}:
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: THEME_TOKENS.colors.accent }}>
                  {hoveredCountry.value === undefined
                    ? 'Unavailable'
                    : `${hoveredCountry.value}${hoveredCountry.unit}`}
                </span>
              </div>

              <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted, marginTop: 2 }}>
                Period: {hoveredCountry.period} | 1Y Chg:{' '}
                <span
                  style={{
                    color:
                      hoveredCountry.change !== undefined && hoveredCountry.change >= 0
                        ? THEME_TOKENS.colors.bullish
                        : THEME_TOKENS.colors.bearish
                  }}
                >
                  {hoveredCountry.change === undefined
                    ? 'Unavailable'
                    : `${hoveredCountry.change >= 0 ? '+' : ''}${hoveredCountry.change}%`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 3. RIGHT COUNTRY RANKING SIDEBAR */}
        <div
          style={{
            width: 380,
            height: '100%',
            backgroundColor: THEME_TOKENS.colors.bgSurface,
            borderLeft: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 15
          }}
        >
          {/* Filter Header */}
          <div
            style={{
              padding: '12px 14px',
              borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
            }}
          >
            {/* Search Input */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search country, ticker..."
                className="tv-input"
                style={{
                  width: '100%',
                  height: 30,
                  fontSize: 11,
                  paddingLeft: 28
                }}
              />
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke={THEME_TOKENS.colors.textSecondary}
                strokeWidth="2"
                style={{ position: 'absolute', left: 8, top: 8 }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>

            {/* Region Filter Buttons */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['All', 'G20', 'G7', 'BRICS', 'Europe', 'Asia', 'Americas'].map((region) => {
                const isActive = selectedRegion === region
                return (
                  <button
                    key={region}
                    type="button"
                    onClick={() => setSelectedRegion(region)}
                    style={{
                      padding: '3px 8px',
                      fontSize: 10,
                      fontWeight: isActive ? 700 : 500,
                      borderRadius: 3,
                      border: 'none',
                      backgroundColor: isActive
                        ? THEME_TOKENS.colors.accent
                        : THEME_TOKENS.colors.bgApp,
                      color: isActive ? '#ffffff' : THEME_TOKENS.colors.textSecondary,
                      cursor: 'pointer'
                    }}
                  >
                    {region}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Table Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr 75px 60px',
              padding: '6px 14px',
              backgroundColor: THEME_TOKENS.colors.bgApp,
              fontSize: 10,
              fontWeight: 700,
              color: THEME_TOKENS.colors.textSecondary,
              borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
            }}
          >
            <div>#</div>
            <div>COUNTRY</div>
            <div style={{ textAlign: 'right' }}>VALUE</div>
            <div style={{ textAlign: 'right' }}>ACTION</div>
          </div>

          {/* Table Scrollable Body */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredList.length === 0 && (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  color: THEME_TOKENS.colors.textSecondary
                }}
              >
                Live macro data unavailable for this metric and period.
              </div>
            )}
            {filteredList.map((country) => {
              const isSelected = selectedCountryId === country.id
              const isPositiveChange = country.change !== undefined && country.change >= 0

              return (
                <div
                  key={country.id}
                  onClick={() => setSelectedCountryId(country.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr 75px 60px',
                    alignItems: 'center',
                    padding: '8px 14px',
                    fontSize: 11,
                    cursor: 'pointer',
                    borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    backgroundColor: isSelected ? 'rgba(41, 98, 255, 0.12)' : 'transparent',
                    transition: 'background-color 0.1s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  <div style={{ color: THEME_TOKENS.colors.textMuted, fontSize: 10 }}>
                    {country.rank}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      paddingRight: 6
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{country.flag}</span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: THEME_TOKENS.colors.textBright,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {country.name}
                      </span>
                    </div>
                    <span
                      style={{ fontSize: 9, color: THEME_TOKENS.colors.textMuted, marginTop: 1 }}
                    >
                      {country.ticker} · {country.period}
                    </span>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: THEME_TOKENS.colors.textBright,
                        fontSize: 12
                      }}
                    >
                      {country.value === undefined
                        ? 'Unavailable'
                        : `${country.value}${country.unit}`}
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: isPositiveChange
                          ? THEME_TOKENS.colors.bullish
                          : THEME_TOKENS.colors.bearish
                      }}
                    >
                      {country.change === undefined
                        ? 'Change unavailable'
                        : `${isPositiveChange ? '▲' : '▼'} ${Math.abs(country.change)}%`}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenChart(country)
                      }}
                      className="tv-btn"
                      style={{
                        padding: '2px 6px',
                        fontSize: 9,
                        borderRadius: 3,
                        fontWeight: 600
                      }}
                      title="Open in Chart Tab"
                    >
                      Chart
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 4. BOTTOM HISTORICAL TIMELINE SCRUBBER */}
      <div
        style={{
          padding: '8px 20px',
          backgroundColor: THEME_TOKENS.colors.bgSurface,
          borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          zIndex: 10
        }}
      >
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          className="tv-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            fontSize: 11,
            fontWeight: 600
          }}
          title={isPlaying ? 'Pause Cycle Playback' : 'Play Historical Cycle Animation'}
        >
          {isPlaying ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              Pause
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Play
            </>
          )}
        </button>

        {/* Current Year Badge */}
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: THEME_TOKENS.colors.textBright,
            minWidth: 44
          }}
        >
          {selectedYear}
        </span>

        {/* Timeline Slider with Years */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input
            type="range"
            min={0}
            max={HISTORICAL_YEARS.length - 1}
            step={1}
            value={HISTORICAL_YEARS.indexOf(selectedYear)}
            onChange={(e) => {
              const idx = Number(e.target.value)
              setSelectedYear(HISTORICAL_YEARS[idx])
            }}
            style={{ width: '100%', cursor: 'pointer', accentColor: THEME_TOKENS.colors.accent }}
          />

          {/* Historical Milestone Markers */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 9,
              color: THEME_TOKENS.colors.textSecondary
            }}
          >
            {HISTORICAL_YEARS.map((yr) => (
              <span
                key={yr}
                onClick={() => setSelectedYear(yr)}
                style={{
                  cursor: 'pointer',
                  fontWeight: yr === selectedYear ? 700 : 400,
                  color: yr === selectedYear ? THEME_TOKENS.colors.accent : 'inherit'
                }}
              >
                {yr}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
