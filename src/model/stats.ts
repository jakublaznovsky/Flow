import type { DoneEntry, FlowData, ISODate } from './types'
import { addDays, weekStart } from './dates'

/** The 7 dates Monday..Sunday of the week containing today. */
export function weekDates(today: ISODate): ISODate[] {
  const start = weekStart(today)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function doneOn(d: FlowData, date: ISODate): DoneEntry[] {
  return d.days[date]?.done ?? []
}

export function focusMinutesOn(d: FlowData, date: ISODate): number {
  return (d.days[date]?.focus ?? []).reduce((sum, f) => sum + f.minutes, 0)
}

export interface HeatCell { date: ISODate; count: number; level: 0 | 1 | 2 | 3 | 4; future: boolean }

function level(count: number): HeatCell['level'] {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 5) return 3
  return 4
}

/** `weeks` columns (oldest to newest) of 7 cells Monday..Sunday; the last column is the current week. */
export function heatmap(d: FlowData, today: ISODate, weeks = 53): HeatCell[][] {
  const first = addDays(weekStart(today), -7 * (weeks - 1))
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, r): HeatCell => {
      const date = addDays(first, w * 7 + r)
      if (date > today) return { date, count: 0, level: 0, future: true }
      const count = doneOn(d, date).length
      return { date, count, level: level(count), future: false }
    }))
}

export function projectProgress(
  d: FlowData, slug: string, today: ISODate,
): { done: number; total: number; doneLast7: number } {
  const tasks = d.projects[slug]?.tasks ?? []
  let doneLast7 = 0
  for (let i = 0; i < 7; i++) {
    doneLast7 += doneOn(d, addDays(today, -i)).filter((e) => e.ref.startsWith(`${slug}/`)).length
  }
  return { done: tasks.filter((t) => t.status === 'done').length, total: tasks.length, doneLast7 }
}
