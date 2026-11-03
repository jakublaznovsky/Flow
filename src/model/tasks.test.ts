import { describe, it, expect } from 'vitest'
import { addTask, editTask, moveTask, deleteTask, findTask, changeTaskProject } from './tasks'
import { emptyFlow, type FlowData, type Task } from './types'

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    Object.values(o as object).forEach(deepFreeze)
  }
  return o
}

const task = (id: string, title: string, extra: Partial<Task> = {}): Task =>
  ({ id, title, status: 'todo', created: '2026-11-01', extra: {}, ...extra })

function sample(): FlowData {
  const d = emptyFlow()
  d.projects['flow-app'] = {
    slug: 'flow-app', title: 'Flow app', status: 'active', color: '#0091ff', created: '2026-11-01',
    tasks: [task('t1', 'Write spec'), task('t2', 'Set up Tauri project', { firstStep: 'npm create' })],
    body: '', extra: {},
  }
  d.projects['learn-spanish'] = {
    slug: 'learn-spanish', title: 'Learn Spanish', status: 'active', color: '#30a46c', created: '2026-11-01',
    tasks: ['t1', 't2', 't3', 't4', 't5'].map((id) => task(id, `Lesson ${id}`)), body: '', extra: {},
  }
  return deepFreeze(d)
}

const T = '2026-11-04'

describe('findTask', () => {
  it('finds a task and returns undefined for unknown refs', () => {
    const d = sample()
    expect(findTask(d, 'flow-app/t2')?.task.title).toBe('Set up Tauri project')
    expect(findTask(d, 'flow-app/t9')).toBeUndefined()
    expect(findTask(d, 'nope/t1')).toBeUndefined()
    expect(findTask(d, 'garbage')).toBeUndefined()
  })
})

describe('addTask', () => {
  it('adds a todo with next id', () => {
    const r = addTask(sample(), 'flow-app', '  New thing ', 'todo', T)
    const t = r.data.projects['flow-app'].tasks[2]
    expect(t).toEqual({ id: 't3', title: 'New thing', status: 'todo', created: T, extra: {} })
    expect(r.changed).toEqual(['projects/flow-app.md'])
  })
  it('adds as today and logs the day', () => {
    const r = addTask(sample(), 'flow-app', 'Now', 'today', T)
    const t = r.data.projects['flow-app'].tasks[2]
    expect(t.status).toBe('today')
    expect(t.planned).toBe(T)
    expect(r.data.days[T]).toEqual({ date: T, planned: ['flow-app/t3'], done: [], body: '', extra: {} })
    expect(r.changed).toEqual(['projects/flow-app.md', 'days/2026-11-04.md'])
  })
  it('ignores unknown slug and empty titles', () => {
    const d = sample()
    expect(addTask(d, 'nope', 'x', 'todo', T)).toEqual({ data: d, changed: [] })
    expect(addTask(d, 'flow-app', '   ', 'todo', T)).toEqual({ data: d, changed: [] })
  })
})

describe('editTask', () => {
  it('edits title and firstStep', () => {
    const r = editTask(sample(), 'flow-app/t1', { title: ' Renamed ', firstStep: 'open file' }, T)
    expect(r.data.projects['flow-app'].tasks[0]).toMatchObject({ title: 'Renamed', firstStep: 'open file' })
    expect(r.changed).toEqual(['projects/flow-app.md'])
  })
  it('empty firstStep removes the field', () => {
    const r = editTask(sample(), 'flow-app/t2', { firstStep: '' }, T)
    expect('firstStep' in r.data.projects['flow-app'].tasks[1]).toBe(false)
  })
  it('keeps title when patch title is blank; unknown ref is a no-op', () => {
    const d = sample()
    expect(editTask(d, 'flow-app/t1', { title: '  ' }, T).data.projects['flow-app'].tasks[0].title).toBe('Write spec')
    expect(editTask(d, 'flow-app/t9', { title: 'x' }, T)).toEqual({ data: d, changed: [] })
  })
})

describe('moveTask', () => {
  it('todo -> today plans the day, no duplicates when repeated', () => {
    const a = moveTask(sample(), 'flow-app/t1', 'today', T)
    expect(a.data.projects['flow-app'].tasks[0]).toMatchObject({ status: 'today', planned: T })
    expect(a.data.days[T].planned).toEqual(['flow-app/t1'])
    expect(a.changed).toEqual(['projects/flow-app.md', 'days/2026-11-04.md'])
    const b = moveTask(a.data, 'flow-app/t1', 'todo', T)
    const c = moveTask(b.data, 'flow-app/t1', 'today', T)
    expect(c.data.days[T].planned).toEqual(['flow-app/t1'])
  })
  it('complete logs a done entry', () => {
    const r = moveTask(sample(), 'flow-app/t2', 'done', T)
    expect(r.data.projects['flow-app'].tasks[1]).toMatchObject({ status: 'done', done: T })
    expect(r.data.days[T].done).toEqual([{ ref: 'flow-app/t2', title: 'Set up Tauri project', project: 'Flow app' }])
    expect(r.changed).toEqual(['projects/flow-app.md', 'days/2026-11-04.md'])
  })
  it('undo on a later date removes the entry from the completion day', () => {
    const done = moveTask(sample(), 'flow-app/t2', 'done', T).data
    const r = moveTask(done, 'flow-app/t2', 'todo', '2026-11-06')
    expect('done' in r.data.projects['flow-app'].tasks[1]).toBe(false)
    expect(r.data.projects['flow-app'].tasks[1].status).toBe('todo')
    expect(r.data.days[T].done).toEqual([])
    expect(r.changed).toEqual(['projects/flow-app.md', 'days/2026-11-04.md'])
  })
  it('done -> today clears done too', () => {
    const done = moveTask(sample(), 'flow-app/t2', 'done', T).data
    const r = moveTask(done, 'flow-app/t2', 'today', '2026-11-05')
    expect(r.data.projects['flow-app'].tasks[1].status).toBe('today')
    expect(r.data.days[T].done).toEqual([])
  })
  it('today -> todo leaves day files untouched', () => {
    const a = moveTask(sample(), 'flow-app/t1', 'today', T).data
    const r = moveTask(a, 'flow-app/t1', 'todo', T)
    expect(r.changed).toEqual(['projects/flow-app.md'])
    expect(r.data.days).toEqual(a.days)
  })
  it('completing twice does not duplicate', () => {
    const a = moveTask(sample(), 'flow-app/t2', 'done', T).data
    const r = moveTask(a, 'flow-app/t2', 'done', T)
    expect(r.changed).toEqual([])
    expect(r.data.days[T].done).toHaveLength(1)
  })
  it('same status and unknown ref are no-ops', () => {
    const d = sample()
    expect(moveTask(d, 'flow-app/t1', 'todo', T)).toEqual({ data: d, changed: [] })
    expect(moveTask(d, 'flow-app/t9', 'done', T)).toEqual({ data: d, changed: [] })
  })
  it('undo tolerates a missing completion day', () => {
    const d = sample()
    const p = structuredClone(d.projects['flow-app'])
    p.tasks[0] = { ...p.tasks[0], status: 'done', done: '2026-10-01' }
    const r = moveTask({ ...d, projects: { ...d.projects, 'flow-app': p } }, 'flow-app/t1', 'todo', T)
    expect(r.changed).toEqual(['projects/flow-app.md'])
  })
})

describe('deleteTask', () => {
  it('removes the task and keeps day snapshots', () => {
    const done = moveTask(sample(), 'flow-app/t2', 'done', T).data
    const r = deleteTask(done, 'flow-app/t2')
    expect(r.data.projects['flow-app'].tasks.map((t) => t.id)).toEqual(['t1'])
    expect(r.data.days[T].done).toHaveLength(1)
    expect(r.changed).toEqual(['projects/flow-app.md'])
  })
  it('unknown ref is a no-op', () => {
    const d = sample()
    expect(deleteTask(d, 'x/t1')).toEqual({ data: d, changed: [] })
  })
})

describe('changeTaskProject', () => {
  it('moves task with a new id and keeps fields', () => {
    const r = changeTaskProject(sample(), 'flow-app/t2', 'learn-spanish')
    expect(r.ref).toBe('learn-spanish/t6')
    expect(r.data.projects['flow-app'].tasks.map((t) => t.id)).toEqual(['t1'])
    expect(r.data.projects['learn-spanish'].tasks[5]).toMatchObject({
      id: 't6', title: 'Set up Tauri project', firstStep: 'npm create', created: '2026-11-01',
    })
    expect(r.changed).toEqual(['projects/flow-app.md', 'projects/learn-spanish.md'])
  })
  it('same or unknown slug is a no-op returning the original ref', () => {
    const d = sample()
    expect(changeTaskProject(d, 'flow-app/t2', 'flow-app')).toEqual({ data: d, changed: [], ref: 'flow-app/t2' })
    expect(changeTaskProject(d, 'flow-app/t2', 'nope')).toEqual({ data: d, changed: [], ref: 'flow-app/t2' })
    expect(changeTaskProject(d, 'flow-app/t9', 'learn-spanish').changed).toEqual([])
  })
})
