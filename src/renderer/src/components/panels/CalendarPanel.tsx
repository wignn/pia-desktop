import React, { useEffect } from 'react'
import { useCalendarStore } from '../../stores/useCalendarStore'
import { THEME_TOKENS } from '../../theme/tokens'
import type { EconomicEvent } from '@shared/types'

export const CalendarPanel: React.FC = () => {
  const { events, isLoading, impactFilter, setImpactFilter, fetchEvents } = useCalendarStore()

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const getImpactColor = (impact: EconomicEvent['impact']): string => {
    switch (impact) {
      case 'high':
        return THEME_TOKENS.colors.impactHigh
      case 'medium':
        return THEME_TOKENS.colors.impactMedium
      case 'low':
        return THEME_TOKENS.colors.impactLow
      default:
        return THEME_TOKENS.colors.impactNone
    }
  }

  const formatEventTime = (iso: string): string => {
    try {
      const d = new Date(iso)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return iso
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        fontSize: 12
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 12px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, color: THEME_TOKENS.colors.textBright }}>
          Economic Calendar
        </span>
        <button
          type="button"
          onClick={() => fetchEvents()}
          className="tv-btn"
          title="Refresh calendar"
          disabled={isLoading}
          style={{ padding: 4 }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }}
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      {/* Impact Filter Tabs */}
      <div
        style={{
          display: 'flex',
          padding: '6px 12px',
          gap: 6,
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          backgroundColor: THEME_TOKENS.colors.bgApp
        }}
      >
        {(['all', 'high', 'medium', 'low'] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setImpactFilter(filter)}
            className={`tv-btn ${impactFilter === filter ? 'active' : ''}`}
            style={{
              padding: '2px 8px',
              fontSize: 11,
              textTransform: 'capitalize'
            }}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Events List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading && events.length === 0 && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            Loading macroeconomic data...
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            No economic events found for this filter.
          </div>
        )}

        {events.map((ev) => {
          const impactColor = getImpactColor(ev.impact)
          return (
            <div
              key={ev.id}
              style={{
                padding: '10px 12px',
                borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}
            >
              {/* Top Row: Time, Country/Currency, Impact Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span
                  style={{
                    color: THEME_TOKENS.colors.textSecondary,
                    fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace'
                  }}
                >
                  {formatEventTime(ev.date)}
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    color: THEME_TOKENS.colors.textBright,
                    backgroundColor: THEME_TOKENS.colors.bgSurfaceHover,
                    padding: '1px 4px',
                    borderRadius: 3
                  }}
                >
                  {ev.countryCode || ev.country}
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: impactColor,
                    backgroundColor: `${impactColor}1a`,
                    padding: '1px 5px',
                    borderRadius: 3
                  }}
                >
                  {ev.impact}
                </span>
              </div>

              {/* Event Title */}
              <div
                style={{ fontWeight: 600, color: THEME_TOKENS.colors.textPrimary, fontSize: 12 }}
              >
                {ev.title}
              </div>

              {/* Data Row: Actual / Forecast / Previous */}
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  fontSize: 11,
                  fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
                  color: THEME_TOKENS.colors.textSecondary,
                  marginTop: 2
                }}
              >
                {ev.actual !== undefined && (
                  <span>
                    Act:{' '}
                    <span style={{ color: THEME_TOKENS.colors.textBright, fontWeight: 600 }}>
                      {ev.actual}
                    </span>
                  </span>
                )}
                {ev.forecast !== undefined && (
                  <span>
                    Fcst:{' '}
                    <span style={{ color: THEME_TOKENS.colors.textPrimary }}>{ev.forecast}</span>
                  </span>
                )}
                {ev.previous !== undefined && (
                  <span>
                    Prev:{' '}
                    <span style={{ color: THEME_TOKENS.colors.textSecondary }}>{ev.previous}</span>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
