import type { Card } from './board'
import { isISODate, isoWeek } from './dates'
import { nextCalendarItemId } from './ids'
import { findTask } from './tasks'
import { isTime, parseTime, type TimeBlock } from './timeblock'
import {
  calendarPath, projectPath, type CalendarItem, type CalendarWeek, type Change, type FlowData, type ISODate,
} from './types'

const noChange = (d: FlowData): Change => ({ data: d, changed: [] })
const emptyWeek = (week: string): CalendarWeek => ({ week, items: [], body: '', extra: {} })

/** Next week-only item id, past every id in every week file (`c1`, `c2`, …). */
export function nextCalendarId(d: FlowData): string {
  return nextCalendarItemId(Object.values(d.calendar).flatMap((w) => w.items))
}

/** The item with this id and the week file (ISO week key) it is kept in. */
export function findCalendarItem(d: FlowData, id: string): { week: string; item: CalendarItem } | undefined {
  for (const [week, w] of Object.entries(d.calendar)) {
    const item = w.items.find((i) => i.id === id)
    if (item) return { week, item }
  }
  return undefined
}

/**
 * Add a week-only item to `calendar/<ISO week of date>.md` (created when missing). Title is trimmed;
 * a blank title, invalid date or time, or a skipped week file changes nothing.
 */
export function addCalendarItem(
  d: FlowData, input: { title: string; date: ISODate; time: string },
): Change & { id?: string } {
  const title = input.title.trim()
  if (!title || !isISODate(input.date) || !isTime(input.time)) return noChange(d)
  const week = isoWeek(input.date)
  const path = calendarPath(week)
  if (d.skipped.includes(path)) return noChange(d)
  const id = nextCalendarId(d)
  const file = d.calendar[week] ? structuredClone(d.calendar[week]) : emptyWeek(week)
  file.items.push({ id, title, date: input.date, time: input.time, extra: {} })
  return { data: { ...d, calendar: { ...d.calendar, [week]: file } }, changed: [path], id }
}

/**
 * Rename, move or retime an item. A date in another ISO week moves it to that week's file (both
 * files in one Change; the old one keeps its other items, possibly none). A blank title, invalid
 * date/time, a skipped file, or a patch that changes nothing → no change.
 */
export function updateCalendarItem(
  d: FlowData, id: string, patch: { title?: string; date?: ISODate; time?: string },
): Change {
  const found = findCalendarItem(d, id)
  if (!found) return noChange(d)
  const title = patch.title === undefined ? found.item.title : patch.title.trim()
  const date = patch.date ?? found.item.date
  const time = patch.time ?? found.item.time
  if (!title || !isISODate(date) || !isTime(time)) return noChange(d)
  if (title === found.item.title && date === found.item.date && time === found.item.time) return noChange(d)
  const target = date === found.item.date ? found.week : isoWeek(date)
  const paths = [...new Set([calendarPath(found.week), calendarPath(target)])]
  if (paths.some((p) => d.skipped.includes(p))) return noChange(d)

  const from = structuredClone(d.calendar[found.week])
  const index = from.items.findIndex((i) => i.id === id)
  const moved: CalendarItem = { ...from.items[index], title, date, time }
  const calendar = { ...d.calendar }
  if (target === found.week) {
    from.items[index] = moved
  } else {
    from.items.splice(index, 1)
    const to = d.calendar[target] ? structuredClone(d.calendar[target]) : emptyWeek(target)
    to.items.push(moved)
    calendar[target] = to
  }
  calendar[found.week] = from
  return { data: { ...d, calendar }, changed: paths }
}

/** Remove an item; its week file stays (with `items: []` when it was the last). Skipped file → no change. */
export function deleteCalendarItem(d: FlowData, id: string): Change {
  const found = findCalendarItem(d, id)
  if (!found) return noChange(d)
  const path = calendarPath(found.week)
  if (d.skipped.includes(path)) return noChange(d)
  const file = structuredClone(d.calendar[found.week])
  file.items = file.items.filter((i) => i.id !== id)
  return { data: { ...d, calendar: { ...d.calendar, [found.week]: file } }, changed: [path] }
}

const startOf = (time: string) => parseTime(time).start

/** Week-only items on a date (from any week file), earliest first. */
export function itemsOn(d: FlowData, date: ISODate): CalendarItem[] {
  const out: CalendarItem[] = []
  for (const w of Object.values(d.calendar)) for (const i of w.items) if (i.date === date) out.push(i)
  return out.sort((a, b) => startOf(a.time) - startOf(b.time) || a.title.localeCompare(b.title))
}

/**
 * Make item ids unique across week files (hand-written files may repeat them) in memory only: the
 * first occurrence keeps its id and later ones get fresh ids. Items in `renameFirst` weeks are
 * renamed in preference (a freshly reloaded file yields to the files already loaded).
 * Returns `d` itself when nothing repeats.
 */
export function dedupeCalendarIds(d: FlowData, renameFirst: string[] = []): FlowData {
  const weeks = Object.keys(d.calendar)
  const order = [...weeks.filter((w) => !renameFirst.includes(w)), ...weeks.filter((w) => renameFirst.includes(w))]
  const seen = new Set<string>()
  const dupes: [string, number][] = []
  for (const week of order) {
    d.calendar[week].items.forEach((item, i) => {
      if (seen.has(item.id)) dupes.push([week, i])
      else seen.add(item.id)
    })
  }
  if (dupes.length === 0) return d
  const calendar = { ...d.calendar }
  let next = Number(nextCalendarId(d).slice(1))
  for (const [week, i] of dupes) {
    if (calendar[week] === d.calendar[week]) calendar[week] = structuredClone(d.calendar[week])
    calendar[week].items[i].id = `c${next++}`
  }
  return { ...d, calendar }
}

/**
 * Set (valid "HH:MM-HH:MM") or clear (null) a task's time on its Week day. Done tasks have no time;
 * an unknown task, a done task, an invalid time, the same value or a skipped project → no change.
 */
export function setTaskTime(d: FlowData, ref: string, time: string | null): Change {
  const found = findTask(d, ref)
  if (!found || found.task.status === 'done') return noChange(d)
  if (time !== null && !isTime(time)) return noChange(d)
  if ((found.task.time ?? null) === time) return noChange(d)
  const path = projectPath(found.project.slug)
  if (d.skipped.includes(path)) return noChange(d)
  const project = structuredClone(found.project)
  const task = project.tasks.find((t) => t.id === found.task.id)!
  if (time === null) delete task.time
  else task.time = time
  return { data: { ...d, projects: { ...d.projects, [project.slug]: project } }, changed: [path] }
}

/** A day's task cards split for the Week grid: timed ones (with their block, earliest first) and untimed ones. */
export function splitByTime(cards: Card[]): { timed: (Card & { block: TimeBlock })[]; untimed: Card[] } {
  const timed: (Card & { block: TimeBlock })[] = []
  const untimed: Card[] = []
  for (const c of cards) {
    if (c.time !== undefined && isTime(c.time)) timed.push({ ...c, block: parseTime(c.time) })
    else untimed.push(c)
  }
  timed.sort((a, b) => a.block.start - b.block.start)
  return { timed, untimed }
}
