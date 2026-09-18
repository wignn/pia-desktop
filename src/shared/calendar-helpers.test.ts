import { describe, it, expect } from 'vitest'
import { parseCalendarTimestamp } from './calendar-helpers'

describe('calendar-helpers', () => {
  describe('parseCalendarTimestamp', () => {
    it('parses numeric millisecond timestamp', () => {
      const ts = 1715767200000 // 2024-05-15T10:00:00.000Z
      const result = parseCalendarTimestamp({ timestamp: ts })
      expect(result.timestamp).toBe(ts)
      expect(result.date).toBe('2024-05-15')
    })

    it('converts second timestamp (<1e11) to milliseconds', () => {
      const sec = 1715767200 // 2024-05-15 10:00:00 UTC
      const result = parseCalendarTimestamp({ timestamp: sec })
      expect(result.timestamp).toBe(sec * 1000)
      expect(result.date).toBe('2024-05-15')
    })

    it('parses ISO datetime string', () => {
      const result = parseCalendarTimestamp({ datetime: '2026-05-15T14:30:00Z' })
      expect(result.date).toBe('2026-05-15')
      expect(result.time).toBe('14:30')
      expect(result.timestamp).toBe(new Date('2026-05-15T14:30:00Z').getTime())
    })

    it('parses separate date and time strings', () => {
      const result = parseCalendarTimestamp({ date: '2026-06-01', time: '13:45' })
      expect(result.date).toBe('2026-06-01')
      expect(result.time).toBe('13:45')
      expect(result.timestamp).toBe(new Date('2026-06-01T13:45:00Z').getTime())
    })

    it('preserves explicit unavailability instead of fabricating a date or time', () => {
      expect(parseCalendarTimestamp({})).toEqual({ date: '', time: '' })
    })

    it('does not invent midnight for a date-only event', () => {
      expect(parseCalendarTimestamp({ date: '2026-06-01' })).toEqual({
        date: '2026-06-01',
        time: '',
        timestamp: new Date('2026-06-01').getTime()
      })
    })
  })
})
