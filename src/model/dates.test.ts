import { describe, it, expect } from 'vitest'
import { localDate } from './dates'

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
