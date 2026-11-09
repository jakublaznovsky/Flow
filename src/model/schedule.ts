import { taskCard, sortCards, type Card } from './board'
import { addDays } from './dates'
import { doneOn } from './stats'
import { findTask, moveTask } from './tasks'
import { projectPath, type Change, type DoneEntry, type FlowData, type ISODate, type Task } from './types'

const merge = (a: string[], b: string[]) => [...new Set([...a, ...b])]

/** Set or clear the `scheduled` field of a task (no other bookkeeping). */
function setScheduled(d: FlowData, ref: string, date: ISODate | undefined): Change {
  const found = findTask(d, ref)
  if (!found || found.task.scheduled === date) return { data: d, changed: [] }
  const project = structuredClone(found.project)
  const task = project.tasks.find((t) => t.id === found.task.id)!
  if (date === undefined) delete task.scheduled
  else task.scheduled = date
  return { data: { ...d, projects: { ...d.projects, [project.slug]: project } }, changed: [projectPath(project.slug)] }
}

/** Remove a task's Week-grid time (no other bookkeeping). */
function dropTime(d: FlowData, ref: string): Change {
  const found = findTask(d, ref)
  if (!found || found.task.time === undefined) return { data: d, changed: [] }
  const project = structuredClone(found.project)
  delete project.tasks.find((t) => t.id === found.task.id)!.time
  return { data: { ...d, projects: { ...d.projects, [project.slug]: project } }, changed: [projectPath(project.slug)] }
}

/** The day a task is on in the Week view: its scheduled day, or today for a Today task. */
const weekDayOf = (t: Task, today: ISODate): ISODate | undefined => (t.status === 'today' ? today : t.scheduled)

/**
 * Plan a task for a day. A future date keeps (or puts) it in To do with `scheduled` set;
 * today or earlier moves it to Today now and clears the date; null clears the date only.
 * Done tasks are left alone. When the task's Week day changes (or it becomes unscheduled), its
 * `time` is removed, unless `keepTime` (Board moves between To do / Today / Tomorrow keep it).
 * A caller that gives it a new time calls `setTaskTime` afterwards.
 */
export function scheduleTask(
  d: FlowData, ref: string, date: ISODate | null, today: ISODate, opts: { keepTime?: boolean } = {},
): Change {
  const found = findTask(d, ref)
  if (!found || found.task.status === 'done') return { data: d, changed: [] }
  const newDay = date === null ? undefined : date <= today ? today : date
  // Unscheduling always removes the time (even from a task already without a Week day).
  const timeGoes = !opts.keepTime && found.task.time !== undefined && (date === null || weekDayOf(found.task, today) !== newDay)
  const cleared = timeGoes ? dropTime(d, ref) : { data: d, changed: [] }
  if (date === null) {
    const set = setScheduled(cleared.data, ref, undefined)
    return { data: set.data, changed: merge(cleared.changed, set.changed) }
  }
  const moved = moveTask(cleared.data, ref, date <= today ? 'today' : 'todo', today)
  const set = setScheduled(moved.data, ref, date <= today ? undefined : date)
  return { data: set.data, changed: merge(merge(cleared.changed, moved.changed), set.changed) }
}

/**
 * Every To do task of an active project scheduled on or before today moves to Today and loses
 * its date; one Change. Tasks of paused/done/archived projects keep waiting with their date.
 */
export function promoteScheduled(d: FlowData, today: ISODate): Change {
  let data = d
  let changed: string[] = []
  for (const project of Object.values(d.projects)) {
    if (project.status !== 'active') continue
    for (const t of project.tasks) {
      if (t.status !== 'todo' || t.scheduled === undefined || t.scheduled > today) continue
      const c = scheduleTask(data, `${project.slug}/${t.id}`, today, today)
      data = c.data
      changed = merge(changed, c.changed)
    }
  }
  return { data, changed }
}

/** `inToday`: tasks in the Today column, listed on today's day only (empty on other days). */
export interface WeekDay { date: ISODate; scheduled: Card[]; inToday: Card[]; done: DoneEntry[] }

/**
 * The 7 days from `weekStartDate` with scheduled To do tasks and completed entries, plus unscheduled
 * To do tasks. When `today` is given and falls in the week, its day also lists the Today tasks.
 */
export function weekPlan(
  d: FlowData, weekStartDate: ISODate, filter: string | null, today?: ISODate,
): { days: WeekDay[]; unscheduled: Card[] } {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i))
  const byDate = new Map<ISODate, Card[]>(dates.map((date) => [date, []]))
  const unscheduled: Card[] = []
  const inToday: Card[] = []
  for (const project of Object.values(d.projects)) {
    if (project.status !== 'active') continue
    if (filter !== null && project.slug !== filter) continue
    for (const t of project.tasks) {
      if (t.status === 'today') inToday.push(taskCard(project, t))
      if (t.status !== 'todo') continue
      if (t.scheduled === undefined) unscheduled.push(taskCard(project, t))
      else byDate.get(t.scheduled)?.push(taskCard(project, t))
    }
  }
  const inFilter = (e: DoneEntry) => filter === null || e.ref.startsWith(`${filter}/`)
  return {
    days: dates.map((date) => ({
      date,
      scheduled: sortCards(byDate.get(date)!, undefined),
      inToday: date === today ? sortCards(inToday, undefined) : [],
      done: doneOn(d, date).filter(inFilter),
    })),
    unscheduled: sortCards(unscheduled, undefined),
  }
}
