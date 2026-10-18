/**
 * Economic calendar date/time parsing and formatting utilities
 */

export interface ParsedCalendarTime {
  date: string // YYYY-MM-DD or '' when the provider supplied no date
  time: string // HH:mm or ''
  timestamp?: number // UTC milliseconds when provider time is parseable
}

/**
 * Normalizes raw calendar event temporal properties into standard date, time, and timestamp.
 */
export function parseCalendarTimestamp(item: Record<string, unknown>): ParsedCalendarTime {
  const rawTimestamp = item.timestamp ?? item.time_epoch ?? item.timeEpoch
  if (typeof rawTimestamp === 'number' && !isNaN(rawTimestamp)) {
    // If it looks like seconds (< 1e11), convert to ms
    const ms = rawTimestamp < 1e11 ? rawTimestamp * 1000 : rawTimestamp
    const d = new Date(ms)
    if (!isNaN(d.getTime())) {
      const date = d.toISOString().split('T')[0]
      const time =
        typeof item.time === 'string' && item.time.trim()
          ? item.time.trim()
          : d.toISOString().substring(11, 16)
      return { date, time, timestamp: ms }
    }
  }

  const rawDateTime = item.datetime ?? item.dateTime ?? item.date_time
  if (typeof rawDateTime === 'string' && rawDateTime.trim()) {
    const d = new Date(rawDateTime.trim())
    if (!isNaN(d.getTime())) {
      const ms = d.getTime()
      const date = d.toISOString().split('T')[0]
      const time =
        typeof item.time === 'string' && item.time.trim()
          ? item.time.trim()
          : d.toISOString().substring(11, 16)
      return { date, time, timestamp: ms }
    }
  }

  const rawDate = typeof item.date === 'string' ? item.date.trim() : ''
  const rawTime = typeof item.time === 'string' ? item.time.trim() : ''

  if (rawDate) {
    if (rawTime) {
      // Try combined date + time
      const timeClean = rawTime.includes(':') ? rawTime : `${rawTime}:00`
      const combined = `${rawDate}T${timeClean.length === 5 ? timeClean + ':00' : timeClean}Z`
      const d = new Date(combined)
      if (!isNaN(d.getTime())) {
        return { date: rawDate, time: rawTime, timestamp: d.getTime() }
      }
      const localD = new Date(`${rawDate} ${rawTime}`)
      if (!isNaN(localD.getTime())) {
        return { date: rawDate, time: rawTime, timestamp: localD.getTime() }
      }
    }
    const d = new Date(rawDate)
    if (!isNaN(d.getTime())) {
      return { date: rawDate, time: '', timestamp: d.getTime() }
    }
  }

  return { date: '', time: rawTime }
}
