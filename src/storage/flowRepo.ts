import type { FileStore } from './fileStore'
import { parseDay, parseInbox, parseProject, serializeDay, serializeInbox, serializeProject } from './files'
import { emptyFlow, INBOX_PATH, type FlowData, type ISODate } from '../model/types'

const LOG_PATH = 'flow-issues.log'
const PROJECT_RE = /^projects\/([^/]+)\.md$/
const DAY_RE = /^days\/(\d{4}-\d{2}-\d{2})\.md$/

export const README_TEXT = `# Flow

This folder is the single source of truth for Flow, a personal planner. Everything is
Markdown with YAML frontmatter. Dates are ISO YYYY-MM-DD in local time. You (or an AI)
can read and edit these files; Flow picks up changes.

## Layout

\`\`\`
Flow/
  README.md            # this file (written by Flow on first run)
  inbox.md             # parking lot
  projects/
    <slug>.md          # one file per project
  days/
    YYYY-MM-DD.md      # one file per day with activity
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
---
Free notes about the project.

## Decisions
- 2026-11-03: Build with Tauri, data as Markdown files.
\`\`\`

- The slug (file name) is derived from the title at creation and never changes, even if
  the title is renamed, so references stay valid.
- Task ids are unique within a project (t1, t2, ... incrementing). The global task
  reference is <slug>/<id>, e.g. flow-app/t2.
- Optional task fields (first_step, planned, done) are omitted when empty.
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

## Day file: days/YYYY-MM-DD.md

\`\`\`markdown
---
date: 2026-11-04
planned: [flow-app/t2, learn-spanish/t5]
done:
  - ref: flow-app/t2
    title: Set up Tauri project
    project: Flow app
---
Optional free-text note.
\`\`\`

- planned: refs of tasks moved into Today on this date (appended; no duplicates).
- done: a snapshot of each completed task (ref plus title and project title at that
  moment), so the day's record stays readable if the task is later renamed or deleted.
- A day file is created only when something happens that day.

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
  | { kind: 'day'; date: ISODate; value: FlowData['days'][string] }

function classify(path: string): { kind: 'project'; slug: string } | { kind: 'inbox' } | { kind: 'day'; date: ISODate } | null {
  if (path === INBOX_PATH) return { kind: 'inbox' }
  const p = PROJECT_RE.exec(path)
  if (p) return { kind: 'project', slug: p[1] }
  const d = DAY_RE.exec(path)
  if (d) return { kind: 'day', date: d[1] }
  return null
}

function parsePath(path: string, text: string, today: ISODate): Parsed | null {
  const c = classify(path)
  if (!c) return null
  if (c.kind === 'inbox') return { kind: 'inbox', value: parseInbox(text, today) }
  if (c.kind === 'project') return { kind: 'project', slug: c.slug, value: parseProject(c.slug, text, today) }
  return { kind: 'day', date: c.date, value: parseDay(c.date, text) }
}

function apply(d: FlowData, p: Parsed): void {
  if (p.kind === 'inbox') d.inbox = p.value
  else if (p.kind === 'project') d.projects[p.slug] = p.value
  else d.days[p.date] = p.value
}

export async function loadFlow(store: FileStore, today: ISODate): Promise<FlowData> {
  const d = emptyFlow()
  const paths = [INBOX_PATH]
  for (const n of await store.list('projects')) if (n.endsWith('.md')) paths.push(`projects/${n}`)
  for (const n of await store.list('days')) if (DAY_RE.test(`days/${n}`)) paths.push(`days/${n}`)
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
  return d
}

export async function reloadPaths(store: FileStore, d: FlowData, paths: string[], today: ISODate): Promise<FlowData> {
  const next: FlowData = { ...d, projects: { ...d.projects }, days: { ...d.days }, skipped: [...d.skipped] }
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
  return next
}

function serializePath(d: FlowData, path: string): string | null {
  const c = classify(path)
  if (!c) return null
  if (c.kind === 'inbox') return serializeInbox(d.inbox)
  if (c.kind === 'project') return d.projects[c.slug] ? serializeProject(d.projects[c.slug]) : null
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
