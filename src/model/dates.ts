import type { ISODate } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date as ISO YYYY-MM-DD (not UTC). */
export function localDate(d: Date = new Date()): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parse(date: ISODate): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m, d]
}

/** Add n calendar days (negative allowed). Built from y/m/d so DST cannot shift the result. */
export function addDays(date: ISODate, n: number): ISODate {
  const [y, m, d] = parse(date)
  return localDate(new Date(y, m - 1, d + n))
}

/** Monday of the week containing the date. */
export function weekStart(date: ISODate): ISODate {
  const [y, m, d] = parse(date)
  const dow = new Date(y, m - 1, d).getDay() // 0 = Sunday
  return addDays(date, -((dow + 6) % 7))
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Short English names for showing a date ("Thu", 5, "Nov", 2026). */
export function dayParts(date: ISODate): { weekday: string; day: number; month: string; year: number } {
  const [y, m, d] = parse(date)
  return { weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()], day: d, month: MONTHS[m - 1], year: y }
}

/** ISO-8601 week of a date as `YYYY-Www` (the week belongs to the year of its Thursday). */
export function isoWeek(date: ISODate): string {
  const thursday = addDays(weekStart(date), 3)
  const [y, m, d] = parse(thursday)
  const jan1 = new Date(y, 0, 1)
  const dayOfYear = Math.round((new Date(y, m - 1, d).getTime() - jan1.getTime()) / 86_400_000)
  return `${y}-W${pad(Math.floor(dayOfYear / 7) + 1)}`
}

/** Calendar days from a to b (negative when b is earlier). Counted in UTC so DST cannot skew it. */
export function daysBetween(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = parse(a)
  const [by, bm, bd] = parse(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** True for a real calendar date written as YYYY-MM-DD (2026-02-30 is not). */
export function isISODate(v: unknown): v is ISODate {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = parse(v)
  return localDate(new Date(y, m - 1, d)) === v
}
