import { describe, it, expect } from 'vitest'
import { MemoryFileStore } from './fileStore'
import { ensureFolder, loadFlow, reloadPaths, saveFlow, logIssue, moveToDeleted, README_TEXT } from './flowRepo'
import { moveTask } from '../model/tasks'

const T = '2026-11-04'
const GOOD = `---
title: Good
status: active
color: "#4f8cff"
created: 2026-11-01
tasks:
  - id: t1
    title: One
    status: todo
    created: 2026-11-01
---
notes
`
const BAD = '---\ntitle: [oops\n---\n'

describe('ensureFolder', () => {
  it('creates README.md and inbox.md', async () => {
    const s = new MemoryFileStore()
    await ensureFolder(s)
    expect(s.files['README.md']).toBe(README_TEXT)
    expect(s.files['inbox.md']).toBeDefined()
  })
  it('leaves an existing README.md unchanged', async () => {
    const s = new MemoryFileStore({ 'README.md': 'mine' })
    await ensureFolder(s)
    expect(s.files['README.md']).toBe('mine')
  })
  it('README mentions the example prompts', () => {
    expect(README_TEXT).toContain('Read the files in Flow/days from the last 7 days and give me honest feedback on my week.')
    expect(README_TEXT).toContain('Look at my active projects in Flow/projects and suggest what I should plan for tomorrow.')
  })
})

describe('loadFlow', () => {
  it('skips and logs a file that fails to parse', async () => {
    const s = new MemoryFileStore({ 'projects/good.md': GOOD, 'projects/bad.md': BAD, 'projects/x.tmp': 'junk', 'days/notes.md': 'x' })
    const d = await loadFlow(s, T)
    expect(Object.keys(d.projects)).toEqual(['good'])
    expect(d.skipped).toEqual(['projects/bad.md'])
    expect(s.files['flow-issues.log']).toContain('projects/bad.md')
  })
})

describe('saveFlow', () => {
  it('never writes a skipped day file but writes the rest', async () => {
    const s = new MemoryFileStore({ 'projects/good.md': GOOD, 'days/2026-11-04.md': BAD })
    const d = await loadFlow(s, T)
    expect(d.skipped).toEqual(['days/2026-11-04.md'])
    const c = moveTask(d, 'good/t1', 'done', T)
    await saveFlow(s, c.data, c.changed)
    expect(s.files['days/2026-11-04.md']).toBe(BAD)
    expect(s.files['projects/good.md']).toContain('status: done')
    expect(s.files['flow-issues.log']).toContain('not saved')
  })
  it('returns only the paths whose write failed (skipped files are not failures)', async () => {
    const s = new MemoryFileStore({ 'projects/good.md': GOOD, 'days/2026-11-04.md': BAD })
    const d = await loadFlow(s, T)
    const c = moveTask(d, 'good/t1', 'done', T)
    s.write = async () => { throw new Error('disk full') }
    await expect(saveFlow(s, c.data, c.changed)).resolves.toEqual(['projects/good.md'])
  })
  it('retries a failing write once and never throws', async () => {
    const s = new MemoryFileStore({ 'projects/good.md': GOOD })
    const d = await loadFlow(s, T)
    const orig = s.write.bind(s)
    let calls = 0
    s.write = async (p, t) => { calls++; if (calls === 1) throw new Error('boom'); return orig(p, t) }
    await expect(saveFlow(s, d, ['projects/good.md'])).resolves.toEqual([])
    expect(calls).toBe(2)
    s.write = async () => { throw new Error('always') }
    await expect(saveFlow(s, d, ['projects/good.md'])).resolves.toEqual(['projects/good.md'])
    expect(s.files['flow-issues.log']).toContain('always')
  })
})

describe('reloadPaths', () => {
  it('picks up external edits, clears skipped, and removes deleted files', async () => {
    const s = new MemoryFileStore({ 'projects/good.md': GOOD, 'projects/bad.md': BAD })
    let d = await loadFlow(s, T)
    s.externalWrite('projects/good.md', GOOD.replace('notes', 'notes').replace('tasks:\n', 'tasks:\n  - id: t2\n    title: Two\n    status: todo\n    created: 2026-11-01\n'))
    s.externalWrite('projects/bad.md', GOOD)
    d = await reloadPaths(s, d, ['projects/good.md', 'projects/bad.md', 'other.md'], T)
    expect(d.projects.good.tasks.map((t) => t.id)).toEqual(['t2', 't1'])
    expect(d.projects.bad).toBeDefined()
    expect(d.skipped).toEqual([])
    delete s.files['projects/bad.md']
    d = await reloadPaths(s, d, ['projects/bad.md'], T)
    expect(d.projects.bad).toBeUndefined()
  })
})

describe('MemoryFileStore.watch', () => {
  it('fires for externalWrite but not write', async () => {
    const s = new MemoryFileStore()
    const seen: string[][] = []
    const off = await s.watch((p) => seen.push(p))
    await s.write('a.md', 'x')
    expect(seen).toEqual([])
    s.externalWrite('a.md', 'y')
    expect(seen).toEqual([['a.md']])
    off()
    s.externalWrite('b.md', 'y')
    expect(seen).toHaveLength(1)
  })
})

describe('logIssue', () => {
  it('appends a formatted line', async () => {
    const s = new MemoryFileStore()
    await logIssue(s, 'a.md', 'why', new Date('2026-11-04T10:00:00Z'))
    await logIssue(s, 'b.md', 'again', new Date('2026-11-04T10:00:01Z'))
    expect(s.files['flow-issues.log']).toBe('2026-11-04T10:00:00.000Z  a.md  why\n2026-11-04T10:00:01.000Z  b.md  again\n')
  })
})

describe('notes.md', () => {
  it('a missing notes.md loads as empty and loading writes nothing', async () => {
    const s = new MemoryFileStore({ 'projects/good.md': GOOD })
    await ensureFolder(s)
    const d = await loadFlow(s, T)
    expect(d.notes).toEqual({ body: '', extra: {} })
    expect(s.files['notes.md']).toBeUndefined()
  })
  it('loads notes.md with frontmatter extra, and saves it back', async () => {
    const s = new MemoryFileStore({ 'notes.md': '---\nowner: me\n---\nHello\n' })
    const d = await loadFlow(s, T)
    expect(d.notes).toEqual({ body: 'Hello\n', extra: { owner: 'me' } })
    const next = { ...d, notes: { ...d.notes, body: 'Changed\n' } }
    await saveFlow(s, next, ['notes.md'])
    expect(s.files['notes.md']).toBe('---\nowner: me\n---\nChanged\n')
  })
  it('an unreadable notes.md is skipped, logged and never written', async () => {
    const bad = '---\ntags: [oops\n---\nmy words'
    const s = new MemoryFileStore({ 'notes.md': bad })
    const d = await loadFlow(s, T)
    expect(d.skipped).toContain('notes.md')
    expect(s.files['flow-issues.log']).toContain('notes.md')
    await saveFlow(s, { ...d, notes: { body: 'overwrite', extra: {} } }, ['notes.md'])
    expect(s.files['notes.md']).toBe(bad)
  })
  it('reloadPaths picks up edits and removal of notes.md', async () => {
    const s = new MemoryFileStore({ 'notes.md': 'one' })
    const d = await loadFlow(s, T)
    await s.write('notes.md', 'two')
    const r = await reloadPaths(s, d, ['notes.md'], T)
    expect(r.notes.body).toBe('two')
    delete s.files['notes.md']
    expect((await reloadPaths(s, r, ['notes.md'], T)).notes.body).toBe('')
  })
  it('README documents notes.md', () => {
    expect(README_TEXT).toContain('notes.md')
  })
})

describe('reviews/', () => {
  const REVIEW = '---\nweek: 2026-W45\nfocus_project: good\n---\nReflection\n'
  it('loads only reviews/YYYY-Www.md and never creates review files', async () => {
    const s = new MemoryFileStore({ 'projects/good.md': GOOD, 'reviews/2026-W45.md': REVIEW, 'reviews/notes.md': 'x', 'reviews/2026-W5.md': 'x' })
    await ensureFolder(s)
    const d = await loadFlow(s, T)
    expect(Object.keys(d.reviews)).toEqual(['2026-W45'])
    expect(d.reviews['2026-W45'].focusProject).toBe('good')
    expect(Object.keys(s.files).filter((p) => p.startsWith('reviews/')).sort()).toEqual(['reviews/2026-W45.md', 'reviews/2026-W5.md', 'reviews/notes.md'])
  })
  it('skips and logs a broken review and never writes it', async () => {
    const bad = '---\nintention: [x]\n---\nmine'
    const s = new MemoryFileStore({ 'reviews/2026-W45.md': bad })
    const d = await loadFlow(s, T)
    expect(d.skipped).toEqual(['reviews/2026-W45.md'])
    expect(s.files['flow-issues.log']).toContain('reviews/2026-W45.md')
    await saveFlow(s, { ...d, reviews: { '2026-W45': { week: '2026-W45', body: 'x', extra: {} } } }, ['reviews/2026-W45.md'])
    expect(s.files['reviews/2026-W45.md']).toBe(bad)
  })
  it('saves a review to reviews/<week>.md', async () => {
    const s = new MemoryFileStore()
    const d = await loadFlow(s, T)
    await saveFlow(s, { ...d, reviews: { '2026-W45': { week: '2026-W45', intention: 'Calm', body: 'Hi\n', extra: {} } } }, ['reviews/2026-W45.md'])
    expect(s.files['reviews/2026-W45.md']).toBe('---\nweek: 2026-W45\nintention: Calm\n---\nHi\n')
  })
  it('reloadPaths picks up edits and removal', async () => {
    const s = new MemoryFileStore({ 'reviews/2026-W45.md': REVIEW })
    const d = await loadFlow(s, T)
    await s.write('reviews/2026-W45.md', '---\nweek: 2026-W45\n---\nTwo')
    const r = await reloadPaths(s, d, ['reviews/2026-W45.md'], T)
    expect(r.reviews['2026-W45']).toEqual({ week: '2026-W45', body: 'Two', extra: {} })
    delete s.files['reviews/2026-W45.md']
    expect((await reloadPaths(s, r, ['reviews/2026-W45.md'], T)).reviews['2026-W45']).toBeUndefined()
  })
  it('README documents reviews/', () => {
    expect(README_TEXT).toContain('reviews/YYYY-Www.md')
    expect(README_TEXT).toContain('focus_project')
  })
})

describe('moveToDeleted', () => {
  it('copies the exact text to deleted/<slug>-<date>.md, then removes the original', async () => {
    const s = new MemoryFileStore({ 'projects/good.md': GOOD })
    const calls: string[] = []
    const write = s.write.bind(s), remove = s.remove.bind(s)
    s.write = async (p, t) => { calls.push(`write ${p}`); return write(p, t) }
    s.remove = async (p) => { calls.push(`remove ${p}`); return remove(p) }
    expect(await moveToDeleted(s, 'projects/good.md', T)).toBe(`deleted/good-${T}.md`)
    expect(s.files[`deleted/good-${T}.md`]).toBe(GOOD)
    expect(s.files['projects/good.md']).toBeUndefined()
    expect(calls).toEqual([`write deleted/good-${T}.md`, 'remove projects/good.md'])
  })
  it('numbers the name when it is taken', async () => {
    const s = new MemoryFileStore({ 'projects/good.md': GOOD, [`deleted/good-${T}.md`]: 'old', [`deleted/good-${T}-2.md`]: 'older' })
    expect(await moveToDeleted(s, 'projects/good.md', T)).toBe(`deleted/good-${T}-3.md`)
    expect(s.files[`deleted/good-${T}.md`]).toBe('old')
    expect(s.files[`deleted/good-${T}-3.md`]).toBe(GOOD)
  })
  it('moves an unreadable file as-is', async () => {
    const s = new MemoryFileStore({ 'projects/bad.md': BAD })
    expect(await moveToDeleted(s, 'projects/bad.md', T)).toBe(`deleted/bad-${T}.md`)
    expect(s.files[`deleted/bad-${T}.md`]).toBe(BAD)
  })
  it('keeps the original when the copy fails, and logs one line', async () => {
    const s = new MemoryFileStore({ 'projects/good.md': GOOD })
    s.write = async () => { throw new Error('disk full') }
    let removed = false
    s.remove = async () => { removed = true }
    expect(await moveToDeleted(s, 'projects/good.md', T)).toBeNull()
    expect(removed).toBe(false)
    expect(s.files['projects/good.md']).toBe(GOOD)
    expect(s.files['flow-issues.log'].trim().split('\n')).toHaveLength(1)
    expect(s.files['flow-issues.log']).toContain('projects/good.md  not deleted: disk full')
  })
  it('logs when the remove fails; the copy stays as a backup', async () => {
    const s = new MemoryFileStore({ 'projects/good.md': GOOD })
    s.remove = async () => { throw new Error('denied') }
    expect(await moveToDeleted(s, 'projects/good.md', T)).toBeNull()
    expect(s.files['projects/good.md']).toBe(GOOD)
    expect(s.files['flow-issues.log']).toContain('not deleted: denied')
  })
  it('loadFlow ignores deleted/ and the README mentions it', async () => {
    const s = new MemoryFileStore({ 'inbox.md': '---\nitems: []\n---\n', [`deleted/good-${T}.md`]: GOOD })
    const d = await loadFlow(s, T)
    expect(d.projects).toEqual({})
    expect(d.skipped).toEqual([])
    expect(README_TEXT).toContain('deleted/')
  })
})

describe('MemoryFileStore.remove', () => {
  it('removes a file; missing files are fine', async () => {
    const s = new MemoryFileStore({ 'a.md': 'x' })
    await s.remove('a.md')
    await s.remove('b.md')
    expect(s.files).toEqual({})
  })
})

describe('calendar/', () => {
  const CAL = (id: string, title: string) =>
    `---\nweek: "2026-W46"\nitems:\n  - id: ${id}\n    title: ${title}\n    date: 2026-11-12\n    time: "18:00-19:30"\n---\n`
  it('loads only calendar/YYYY-Www.md and never creates calendar files', async () => {
    const s = new MemoryFileStore({ 'calendar/2026-W46.md': CAL('c1', 'Swim'), 'calendar/notes.md': 'x', 'calendar/2026-W5.md': 'x' })
    await ensureFolder(s)
    const d = await loadFlow(s, T)
    expect(Object.keys(d.calendar)).toEqual(['2026-W46'])
    expect(d.calendar['2026-W46'].items[0]).toMatchObject({ id: 'c1', title: 'Swim', time: '18:00-19:30' })
    expect(Object.keys(s.files).filter((p) => p.startsWith('calendar/')).sort()).toEqual(['calendar/2026-W46.md', 'calendar/2026-W5.md', 'calendar/notes.md'])
  })
  it('skips and logs a broken calendar file and never writes it', async () => {
    const bad = '---\nitems:\n  - id: c1\n    title: Swim\n    date: 2026-11-12\n    time: "18:00-18:10"\n---\nmine'
    const s = new MemoryFileStore({ 'calendar/2026-W46.md': bad })
    const d = await loadFlow(s, T)
    expect(d.skipped).toEqual(['calendar/2026-W46.md'])
    expect(s.files['flow-issues.log']).toContain('calendar/2026-W46.md')
    await saveFlow(s, { ...d, calendar: { '2026-W46': { week: '2026-W46', items: [], body: '', extra: {} } } }, ['calendar/2026-W46.md'])
    expect(s.files['calendar/2026-W46.md']).toBe(bad)
  })
  it('saves a week to calendar/<week>.md, also with no items', async () => {
    const s = new MemoryFileStore()
    const d = await loadFlow(s, T)
    const items = [{ id: 'c1', title: 'Swim', date: '2026-11-12', time: '18:00-19:30', extra: {} }]
    await saveFlow(s, { ...d, calendar: { '2026-W46': { week: '2026-W46', items, body: '', extra: {} } } }, ['calendar/2026-W46.md'])
    expect(s.files['calendar/2026-W46.md']).toBe(CAL('c1', 'Swim'))
    await saveFlow(s, { ...d, calendar: { '2026-W46': { week: '2026-W46', items: [], body: '', extra: {} } } }, ['calendar/2026-W46.md'])
    expect(s.files['calendar/2026-W46.md']).toBe('---\nweek: "2026-W46"\nitems: []\n---\n')
  })
  it('reloadPaths picks up edits and removal', async () => {
    const s = new MemoryFileStore({ 'calendar/2026-W46.md': CAL('c1', 'Swim') })
    const d = await loadFlow(s, T)
    await s.write('calendar/2026-W46.md', CAL('c1', 'Run'))
    const r = await reloadPaths(s, d, ['calendar/2026-W46.md'], T)
    expect(r.calendar['2026-W46'].items[0].title).toBe('Run')
    expect(d.calendar['2026-W46'].items[0].title).toBe('Swim')
    delete s.files['calendar/2026-W46.md']
    expect((await reloadPaths(s, r, ['calendar/2026-W46.md'], T)).calendar['2026-W46']).toBeUndefined()
  })
  it('ids repeated across week files are made unique in memory; a reloaded file yields', async () => {
    const W47 = CAL('c1', 'Run').replace('2026-W46', '2026-W47').replace('2026-11-12', '2026-11-19')
    const s = new MemoryFileStore({ 'calendar/2026-W46.md': CAL('c1', 'Swim'), 'calendar/2026-W47.md': W47 })
    const d = await loadFlow(s, T)
    expect([d.calendar['2026-W46'].items[0].id, d.calendar['2026-W47'].items[0].id]).toEqual(['c1', 'c2'])
    await s.write('calendar/2026-W46.md', CAL('c1', 'Swim more'))
    const r = await reloadPaths(s, d, ['calendar/2026-W46.md'], T)
    expect(r.calendar['2026-W47'].items[0].id).toBe('c2')
    expect(r.calendar['2026-W46'].items[0]).toMatchObject({ id: 'c1', title: 'Swim more' })
    expect(s.files['calendar/2026-W47.md']).toBe(W47)
  })
  it('a task time round-trips through save and load', async () => {
    const s = new MemoryFileStore({ 'projects/good.md': GOOD })
    const d = await loadFlow(s, T)
    d.projects.good.tasks[0].time = '09:00-10:30'
    await saveFlow(s, d, ['projects/good.md'])
    expect(s.files['projects/good.md']).toContain('    time: "09:00-10:30"\n')
    expect((await loadFlow(s, T)).projects.good.tasks[0].time).toBe('09:00-10:30')
  })
  it('README documents task time and calendar/', () => {
    expect(README_TEXT).toContain('calendar/')
    expect(README_TEXT).toContain('calendar/YYYY-Www.md')
    expect(README_TEXT).toContain('time: "18:00-19:30"')
    expect(README_TEXT).toMatch(/time is .*HH:MM-HH:MM/)
  })
})
