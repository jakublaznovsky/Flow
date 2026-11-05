import { describe, it, expect } from 'vitest'
import { addInboxItem, deleteInboxItem, editInboxItem, parkTask, promoteInboxItem } from './inbox'
import { emptyFlow, type FlowData } from './types'

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    Object.values(o as object).forEach(deepFreeze)
  }
  return o
}

function sample(): FlowData {
  const d = emptyFlow()
  d.projects['flow-app'] = {
    slug: 'flow-app', title: 'Flow app', status: 'active', color: '#0091ff', created: '2026-11-01',
    tasks: [], body: '', extra: {},
  }
  d.inbox.items = [
    { id: 'i1', text: 'Call dentist', created: '2026-11-01', extra: {} },
    { id: 'i2', text: 'Buy milk', created: '2026-11-02', extra: {} },
  ]
  return deepFreeze(d)
}
const T = '2026-11-04'

describe('addInboxItem', () => {
  it('adds a trimmed item with the next id', () => {
    const r = addInboxItem(sample(), '  Idea  ', T)
    expect(r.data.inbox.items.at(-1)).toEqual({ id: 'i3', text: 'Idea', created: T, extra: {} })
    expect(r.changed).toEqual(['inbox.md'])
  })
  it('ignores blank text', () => {
    const d = sample()
    const r = addInboxItem(d, '   ', T)
    expect(r.data).toBe(d)
    expect(r.changed).toEqual([])
  })
})

describe('deleteInboxItem', () => {
  it('removes the item', () => {
    const r = deleteInboxItem(sample(), 'i1')
    expect(r.data.inbox.items.map((i) => i.id)).toEqual(['i2'])
    expect(r.changed).toEqual(['inbox.md'])
  })
  it('unknown id is a no-op', () => {
    const d = sample()
    const r = deleteInboxItem(d, 'zz')
    expect(r.data).toBe(d)
    expect(r.changed).toEqual([])
  })
})

describe('promoteInboxItem', () => {
  it('moves the item into a todo task', () => {
    const r = promoteInboxItem(sample(), 'i1', 'flow-app', 'todo', T)
    expect(r.data.inbox.items.map((i) => i.id)).toEqual(['i2'])
    expect(r.data.projects['flow-app'].tasks[0]).toMatchObject({ id: 't1', title: 'Call dentist', status: 'todo' })
    expect(r.changed).toEqual(['inbox.md', 'projects/flow-app.md'])
  })
  it('to today also touches the day file', () => {
    const r = promoteInboxItem(sample(), 'i2', 'flow-app', 'today', T)
    expect(r.data.days[T].planned).toEqual(['flow-app/t1'])
    expect(r.changed).toEqual(['inbox.md', 'projects/flow-app.md', `days/${T}.md`])
  })
  it('unknown item or slug is a no-op', () => {
    const d = sample()
    expect(promoteInboxItem(d, 'zz', 'flow-app', 'todo', T)).toEqual({ data: d, changed: [] })
    expect(promoteInboxItem(d, 'i1', 'nope', 'todo', T)).toEqual({ data: d, changed: [] })
  })
  it('to done adds the task and completes it today in one change', () => {
    const r = promoteInboxItem(sample(), 'i1', 'flow-app', 'done', T)
    expect(r.data.inbox.items.map((i) => i.id)).toEqual(['i2'])
    const task = r.data.projects['flow-app'].tasks[0]
    expect(task).toMatchObject({ id: 't1', title: 'Call dentist', status: 'done', done: T })
    expect(r.data.days[T].done).toEqual([{ ref: 'flow-app/t1', title: 'Call dentist', project: 'Flow app', extra: {} }])
    expect(r.data.days[T].planned).toEqual([])
    expect(r.changed).toEqual(['inbox.md', 'projects/flow-app.md', `days/${T}.md`])
  })
  it('does nothing when a file it would write failed to parse', () => {
    for (const [to, path] of [
      ['todo', 'inbox.md'], ['todo', 'projects/flow-app.md'], ['today', `days/${T}.md`], ['done', 'inbox.md'],
      ['done', 'projects/flow-app.md'], ['done', `days/${T}.md`],
    ] as const) {
      const d = deepFreeze({ ...structuredClone(sample()), skipped: [path] })
      expect(promoteInboxItem(d, 'i1', 'flow-app', to, T)).toEqual({ data: d, changed: [] })
    }
  })
  it('a skipped day file does not block a To do promotion', () => {
    const d = deepFreeze({ ...structuredClone(sample()), skipped: [`days/${T}.md`] })
    expect(promoteInboxItem(d, 'i1', 'flow-app', 'todo', T).changed).toEqual(['inbox.md', 'projects/flow-app.md'])
  })
})

describe('editInboxItem', () => {
  it('changes the trimmed text and writes inbox.md', () => {
    const r = editInboxItem(sample(), 'i1', '  Call the dentist  ')
    expect(r.data.inbox.items.find((i) => i.id === 'i1')?.text).toBe('Call the dentist')
    expect(r.changed).toEqual(['inbox.md'])
  })
  it('blank text, same text and unknown id are no-ops', () => {
    const d = sample()
    expect(editInboxItem(d, 'i1', '   ')).toEqual({ data: d, changed: [] })
    expect(editInboxItem(d, 'i1', 'Call dentist')).toEqual({ data: d, changed: [] })
    expect(editInboxItem(d, 'i9', 'x')).toEqual({ data: d, changed: [] })
  })
})

describe('parkTask', () => {
  const withTasks = (): FlowData => {
    const d = structuredClone(sample())
    d.projects['flow-app'].tasks = [
      { id: 't1', title: 'Plain', status: 'todo', created: '2026-11-01', extra: {} },
      {
        id: 't2', title: 'Rich', status: 'todo', created: '2026-11-01', firstStep: 'open doc', scheduled: '2026-11-09',
        steps: [{ text: 'a', done: true, extra: {} }, { text: 'b', done: false, extra: {} }], extra: { keep: 1 },
      },
      { id: 't3', title: 'Finished', status: 'done', created: '2026-11-01', planned: '2026-11-03', done: '2026-11-04', extra: {} },
      { id: 't4', title: 'Now', status: 'today', created: '2026-11-01', planned: '2026-11-04', extra: {} },
    ]
    d.days['2026-11-04'] = {
      date: '2026-11-04', planned: ['flow-app/t4'], done: [{ ref: 'flow-app/t3', title: 'Finished', project: 'Flow app', extra: {} }],
      focus: [], body: '', extra: {},
    }
    return deepFreeze(d)
  }
  it('moves a plain task into the Parking lot as its title', () => {
    const r = parkTask(withTasks(), 'flow-app/t1', T)
    expect(r.data.projects['flow-app'].tasks.map((t) => t.id)).toEqual(['t2', 't3', 't4'])
    expect(r.data.inbox.items.at(-1)).toEqual({ id: 'i3', text: 'Plain', created: T, extra: {} })
    expect(r.itemId).toBe('i3')
    expect(r.changed).toEqual(['projects/flow-app.md', 'inbox.md'])
  })
  it('keeps first step, steps (✓ for done) and the planned day in one line', () => {
    const r = parkTask(withTasks(), 'flow-app/t2', T)
    expect(r.data.inbox.items.at(-1)!.text).toBe('Rich — first step: open doc; steps: a ✓, b; planned: 2026-11-09')
  })
  it('works for Today and Done tasks and leaves day files alone', () => {
    const d = withTasks()
    const today = parkTask(d, 'flow-app/t4', T)
    expect(today.data.inbox.items.at(-1)!.text).toBe('Now — planned: 2026-11-04')
    const done = parkTask(today.data, 'flow-app/t3', T)
    expect(done.data.inbox.items.at(-1)!.text).toBe('Finished — planned: 2026-11-03')
    expect(done.data.days).toEqual(d.days)
    expect(done.changed).toEqual(['projects/flow-app.md', 'inbox.md'])
  })
  it('is a no-op for an unknown ref', () => {
    const d = withTasks()
    const r = parkTask(d, 'flow-app/t9', T)
    expect(r.data).toBe(d)
    expect(r.changed).toEqual([])
    expect(r.itemId).toBeUndefined()
  })
})

describe('parkTask safety', () => {
  const base = (): FlowData => {
    const d = structuredClone(sample())
    d.projects['flow-app'].tasks = [{ id: 't1', title: 'Plain', status: 'todo', created: '2026-11-01', extra: { energy: 'low' } }]
    return d
  }
  it('does nothing when inbox.md or the project file failed to parse (the task is never lost)', () => {
    for (const path of ['inbox.md', 'projects/flow-app.md']) {
      const d = deepFreeze({ ...base(), skipped: [path] })
      const r = parkTask(d, 'flow-app/t1', T)
      expect(r.data).toBe(d)
      expect(r.changed).toEqual([])
    }
  })
  it("keeps the task's unknown fields on the inbox item", () => {
    const r = parkTask(deepFreeze(base()), 'flow-app/t1', T)
    expect(r.data.inbox.items.at(-1)!.extra).toEqual({ energy: 'low' })
  })
})
