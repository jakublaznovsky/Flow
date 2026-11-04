import { taskCard, sortCards, type Card } from './board'
import { addDays } from './dates'
import { doneOn } from './stats'
import { findTask, moveTask } from './tasks'
import { projectPath, type Change, type DoneEntry, type FlowData, type ISODate } from './types'

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

/**
 * Plan a task for a day. A future date keeps (or puts) it in To do with `scheduled` set;
 * today or earlier moves it to Today now and clears the date; null clears the date only.
 * Done tasks are left alone.
 */
export function scheduleTask(d: FlowData, ref: string, date: ISODate | null, today: ISODate): Change {
  const found = findTask(d, ref)
  if (!found || found.task.status === 'done') return { data: d, changed: [] }
  if (date === null) return setScheduled(d, ref, undefined)
  const moved = moveTask(d, ref, date <= today ? 'today' : 'todo', today)
  const set = setScheduled(moved.data, ref, date <= today ? undefined : date)
  return { data: set.data, changed: merge(moved.changed, set.changed) }
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
