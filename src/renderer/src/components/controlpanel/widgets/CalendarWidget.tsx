import React, { useState, useEffect } from 'react'
import type { EconomicEvent } from '@shared/types'

export const CalendarWidget: React.FC = () => {
  const [events, setEvents] = useState<EconomicEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    window.api.calendar
      .get({ limit: 12 })
      .then((res) => {
        if (cancelled) return
        setEvents(res)
        setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#131722',
        overflowY: 'auto'
      }}
    >
      {isLoading && (
        <div style={{ fontSize: 11, color: '#787b86', textAlign: 'center', padding: 20 }}>
          Loading calendar...
        </div>
      )}
      {events.map((ev) => {
        const impactColor =
          ev.impact === 'high' ? '#f23645' : ev.impact === 'medium' ? '#ff9800' : '#787b86'
        const timeStr = ev.time
          ? `${ev.date ? ev.date.substring(5) + ' ' : ''}${ev.time}`
          : ev.timestamp
            ? new Date(ev.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              })
            : ev.date || 'Upcoming'

        return (
          <div
            key={ev.id}
            style={{
              padding: '7px 10px',
              borderBottom: '1px solid #1e222d',
              display: 'flex',
              flexDirection: 'column',
              gap: 2
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 10
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ color: '#787b86', fontFamily: 'monospace' }}>{timeStr}</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: '#ffffff',
                    backgroundColor: '#1e222d',
                    padding: '1px 4px',
                    borderRadius: 2
                  }}
                >
                  {ev.countryCode || ev.country}
                </span>
              </div>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: impactColor,
                  textTransform: 'uppercase'
                }}
              >
                {ev.impact}
              </span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#ffffff' }}>{ev.title}</div>
            <div
              style={{
                display: 'flex',
                gap: 10,
                fontSize: 10,
                color: '#787b86',
                fontFamily: 'monospace'
              }}
            >
              <span>
                Act: <strong style={{ color: '#ffffff' }}>{ev.actual || '--'}</strong>
              </span>
              <span>Fcst: {ev.forecast || '--'}</span>
              <span>Prev: {ev.previous || '--'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
