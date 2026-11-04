import { describe, it, expect } from 'vitest'
import { MemoryFileStore } from './fileStore'
import { ensureFolder, loadFlow, reloadPaths, saveFlow, logIssue, README_TEXT } from './flowRepo'
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
