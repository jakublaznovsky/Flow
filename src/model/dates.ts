import type { ISODate } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date as ISO YYYY-MM-DD (not UTC). */
export function localDate(d: Date = new Date()): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
