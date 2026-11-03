import { describe, expect, it } from 'vitest'
import { parseDay, parseInbox, parseProject, serializeDay, serializeInbox, serializeProject } from './files'
import { pickColor } from '../model/ids'

const today = '2026-11-05'

const PROJECT = `---
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
`

const INBOX = `---
items:
  - id: i1
    text: Look into Spanish podcasts
    created: 2026-11-03
---
`

const DAY = `---
date: 2026-11-04
planned: [flow-app/t2, learn-spanish/t5]
done:
  - ref: flow-app/t2
    title: Set up Tauri project
    project: Flow app
---
Optional free-text note (edited outside Flow in this version).
`

describe('round trips', () => {
  it('project', () => {
    const p = parseProject('flow-app', PROJECT, today)
    expect(p.tasks[0].firstStep).toBe('List what a project needs')
    expect(p.tasks[0].planned).toBe('2026-11-03')
    expect(parseProject('flow-app', serializeProject(p), today)).toEqual(p)
  })
  it('preserves the body exactly', () => {
    const p = parseProject('flow-app', PROJECT, today)
    const again = parseProject('flow-app', serializeProject(p), today)
    expect(again.body).toBe(p.body)
    expect(again.body).toContain('## Decisions\n- 2026-11-03: Build with Tauri')
  })
  it('inbox', () => {
    const i = parseInbox(INBOX, today)
    expect(i.items).toHaveLength(1)
    expect(parseInbox(serializeInbox(i), today)).toEqual(i)
  })
  it('day', () => {
    const d = parseDay('2026-11-04', DAY)
    expect(d.planned).toEqual(['flow-app/t2', 'learn-spanish/t5'])
    expect(d.done[0].project).toBe('Flow app')
    expect(parseDay('2026-11-04', serializeDay(d))).toEqual(d)
  })
  it('omits optional task fields when undefined', () => {
    const p = parseProject('flow-app', PROJECT, today)
    const out = serializeProject(p)
    expect(out.match(/first_step/g)).toHaveLength(1)
    expect(out.match(/planned:/g)).toHaveLength(1)
  })
})

describe('extra fields', () => {
  it('are preserved on project and task', () => {
    const text = '---\ntitle: X\npriority: high\ntasks:\n  - id: t1\n    title: A\n    estimate: 30m\n---\n'
    const p = parseProject('x', text, today)
    expect(p.extra).toEqual({ priority: 'high' })
    const again = parseProject('x', serializeProject(p), today)
    expect(again.extra.priority).toBe('high')
    expect(again.tasks[0].extra.estimate).toBe('30m')
  })
})

describe('defaults and repair', () => {
  it('assigns fresh ids to missing and duplicate ids', () => {
    const text = '---\ntitle: X\ntasks:\n  - id: t1\n    title: A\n  - title: B\n  - id: t1\n    title: C\n---\n'
    expect(parseProject('x', text, today).tasks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })
  it('fills status, created, project status and color', () => {
    const p = parseProject('x', '---\ntitle: X\ntasks:\n  - id: t1\n    title: A\n---\n', today)
    expect(p.tasks[0].status).toBe('todo')
    expect(p.tasks[0].created).toBe(today)
    expect(p.created).toBe(today)
    expect(p.status).toBe('active')
    expect(p.color).toBe(pickColor(0))
  })
  it('missing day lists and inbox items become empty', () => {
    const d = parseDay('2026-11-04', '---\ndate: 2026-11-04\n---\n')
    expect(d.planned).toEqual([])
    expect(d.done).toEqual([])
    expect(parseInbox('---\n---\n', today).items).toEqual([])
  })
  it('gives inbox items without id fresh ids', () => {
    const i = parseInbox('---\nitems:\n  - text: a\n  - id: i1\n    text: b\n---\n', today)
    expect(i.items.map((x) => x.id)).toEqual(['i2', 'i1'])
  })
})

describe('errors', () => {
  it('throws on invalid YAML', () => {
    expect(() => parseProject('x', '---\ntitle: [\n---\n', today)).toThrow()
  })
  it('throws when frontmatter is a list', () => {
    expect(() => parseProject('x', '---\n- a\n- b\n---\n', today)).toThrow()
  })
  it('throws when title is missing', () => {
    expect(() => parseProject('x', '---\nstatus: active\n---\n', today)).toThrow()
  })
})

describe('inbox without frontmatter', () => {
  it('keeps the text as body', () => {
    const i = parseInbox('- buy milk\n', today)
    expect(i.items).toEqual([])
    expect(i.body).toBe('- buy milk\n')
  })
})
