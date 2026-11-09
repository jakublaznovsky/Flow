import type { FileStore } from './fileStore'
import { parseCalendarWeek, parseDay, parseInbox, parseNotes, parseProject, parseReview, serializeCalendarWeek, serializeReview, serializeDay, serializeInbox, serializeNotes, serializeProject } from './files'
import { dedupeCalendarIds } from '../model/calendar'
import { emptyFlow, INBOX_PATH, NOTES_PATH, type FlowData, type ISODate } from '../model/types'

const LOG_PATH = 'flow-issues.log'
const PROJECT_RE = /^projects\/([^/]+)\.md$/
const DAY_RE = /^days\/(\d{4}-\d{2}-\d{2})\.md$/
const REVIEW_RE = /^reviews\/(\d{4}-W\d{2})\.md$/
const CALENDAR_RE = /^calendar\/(\d{4}-W\d{2})\.md$/

export const README_TEXT = `# Flow

This folder is the single source of truth for Flow, a personal planner. Everything is
Markdown with YAML frontmatter. Dates are ISO YYYY-MM-DD in local time. You (or an AI)
can read and edit these files; Flow picks up changes.

## Layout

\`\`\`
Flow/
  README.md            # this file (written by Flow on first run)
  inbox.md             # parking lot
  notes.md             # general notes (created the first time you write some)
  projects/
    <slug>.md          # one file per project
  days/
    YYYY-MM-DD.md      # one file per day with activity
  reviews/
    YYYY-Www.md        # one file per weekly review (ISO week)
  calendar/
    YYYY-Www.md        # week-only calendar items (ISO week)
  deleted/
    <slug>-YYYY-MM-DD.md # deleted projects (moved here; move back to projects/ to restore)
  flow-issues.log      # unreadable files Flow skipped (for you or an AI)
\`\`\`

## Project file: projects/<slug>.md

\`\`\`markdown
---
title: Flow app
status: active          # active | paused | done | archived
color: "#4f8cff"
goal: Build my own ADHD-friendly planner
created: 2026-11-03
tasks:
  - id: t1
    title: Design the data format
    status: done        # todo | today | done
    first_step: List what a project needs
    created: 2026-11-03
    planned: 2026-11-03 # date it was last moved into Today
    done: 2026-11-03    # date it was completed
  - id: t2
    title: Set up Tauri project
    status: todo
    created: 2026-11-03
    scheduled: 2026-11-06 # planned for this day (see below)
    time: "09:00-10:30"   # its time on that day in the Week view (see below)
    steps:                # checklist inside the task
      - text: Install the prerequisites
        done: true
      - text: Run the app once
        done: false
---
Free notes about the project.

## Decisions
- 2026-11-03: Build with Tauri, data as Markdown files.
\`\`\`

- The slug (file name) is derived from the title at creation and never changes, even if
  the title is renamed, so references stay valid.
- Task ids are unique within a project (t1, t2, ... incrementing). The global task
  reference is <slug>/<id>, e.g. flow-app/t2.
- Optional task fields (first_step, planned, done, scheduled, time, steps) are omitted when empty.
- steps is a list of { text, done } checklist items. Ticking every step does not complete
  the task; the task's own status does that. Unknown fields on steps are kept.
- scheduled is a date the task is planned for (set in the Week view or the task's "Plan for"
  field). When that day arrives (or has passed), Flow moves a To do task of an active project
  into Today by itself (status today, planned set) and removes scheduled. Tasks of paused,
  done or archived projects keep waiting with their date.
- time is the task's slot in the Week view's time grid, written "HH:MM-HH:MM" (quoted, in
  15-minute steps, from 07:00 to 24:00, start before end), on the task's day (its scheduled
  day, or today for a task in Today). Flow removes it when the task is completed, moved to
  another day or unscheduled. It is only used by the Week view.
- The body (notes and ## Decisions) is free text. Flow preserves it unchanged.

## Parking lot: inbox.md

\`\`\`markdown
---
items:
  - id: i1
    text: Look into Spanish podcasts
    created: 2026-11-03
---
\`\`\`

Items have no project. An item becomes a task when it is assigned to a project.

## General notes: notes.md

Plain Markdown, written in the Notes view of Flow. The file is created the first time
you save general notes; if it is missing, the notes are simply empty. Optional YAML
frontmatter is kept as it is. Notes for a single project live in the body of that
project's file (projects/<slug>.md).

## Day file: days/YYYY-MM-DD.md

\`\`\`markdown
---
date: 2026-11-04
planned: [flow-app/t2, learn-spanish/t5]
done:
  - ref: flow-app/t2
    title: Set up Tauri project
    project: Flow app
focus:
  - ref: flow-app/t2
    title: Set up Tauri project
    project: Flow app
    minutes: 25
---
Optional free-text note.
\`\`\`

- planned: refs of tasks moved into Today on this date (appended; no duplicates).
- done: a snapshot of each completed task (ref plus title and project title at that
  moment), so the day's record stays readable if the task is later renamed or deleted.
- focus: one entry per finished or stopped focus session (ref, title and project snapshot,
  minutes as a whole number). Sessions shorter than 1 minute are not logged. The key is
  omitted when there are none.
- A day file is created only when something happens that day.

## Weekly review: reviews/YYYY-Www.md

\`\`\`markdown
---
week: 2026-W45
focus_project: flow-app
intention: Finish the weekly review
---
Free text: what went well, what got in the way.
\`\`\`

- One file per ISO week (Monday to Sunday; week 1 contains the first Thursday of the year),
  written by the guided Weekly review in Flow. The file is created the first time you save
  something in that week's review.
- focus_project is a project slug (the one starred in the sidebar that week); focus_project
  and intention are omitted when empty. The body is your reflection.

## Week calendar: calendar/YYYY-Www.md

\`\`\`markdown
---
week: "2026-W46"
items:
  - id: c1
    title: Swimming
    date: 2026-11-12
    time: "18:00-19:30"
---
\`\`\`

- Week-only items (leisure, sport, appointments) shown only in the Week view's time grid.
  One file per ISO week, created when the first item of that week is added; a file whose
  items were all removed stays with items: [].
- Each item has an id (c1, c2, ... unique across all weeks), a title, a date and a time
  ("HH:MM-HH:MM" as for tasks). Unknown fields are kept.

## Example prompts

- Read the files in Flow/days from the last 7 days and give me honest feedback on my week.
- Look at my active projects in Flow/projects and suggest what I should plan for tomorrow.
`

const INBOX_TEXT = '---\nitems: []\n---\n'

export async function ensureFolder(store: FileStore): Promise<void> {
  if ((await store.read('README.md')) === null) await store.write('README.md', README_TEXT)
  if ((await store.read(INBOX_PATH)) === null) await store.write(INBOX_PATH, INBOX_TEXT)
}

export async function logIssue(store: FileStore, path: string, reason: string, now: Date = new Date()): Promise<void> {
  try {
    await store.append(LOG_PATH, `${now.toISOString()}  ${path}  ${reason}\n`)
  } catch {
    // the log must never break the app
  }
}

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ')

type Parsed =
  | { kind: 'project'; slug: string; value: FlowData['projects'][string] }
  | { kind: 'inbox'; value: FlowData['inbox'] }
  | { kind: 'notes'; value: FlowData['notes'] }
  | { kind: 'day'; date: ISODate; value: FlowData['days'][string] }
  | { kind: 'review'; week: string; value: FlowData['reviews'][string] }
  | { kind: 'calendar'; week: string; value: FlowData['calendar'][string] }

function classify(path: string): { kind: 'project'; slug: string } | { kind: 'inbox' } | { kind: 'notes' } | { kind: 'day'; date: ISODate } | { kind: 'review'; week: string } | { kind: 'calendar'; week: string } | null {
  if (path === INBOX_PATH) return { kind: 'inbox' }
  if (path === NOTES_PATH) return { kind: 'notes' }
  const p = PROJECT_RE.exec(path)
  if (p) return { kind: 'project', slug: p[1] }
  const d = DAY_RE.exec(path)
  if (d) return { kind: 'day', date: d[1] }
  const r = REVIEW_RE.exec(path)
  if (r) return { kind: 'review', week: r[1] }
  const c = CALENDAR_RE.exec(path)
  if (c) return { kind: 'calendar', week: c[1] }
  return null
}

function parsePath(path: string, text: string, today: ISODate): Parsed | null {
  const c = classify(path)
  if (!c) return null
  if (c.kind === 'inbox') return { kind: 'inbox', value: parseInbox(text, today) }
  if (c.kind === 'notes') return { kind: 'notes', value: parseNotes(text) }
  if (c.kind === 'project') return { kind: 'project', slug: c.slug, value: parseProject(c.slug, text, today) }
  if (c.kind === 'review') return { kind: 'review', week: c.week, value: parseReview(c.week, text) }
  if (c.kind === 'calendar') return { kind: 'calendar', week: c.week, value: parseCalendarWeek(c.week, text) }
  return { kind: 'day', date: c.date, value: parseDay(c.date, text) }
}

function apply(d: FlowData, p: Parsed): void {
  if (p.kind === 'inbox') d.inbox = p.value
  else if (p.kind === 'notes') d.notes = p.value
  else if (p.kind === 'project') d.projects[p.slug] = p.value
  else if (p.kind === 'review') d.reviews[p.week] = p.value
  else if (p.kind === 'calendar') d.calendar[p.week] = p.value
  else d.days[p.date] = p.value
}

export async function loadFlow(store: FileStore, today: ISODate): Promise<FlowData> {
  const d = emptyFlow()
  const paths = [INBOX_PATH, NOTES_PATH]
  for (const n of await store.list('projects')) if (n.endsWith('.md')) paths.push(`projects/${n}`)
  for (const n of await store.list('days')) if (DAY_RE.test(`days/${n}`)) paths.push(`days/${n}`)
  for (const n of await store.list('reviews')) if (REVIEW_RE.test(`reviews/${n}`)) paths.push(`reviews/${n}`)
  for (const n of await store.list('calendar')) if (CALENDAR_RE.test(`calendar/${n}`)) paths.push(`calendar/${n}`)
  for (const path of paths) {
    try {
      const text = await store.read(path)
      if (text === null) continue
      const parsed = parsePath(path, text, today)
      if (parsed) apply(d, parsed)
    } catch (e) {
      d.skipped.push(path)
      await logIssue(store, path, `could not be read: ${reasonOf(e)}`)
    }
  }
  return dedupeCalendarIds(d)
}

export async function reloadPaths(store: FileStore, d: FlowData, paths: string[], today: ISODate): Promise<FlowData> {
  const next: FlowData = { ...d, projects: { ...d.projects }, days: { ...d.days }, reviews: { ...d.reviews }, calendar: { ...d.calendar }, skipped: [...d.skipped] }
  for (const path of paths) {
    const c = classify(path)
    if (!c) continue
    let text: string | null
    try {
      text = await store.read(path)
    } catch (e) {
      if (!next.skipped.includes(path)) next.skipped.push(path)
      await logIssue(store, path, `could not be read: ${reasonOf(e)}`)
      continue
    }
    if (text === null) {
      next.skipped = next.skipped.filter((s) => s !== path)
      if (c.kind === 'project') delete next.projects[c.slug]
      else if (c.kind === 'day') delete next.days[c.date]
      else if (c.kind === 'review') delete next.reviews[c.week]
      else if (c.kind === 'calendar') delete next.calendar[c.week]
      else if (c.kind === 'notes') next.notes = emptyFlow().notes
      else next.inbox = emptyFlow().inbox
      continue
    }
    try {
      const parsed = parsePath(path, text, today)
      if (parsed) apply(next, parsed)
      next.skipped = next.skipped.filter((s) => s !== path)
    } catch (e) {
      if (!next.skipped.includes(path)) next.skipped.push(path)
      await logIssue(store, path, `could not be read: ${reasonOf(e)}`)
    }
  }
  // Ids repeated across week files: the reloaded files' items take fresh ids (in memory).
  const reloadedWeeks = paths.map((p) => CALENDAR_RE.exec(p)?.[1]).filter((w): w is string => w !== undefined)
  return dedupeCalendarIds(next, reloadedWeeks)
}

function serializePath(d: FlowData, path: string): string | null {
  const c = classify(path)
  if (!c) return null
  if (c.kind === 'inbox') return serializeInbox(d.inbox)
  if (c.kind === 'notes') return serializeNotes(d.notes)
  if (c.kind === 'project') return d.projects[c.slug] ? serializeProject(d.projects[c.slug]) : null
  if (c.kind === 'review') return d.reviews[c.week] ? serializeReview(d.reviews[c.week]) : null
  if (c.kind === 'calendar') return d.calendar[c.week] ? serializeCalendarWeek(d.calendar[c.week]) : null
  return d.days[c.date] ? serializeDay(d.days[c.date]) : null
}

/** Writes the changed paths; returns the ones whose write failed (after one retry) so the caller can retry later. */
export async function saveFlow(store: FileStore, d: FlowData, changed: string[]): Promise<string[]> {
  const failed: string[] = []
  for (const path of [...new Set(changed)]) {
    try {
      if (d.skipped.includes(path)) {
        await logIssue(store, path, 'not saved: file could not be read')
        continue
      }
      const text = serializePath(d, path)
      if (text === null) continue
      try {
        await store.write(path, text)
      } catch {
        await store.write(path, text)
      }
    } catch (e) {
      failed.push(path)
      await logIssue(store, path, `not saved: ${reasonOf(e)}`)
    }
  }
  return failed
}

/**
 * Move a file (a deleted project) to `deleted/<name>-<today>.md` (-2, -3… when taken): copy its
 * exact text first, then remove the original; never removes when the copy failed. Returns the
 * new path, or null after logging one line (the original then stays).
 */
export async function moveToDeleted(store: FileStore, path: string, today: ISODate): Promise<string | null> {
  try {
    const text = await store.read(path)
    if (text === null) throw new Error('file is missing')
    const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')
    let target = `deleted/${name}-${today}.md`
    for (let n = 2; (await store.read(target)) !== null; n++) target = `deleted/${name}-${today}-${n}.md`
    await store.write(target, text)
    if ((await store.read(target)) !== text) throw new Error('copy could not be verified')
    await store.remove(path)
    return target
  } catch (e) {
    await logIssue(store, path, `not deleted: ${reasonOf(e)}`)
    return null
  }
}
