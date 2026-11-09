import { addCalendarItem, setTaskTime, updateCalendarItem } from '../model/calendar'
import { scheduleTask } from '../model/schedule'
import { completeOn, findTask, moveTask } from '../model/tasks'
import { clampBlock, formatTime, GRID_END, GRID_START, placeAt, snap, SNAP, type TimeBlock } from '../model/timeblock'
import type { Change, FlowData, ISODate } from '../model/types'

/**
 * Pure Week-calendar handlers: where a drop, drag or key press puts a block (snapped to 15 minutes,
 * inside 07:00–24:00, at least 15 minutes) and the Change it makes. The components only measure the
 * pointer and call these.
 */

/** Where a task lands in the Week view. */
export type WeekTarget =
  | { kind: 'unscheduled' }
  | { kind: 'strip'; date: ISODate }
  | { kind: 'grid'; date: ISODate; block: TimeBlock }

const floorSlot = (min: number) => Math.floor(min / SNAP) * SNAP
const ceilSlot = (min: number) => Math.ceil(min / SNAP) * SNAP
const clampMin = (min: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, min))

/** A click on empty grid: one hour from the 15-minute slot clicked (shifted up to end by 24:00). */
export function clickBlock(min: number): TimeBlock {
  return placeAt(floorSlot(clampMin(min, GRID_START, GRID_END - SNAP)))
}

/** A drag on empty grid between two times (either direction): the slots it covers. */
export function spanBlock(a: number, b: number): TimeBlock {
  const lo = clampMin(Math.min(a, b), GRID_START, GRID_END - SNAP)
  const hi = clampMin(Math.max(a, b), GRID_START, GRID_END)
  const start = floorSlot(lo)
  return { start, end: Math.max(start + SNAP, ceilSlot(hi)) }
}

/** A task dropped into the grid from a strip or the drawer: one hour from the slot under the pointer (as a click). */
export function stripDropBlock(min: number): TimeBlock {
  return clickBlock(min)
}

/** A block dragged to start at `start`: same length, snapped and kept inside the grid. */
export function moveBlock(b: TimeBlock, start: number): TimeBlock {
  return clampBlock({ start, end: start + (b.end - b.start) })
}

/** A block's top or bottom edge dragged to `min` (snapped; at least 15 minutes; inside the grid). */
export function resizeBlock(b: TimeBlock, edge: 'top' | 'bottom', min: number): TimeBlock {
  if (edge === 'top') return { start: clampMin(snap(min), GRID_START, b.end - SNAP), end: b.end }
  return { start: b.start, end: clampMin(snap(min), b.start + SNAP, GRID_END) }
}

/** Alt+↑/↓ moves the block 15 minutes; with Shift (`end`) only its end moves. */
export function nudgeBlock(b: TimeBlock, dir: 'up' | 'down', end: boolean): TimeBlock {
  const step = dir === 'up' ? -SNAP : SNAP
  return end ? resizeBlock(b, 'bottom', b.end + step) : moveBlock(b, b.start + step)
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** Screen-reader label (the only place a time is written out): "Swim, Thursday 18:00 to 19:30". */
export function blockLabel(title: string, date: ISODate, b: TimeBlock): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${title}, ${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${hhmm(b.start)} to ${hhmm(b.end)}`
}

const none = (d: FlowData): Change => ({ data: d, changed: [] })

/** Several changes in a row as one Change. */
function seq(d: FlowData, ...steps: ((d: FlowData) => Change)[]): Change {
  let data = d
  const changed = new Set<string>()
  for (const step of steps) {
    const c = step(data)
    data = c.data
    c.changed.forEach((p) => changed.add(p))
  }
  return { data, changed: [...changed] }
}

/**
 * A task dropped in the Week view, as one Change:
 * - `unscheduled` → an undated To do task (no time);
 * - a past day (strip or grid) → done that day (`completeOn`, no time);
 * - today → Today (`moveTask`, a done task reopens), then the grid's time or, on the strip, no time;
 * - a future day → planned for it (a done task reopens first), then the grid's time or none.
 * No change at all when a file it would write is skipped.
 */
export function dropTask(d: FlowData, ref: string, target: WeekTarget, today: ISODate): Change {
  if (!findTask(d, ref)) return none(d)
  const reopen = (x: FlowData) => (findTask(x, ref)?.task.status === 'done' ? moveTask(x, ref, 'todo', today) : none(x))
  let c: Change
  if (target.kind === 'unscheduled') {
    const toTodo = (x: FlowData) => (findTask(x, ref)?.task.status === 'todo' ? none(x) : moveTask(x, ref, 'todo', today))
    c = seq(d, toTodo, (x) => scheduleTask(x, ref, null, today))
  } else if (target.date < today) {
    c = completeOn(d, ref, target.date, today)
  } else {
    const date = target.date
    const toDay = date === today
      ? (x: FlowData) => moveTask(x, ref, 'today', today)
      : (x: FlowData) => seq(x, reopen, (y) => scheduleTask(y, ref, date, today))
    // moveTask(today) keeps an old time and scheduleTask keeps it on the same day: set it here.
    const time = target.kind === 'grid' ? formatTime(clampBlock(target.block)) : null
    c = seq(d, toDay, (x) => setTaskTime(x, ref, time))
  }
  return c.changed.some((p) => d.skipped.includes(p)) ? none(d) : c
}

/**
 * A task block moved or resized in the grid (pointer or Alt+arrows), from day `from` to `to`. On
 * the same day only its time changes (`setTaskTime`, never the day-drop rules: on a past day those
 * would complete it); on another day the Week drop rules apply (`dropTask`).
 */
export function placeTask(d: FlowData, ref: string, from: ISODate, to: ISODate, block: TimeBlock, today: ISODate): Change {
  if (from !== to) return dropTask(d, ref, { kind: 'grid', date: to, block }, today)
  return setTaskTime(d, ref, formatTime(clampBlock(block)))
}

/** A week-only item moved or resized to `date` and `block` (another ISO week moves it to that file). */
export function dropItem(d: FlowData, id: string, date: ISODate, block: TimeBlock): Change {
  return updateCalendarItem(d, id, { date, time: formatTime(clampBlock(block)) })
}

/** A new week-only item (blank title: nothing). */
export function createItem(d: FlowData, title: string, date: ISODate, block: TimeBlock): Change & { id?: string } {
  return addCalendarItem(d, { title, date, time: formatTime(clampBlock(block)) })
}
