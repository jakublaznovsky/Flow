import { describe, it, expect } from 'vitest'
import { localDate, addDays, weekStart, dayParts, isoWeek, daysBetween } from './dates'

describe('localDate', () => {
  it('formats a date as ISO YYYY-MM-DD in local time', () => {
    expect(localDate(new Date(2026, 10, 3, 23, 30))).toBe('2026-11-03')
  })

  it('zero-pads month and day', () => {
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('defaults to the current date', () => {
    expect(localDate()).toBe(localDate(new Date()))
  })
})

describe('addDays', () => {
  it('adds and subtracts days', () => {
    expect(addDays('2026-11-04', 1)).toBe('2026-11-05')
    expect(addDays('2026-11-04', -4)).toBe('2026-10-31')
  })
  it('crosses the EU DST change (2026-03-29)', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-03-30', -2)).toBe('2026-03-28')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
  })
  it('crosses year end', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })
})

describe('weekStart', () => {
  it('returns the Monday for a Sunday', () => {
    expect(weekStart('2026-11-08')).toBe('2026-11-02')
  })
  it('returns the same day for a Monday', () => {
    expect(weekStart('2026-11-02')).toBe('2026-11-02')
  })
  it('works mid-week and across month boundary', () => {
    expect(weekStart('2026-11-04')).toBe('2026-11-02')
    expect(weekStart('2026-12-01')).toBe('2026-11-30')
  })
})

describe('dayParts', () => {
  it('names weekday, day, month and year in local time', () => {
    expect(dayParts('2026-11-05')).toEqual({ weekday: 'Thu', day: 5, month: 'Nov', year: 2026 })
    expect(dayParts('2027-01-03')).toEqual({ weekday: 'Sun', day: 3, month: 'Jan', year: 2027 })
  })
})

describe('isoWeek', () => {
  it('numbers ISO-8601 weeks (Thursday rule)', () => {
    expect(isoWeek('2026-11-04')).toBe('2026-W45')
    expect(isoWeek('2026-11-02')).toBe('2026-W45')
    expect(isoWeek('2026-11-08')).toBe('2026-W45')
    expect(isoWeek('2026-11-09')).toBe('2026-W46')
    expect(isoWeek('2026-12-31')).toBe('2026-W53')
    expect(isoWeek('2027-01-01')).toBe('2026-W53')
    expect(isoWeek('2027-01-03')).toBe('2026-W53')
    expect(isoWeek('2027-01-04')).toBe('2027-W01')
    expect(isoWeek('2024-12-30')).toBe('2025-W01')
    expect(isoWeek('2026-01-01')).toBe('2026-W01')
  })
})

describe('daysBetween', () => {
  it('counts calendar days from a to b (negative when b is earlier)', () => {
    expect(daysBetween('2026-11-02', '2026-11-09')).toBe(7)
    expect(daysBetween('2026-11-09', '2026-11-02')).toBe(-7)
    expect(daysBetween('2026-11-02', '2027-03-01')).toBe(119)
  })
  it('is not shifted by DST changes', () => {
    expect(daysBetween('2026-03-23', '2026-03-30')).toBe(7)
    expect(daysBetween('2026-10-19', '2026-11-02')).toBe(14)
  })
})
