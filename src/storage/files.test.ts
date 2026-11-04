import { describe, expect, it } from 'vitest'
import { parseDay, parseInbox, parseNotes, parseProject, serializeDay, serializeInbox, serializeNotes, serializeProject } from './files'
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

describe('leading BOM and blank lines', () => {
  it('parses a BOM-prefixed inbox', () => {
    const i = parseInbox('\uFEFF' + INBOX, today)
    expect(i.items).toHaveLength(1)
    expect(i.items[0].text).toBe('Look into Spanish podcasts')
  })
  it('parses a blank-line-prefixed day', () => {
    const d = parseDay('2026-11-04', '\n\n' + DAY)
    expect(d.planned).toEqual(['flow-app/t2', 'learn-spanish/t5'])
    expect(d.done).toHaveLength(1)
    expect(d.body).toBe('Optional free-text note (edited outside Flow in this version).\n')
  })
})

describe('non-scalar values where a scalar is expected', () => {
  it('throws instead of writing "[object Object]"', () => {
    expect(() => parseProject('x', '---\ntitle: {a: 1}\n---\n', today)).toThrow()
    expect(() => parseProject('x', '---\ntitle: X\ntasks:\n  - id: t1\n    title: [a, b]\n---\n', today)).toThrow()
    expect(() => parseProject('x', '---\ntitle: X\ngoal: {deep: true}\n---\n', today)).toThrow()
    expect(() => parseInbox('---\nitems:\n  - text: {a: 1}\n---\n', today)).toThrow()
    expect(() => parseDay('2026-11-04', '---\nplanned: [{a: 1}]\n---\n')).toThrow()
    expect(() => parseDay('2026-11-04', '---\ndone:\n  - ref: a/t1\n    title: [x]\n---\n')).toThrow()
  })
  it('still accepts numbers and booleans as text', () => {
    const p = parseProject('x', '---\ntitle: 2026\ntasks:\n  - id: t1\n    title: true\n---\n', today)
    expect(p.title).toBe('2026')
    expect(p.tasks[0].title).toBe('true')
  })
})

describe('done entry extra fields', () => {
  it('are preserved on round trip', () => {
    const text = '---\ndate: 2026-11-04\nplanned: []\ndone:\n  - ref: a/t1\n    title: A\n    project: P\n    minutes: 30\n---\n'
    const d = parseDay('2026-11-04', text)
    expect(d.done[0].extra).toEqual({ minutes: 30 })
    const out = serializeDay(d)
    expect(out).toContain('minutes: 30')
    expect(parseDay('2026-11-04', out)).toEqual(d)
  })
})

describe('status parsing', () => {
  it('trims and lowercases statuses', () => {
    const p = parseProject('x', '---\ntitle: X\nstatus: " Archived"\ntasks:\n  - id: t1\n    title: A\n    status: Done\n---\n', today)
    expect(p.status).toBe('archived')
    expect(p.tasks[0].status).toBe('done')
  })
})

describe('day focus log', () => {
  const FOCUS_DAY = `---
date: 2026-11-04
planned: []
done: []
focus:
  - ref: flow-app/t2
    title: Set up Tauri project
    project: Flow app
    minutes: 25
    mood: good
---
`
  it('parses and round-trips focus entries including extra keys', () => {
    const day = parseDay('2026-11-04', FOCUS_DAY)
    expect(day.focus).toEqual([
      { ref: 'flow-app/t2', title: 'Set up Tauri project', project: 'Flow app', minutes: 25, extra: { mood: 'good' } },
    ])
    expect(parseDay('2026-11-04', serializeDay(day))).toEqual(day)
    expect(serializeDay(day)).toContain('mood: good')
  })
  it('has an empty focus list and no focus key when absent', () => {
    const day = parseDay('2026-11-04', '---\ndate: 2026-11-04\nplanned: []\ndone: []\n---\n')
    expect(day.focus).toEqual([])
    expect(serializeDay(day)).not.toContain('focus')
    expect(day.extra).toEqual({})
  })
  it.each(['25.5', '-3', 'abc', '"25"', 'null'])('rejects minutes %s', (m) => {
    const text = `---\ndate: 2026-11-04\nfocus:\n  - ref: a/t1\n    title: x\n    project: A\n    minutes: ${m}\n---\n`
    expect(() => parseDay('2026-11-04', text)).toThrow()
  })
})

describe('notes.md', () => {
  it('plain Markdown is the body, with no frontmatter written back', () => {
    const n = parseNotes('# Ideas\n\nSome text\n')
    expect(n).toEqual({ body: '# Ideas\n\nSome text\n', extra: {} })
    expect(serializeNotes(n)).toBe('# Ideas\n\nSome text\n')
  })
  it('round-trips frontmatter extra and the body', () => {
    const text = '---\ntags:\n  - a\n  - b\nowner: me\n---\nBody here\n'
    const n = parseNotes(text)
    expect(n.extra).toEqual({ tags: ['a', 'b'], owner: 'me' })
    expect(n.body).toBe('Body here\n')
    expect(serializeNotes(n)).toBe(text)
  })
  it('tolerates a BOM and blank lines before the frontmatter', () => {
    const n = parseNotes('\uFEFF\n---\nowner: me\n---\nHi')
    expect(n).toEqual({ body: 'Hi', extra: { owner: 'me' } })
  })
  it('throws on broken frontmatter', () => {
    expect(() => parseNotes('---\ntags: [oops\n---\n')).toThrow()
    expect(() => parseNotes('---\nnever closed\n')).toThrow()
  })
  it('a body that starts with a rule still reads back the same', () => {
    const n = { body: '---\nnot frontmatter\n', extra: {} }
    expect(parseNotes(serializeNotes(n))).toEqual(n)
  })
})

describe('task steps', () => {
  const withSteps = (steps: string) =>
    `---\ntitle: P\nstatus: active\ncolor: "#4f8cff"\ncreated: 2026-11-03\ntasks:\n  - id: t1\n    title: T\n    status: todo\n    created: 2026-11-03\n${steps}---\n`
  it('parses and round-trips steps including extra keys', () => {
    const text = withSteps('    steps:\n      - text: one\n        done: true\n        note: hi\n      - text: two\n        done: false\n')
    const p = parseProject('p', text, today)
    expect(p.tasks[0].steps).toEqual([
      { text: 'one', done: true, extra: { note: 'hi' } },
      { text: 'two', done: false, extra: {} },
    ])
    expect(parseProject('p', serializeProject(p), today)).toEqual(p)
    expect(serializeProject(p)).toContain('note: hi')
  })
  it('omits steps when absent or empty', () => {
    const p = parseProject('p', withSteps(''), today)
    expect(p.tasks[0].steps).toBeUndefined()
    expect(serializeProject(p)).not.toContain('steps')
    p.tasks[0].steps = []
    expect(serializeProject(p)).not.toContain('steps')
  })
  it.each([
    ['done: "yes"'], ['done: 1'], ['done: null'], ['text: ""\n        done: false'],
  ])('rejects a bad step (%s)', (bad) => {
    const body = bad.startsWith('text') ? bad : `text: x\n        ${bad}`
    expect(() => parseProject('p', withSteps(`    steps:\n      - ${body}\n`), today)).toThrow()
  })
  it('rejects steps that are not a list or a step that is not a mapping', () => {
    expect(() => parseProject('p', withSteps('    steps: nope\n'), today)).toThrow()
    expect(() => parseProject('p', withSteps('    steps:\n      - plain\n'), today)).toThrow()
  })
})

describe('task scheduled date', () => {
  const withTask = (extra: string) =>
    `---\ntitle: P\nstatus: active\ncolor: "#4f8cff"\ncreated: 2026-11-03\ntasks:\n  - id: t1\n    title: T\n    status: todo\n    created: 2026-11-03\n${extra}---\n`
  it('parses and round-trips scheduled', () => {
    const p = parseProject('p', withTask('    scheduled: 2026-11-06\n'), today)
    expect(p.tasks[0].scheduled).toBe('2026-11-06')
    expect(p.tasks[0].extra).toEqual({})
    expect(serializeProject(p)).toContain('scheduled: 2026-11-06')
    expect(parseProject('p', serializeProject(p), today)).toEqual(p)
  })
  it('omits scheduled when absent', () => {
    const p = parseProject('p', withTask(''), today)
    expect(p.tasks[0].scheduled).toBeUndefined()
    expect(serializeProject(p)).not.toContain('scheduled')
  })
  it.each([['tomorrow'], ['2026-11-6'], ['20261106'], ['[2026-11-06]'], ['{a: 1}'], ['12']])('rejects a bad scheduled value (%s)', (bad) => {
    expect(() => parseProject('p', withTask(`    scheduled: ${bad}\n`), today)).toThrow()
  })
})
