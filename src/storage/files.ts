import { Scalar } from 'yaml'
import type { CalendarItem, CalendarWeek, Day, DoneEntry, Extra, FocusEntry, ISODate, Inbox, InboxItem, Notes, Project, Review, ProjectStatus, Step, Task, TaskStatus } from '../model/types'
import { isISODate } from '../model/dates'
import { nextCalendarItemId, nextInboxId, nextTaskId, pickColor } from '../model/ids'
import { parseTime } from '../model/timeblock'
import { joinFrontmatter, splitFrontmatter } from './frontmatter'

type Obj = Record<string, unknown>

const PROJECT_STATUSES: ProjectStatus[] = ['active', 'paused', 'done', 'archived']
const TASK_STATUSES: TaskStatus[] = ['todo', 'today', 'done']

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const present = (v: unknown) => v !== undefined && v !== null && v !== ''
const str = (v: unknown): string => {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v)
  throw new Error(`expected text, got ${Array.isArray(v) ? 'a list' : typeof v === 'object' && v !== null ? 'a mapping' : String(v)}`)
}
/** Status values are matched case-insensitively and ignoring surrounding spaces. */
const status = <S extends string>(v: unknown, allowed: S[], fallback: S): S => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return allowed.includes(s as S) ? (s as S) : fallback
}
const optStr = (v: unknown): string | undefined => (present(v) ? str(v) : undefined)

function pickExtra(o: Obj, known: string[]): Extra {
  const extra: Extra = {}
  for (const k of Object.keys(o)) if (!known.includes(k)) extra[k] = o[k]
  return extra
}

function list(v: unknown, what: string): unknown[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw new Error(`${what} must be a list`)
  return v
}

/** Keep first occurrence of each valid id; give missing/duplicate ids a fresh one. */
function assignIds<T extends { id: string }>(items: (Omit<T, 'id'> & { id?: string })[], next: (kept: { id: string }[]) => string): T[] {
  const kept: { id: string }[] = []
  const seen = new Set<string>()
  for (const it of items) {
    if (it.id && !seen.has(it.id)) {
      seen.add(it.id)
      kept.push({ id: it.id })
    } else {
      it.id = undefined
    }
  }
  for (const it of items) {
    if (!it.id) {
      it.id = next(kept)
      kept.push({ id: it.id })
    }
  }
  return items as T[]
}

const TASK_KNOWN = ['id', 'title', 'status', 'first_step', 'created', 'planned', 'done', 'scheduled', 'time', 'steps']

/** Optional strict date: absent → undefined; anything but a YYYY-MM-DD string fails the file. */
function optDate(v: unknown, what: string): ISODate | undefined {
  if (v === undefined || v === null) return undefined
  // Rejects impossible calendar dates too (2026-02-30, 2026-13-45).
  if (!isISODate(v)) throw new Error(`${what} must be a date like 2026-11-06`)
  return v
}

/** Strict "HH:MM-HH:MM" (15-minute steps, 07:00-24:00): anything else fails the file. */
function strictTime(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`${what} must be text like "09:00-10:30"`)
  parseTime(v)
  return v
}
const optTime = (v: unknown, what: string): string | undefined => (v === undefined || v === null ? undefined : strictTime(v, what))

/** A double-quoted YAML string (so `09:00-10:30` and `2026-W46` read the same in every YAML tool). */
const quoted = (s: string): Scalar => {
  const node = new Scalar(s)
  node.type = 'QUOTE_DOUBLE'
  return node
}

function parseSteps(v: unknown): Step[] | undefined {
  const items = list(v, 'steps').map((raw): Step => {
    if (!isObj(raw)) throw new Error('step must be a mapping')
    if (typeof raw.text !== 'string' || !raw.text.trim()) throw new Error('step text must be a non-empty string')
    if (typeof raw.done !== 'boolean') throw new Error('step done must be true or false')
    return { text: raw.text, done: raw.done, extra: pickExtra(raw, ['text', 'done']) }
  })
  return items.length > 0 ? items : undefined
}

function parseTask(raw: unknown, today: ISODate): Omit<Task, 'id'> & { id?: string } {
  if (!isObj(raw)) throw new Error('task must be a mapping')
  if (!present(raw.title)) throw new Error('task is missing title')
  return {
    id: optStr(raw.id),
    title: str(raw.title),
    status: status(raw.status, TASK_STATUSES, 'todo'),
    firstStep: optStr(raw.first_step),
    created: present(raw.created) ? str(raw.created) : today,
    planned: optStr(raw.planned),
    done: optStr(raw.done),
    scheduled: optDate(raw.scheduled, 'scheduled'),
    time: optTime(raw.time, 'time'),
    steps: parseSteps(raw.steps),
    extra: pickExtra(raw, TASK_KNOWN),
  }
}

function taskToObj(t: Task): Obj {
  const o: Obj = { id: t.id, title: t.title, status: t.status }
  if (t.firstStep !== undefined) o.first_step = t.firstStep
  o.created = t.created
  if (t.planned !== undefined) o.planned = t.planned
  if (t.done !== undefined) o.done = t.done
  if (t.scheduled !== undefined) o.scheduled = t.scheduled
  if (t.time !== undefined) o.time = quoted(t.time)
  if (t.steps && t.steps.length > 0) o.steps = t.steps.map((s) => ({ text: s.text, done: s.done, ...s.extra }))
  return { ...o, ...t.extra }
}

const PROJECT_KNOWN = ['title', 'status', 'color', 'goal', 'created', 'tasks']

export function parseProject(slug: string, text: string, today: ISODate): Project {
  const { data, body } = splitFrontmatter(text)
  if (!present(data.title)) throw new Error('project is missing title')
    const rawTasks = list(data.tasks, 'tasks').map((t) => parseTask(t, today))
  return {
    slug,
    title: str(data.title),
    status: status(data.status, PROJECT_STATUSES, 'active'),
    color: present(data.color) ? str(data.color) : pickColor(0),
    goal: optStr(data.goal),
    created: present(data.created) ? str(data.created) : today,
    tasks: assignIds<Task>(rawTasks, nextTaskId),
    body,
    extra: pickExtra(data, PROJECT_KNOWN),
  }
}

export function serializeProject(p: Project): string {
  const o: Obj = { title: p.title, status: p.status, color: p.color }
  if (p.goal !== undefined) o.goal = p.goal
  o.created = p.created
  o.tasks = p.tasks.map(taskToObj)
  return joinFrontmatter({ ...o, ...p.extra }, p.body)
}

const ITEM_KNOWN = ['id', 'text', 'created']

export function parseInbox(text: string, today: ISODate): Inbox {
  const { data, body } = splitFrontmatter(text)
  const rawItems = list(data.items, 'items').map((raw) => {
    if (!isObj(raw)) throw new Error('inbox item must be a mapping')
    if (!present(raw.text)) throw new Error('inbox item is missing text')
    return {
      id: optStr(raw.id),
      text: str(raw.text),
      created: present(raw.created) ? str(raw.created) : today,
      extra: pickExtra(raw, ITEM_KNOWN),
    }
  })
  return {
    items: assignIds<InboxItem>(rawItems, nextInboxId),
    body,
    extra: pickExtra(data, ['items']),
  }
}

export function serializeInbox(i: Inbox): string {
  const items = i.items.map((it) => ({ id: it.id, text: it.text, created: it.created, ...it.extra }))
  return joinFrontmatter({ items, ...i.extra }, i.body)
}

export function parseDay(date: ISODate, text: string): Day {
  const { data, body } = splitFrontmatter(text)
  const planned = list(data.planned, 'planned').map(str)
  const done = list(data.done, 'done').map((raw): DoneEntry => {
    if (!isObj(raw)) throw new Error('done entry must be a mapping')
    if (!present(raw.ref)) throw new Error('done entry is missing ref')
    return {
      ref: str(raw.ref), title: str(raw.title ?? ''), project: str(raw.project ?? ''),
      extra: pickExtra(raw, ['ref', 'title', 'project']),
    }
  })
  const focus = list(data.focus, 'focus').map((raw): FocusEntry => {
    if (!isObj(raw)) throw new Error('focus entry must be a mapping')
    if (!present(raw.ref)) throw new Error('focus entry is missing ref')
    const minutes = raw.minutes
    if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 0) {
      throw new Error('focus entry minutes must be a non-negative integer')
    }
    return {
      ref: str(raw.ref), title: str(raw.title ?? ''), project: str(raw.project ?? ''), minutes,
      extra: pickExtra(raw, ['ref', 'title', 'project', 'minutes']),
    }
  })
  return { date, planned, done, focus, body, extra: pickExtra(data, ['date', 'planned', 'done', 'focus']) }
}

export function serializeDay(d: Day): string {
  const done = d.done.map((e) => ({ ref: e.ref, title: e.title, project: e.project, ...e.extra }))
  const o: Obj = { date: d.date, planned: d.planned, done }
  if (d.focus.length > 0) {
    o.focus = d.focus.map((e) => ({ ref: e.ref, title: e.title, project: e.project, minutes: e.minutes, ...e.extra }))
  }
  return joinFrontmatter({ ...o, ...d.extra }, d.body)
}

/** notes.md: free Markdown; optional frontmatter is kept untouched as `extra`. */
export function parseNotes(text: string): Notes {
  const { data, body } = splitFrontmatter(text)
  return { body, extra: { ...data } }
}

export function serializeNotes(n: Notes): string {
  // Plain text when there is no frontmatter, unless the text itself opens with a `---` line.
  if (Object.keys(n.extra).length === 0 && !/^(?:\uFEFF)?(?:[ \t\r]*\n)*---[ \t\r]*(?:\n|$)/.test(n.body)) return n.body
  return joinFrontmatter(n.extra, n.body)
}

/** reviews/YYYY-Www.md: week, optional focus_project and intention (strict text); body is the reflection. */
export function parseReview(week: string, text: string): Review {
  const { data, body } = splitFrontmatter(text)
  const strict = (v: unknown, what: string): string | undefined => {
    if (v === undefined || v === null) return undefined
    if (typeof v !== 'string') throw new Error(`${what} must be text`)
    return v === '' ? undefined : v
  }
  const r: Review = { week: strict(data.week, 'week') ?? week, body, extra: pickExtra(data, ['week', 'focus_project', 'intention']) }
  const focusProject = strict(data.focus_project, 'focus_project')
  const intention = strict(data.intention, 'intention')
  if (focusProject !== undefined) r.focusProject = focusProject
  if (intention !== undefined) r.intention = intention
  return r
}

export function serializeReview(r: Review): string {
  const o: Obj = { week: r.week }
  if (r.focusProject !== undefined) o.focus_project = r.focusProject
  if (r.intention !== undefined) o.intention = r.intention
  return joinFrontmatter({ ...o, ...r.extra }, r.body)
}

const CAL_ITEM_KNOWN = ['id', 'title', 'date', 'time']

/**
 * calendar/YYYY-Www.md: `week` (text; the file name when missing) and `items` of week-only entries
 * `{ id, title, date, time }`, all strict; missing/repeated ids get a fresh `c<n>`; body kept.
 */
export function parseCalendarWeek(week: string, text: string): CalendarWeek {
  const { data, body } = splitFrontmatter(text)
  if (data.week !== undefined && data.week !== null && typeof data.week !== 'string') throw new Error('week must be text')
  const rawItems = list(data.items, 'items').map((raw) => {
    if (!isObj(raw)) throw new Error('calendar item must be a mapping')
    if (raw.id !== undefined && raw.id !== null && typeof raw.id !== 'string') throw new Error('calendar item id must be text')
    if (typeof raw.title !== 'string' || !raw.title.trim()) throw new Error('calendar item title must be non-empty text')
    const date = optDate(raw.date, 'calendar item date')
    if (date === undefined) throw new Error('calendar item is missing date')
    return {
      id: raw.id || undefined, title: raw.title, date,
      time: strictTime(raw.time, 'calendar item time'),
      extra: pickExtra(raw, CAL_ITEM_KNOWN),
    }
  })
  return {
    week: typeof data.week === 'string' && data.week !== '' ? data.week : week,
    items: assignIds<CalendarItem>(rawItems, nextCalendarItemId),
    body,
    extra: pickExtra(data, ['week', 'items']),
  }
}

export function serializeCalendarWeek(w: CalendarWeek): string {
  const items = w.items.map((i) => ({ id: i.id, title: i.title, date: i.date, time: quoted(i.time), ...i.extra }))
  return joinFrontmatter({ week: quoted(w.week), items, ...w.extra }, w.body)
}
