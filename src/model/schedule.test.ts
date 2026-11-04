import { describe, expect, it } from 'vitest'
import { promoteScheduled, scheduleTask, weekPlan } from './schedule'
import { emptyFlow, type FlowData, type Task } from './types'

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    Object.values(o as object).forEach(deepFreeze)
  }
  return o
}

const T = '2026-11-04' // Wednesday
const task = (id: string, title: string, extra: Partial<Task> = {}): Task =>
  ({ id, title, status: 'todo', created: '2026-11-01', extra: {}, ...extra })

function sample(): FlowData {
  const d = emptyFlow()
  d.projects.a = {
    slug: 'a', title: 'Alpha', status: 'active', color: '#111', created: '2026-11-01', body: '', extra: {},
    tasks: [
      task('t1', 'One'),
      task('t2', 'Two', { scheduled: '2026-11-06', created: '2026-11-02' }),
      task('t3', 'Three', { status: 'today', planned: T }),
      task('t4', 'Four', { status: 'done', done: '2026-11-03' }),
      task('t5', 'Five', { scheduled: '2026-11-03' }),
      task('t6', 'Six', { created: '2026-10-30' }),
    ],
  }
  d.projects.b = {
    slug: 'b', title: 'Beta', status: 'active', color: '#222', created: '2026-11-01', body: '', extra: {},
    tasks: [task('t1', 'B one', { scheduled: '2026-11-06' }), task('t2', 'B two')],
  }
  d.projects.c = {
    slug: 'c', title: 'Paused', status: 'paused', color: '#333', created: '2026-11-01', body: '', extra: {},
    tasks: [task('t1', 'C one', { scheduled: '2026-11-06' }), task('t2', 'C two')],
  }
  d.days['2026-11-03'] = {
    date: '2026-11-03', planned: [], focus: [], body: '', extra: {},
    done: [{ ref: 'a/t4', title: 'Four', project: 'Alpha', extra: {} }, { ref: 'b/t9', title: 'Gone', project: 'Beta', extra: {} }],
  }
  return deepFreeze(d)
}

const get = (d: FlowData, ref: string) => {
  const [slug, id] = ref.split('/')
  return d.projects[slug].tasks.find((t) => t.id === id)!
}

describe('scheduleTask', () => {
  it('future date sets scheduled and keeps the task in To do', () => {
    const c = scheduleTask(sample(), 'a/t1', '2026-11-07', T)
    expect(get(c.data, 'a/t1')).toMatchObject({ status: 'todo', scheduled: '2026-11-07' })
    expect(c.changed).toEqual(['projects/a.md'])
  })
  it('future date on a Today task moves it back to To do', () => {
    const c = scheduleTask(sample(), 'a/t3', '2026-11-07', T)
    expect(get(c.data, 'a/t3')).toMatchObject({ status: 'todo', scheduled: '2026-11-07' })
  })
  it('today moves the task to Today with the usual bookkeeping and clears scheduled', () => {
    const c = scheduleTask(sample(), 'a/t2', T, T)
    const t = get(c.data, 'a/t2')
    expect(t).toMatchObject({ status: 'today', planned: T })
    expect(t.scheduled).toBeUndefined()
    expect(c.data.days[T].planned).toEqual(['a/t2'])
    expect(c.changed.sort()).toEqual([`days/${T}.md`, 'projects/a.md'])
  })
  it('a past date also moves to Today', () => {
    const c = scheduleTask(sample(), 'a/t1', '2026-11-01', T)
    expect(get(c.data, 'a/t1')).toMatchObject({ status: 'today', planned: T })
    expect(get(c.data, 'a/t1').scheduled).toBeUndefined()
  })
  it('null clears scheduled only', () => {
    const c = scheduleTask(sample(), 'a/t2', null, T)
    expect(get(c.data, 'a/t2').status).toBe('todo')
    expect(get(c.data, 'a/t2').scheduled).toBeUndefined()
    expect(c.changed).toEqual(['projects/a.md'])
  })
  it('is a no-op for done tasks, unknown refs, unchanged dates and clearing nothing', () => {
    const d = sample()
    for (const c of [
      scheduleTask(d, 'a/t4', '2026-11-07', T), scheduleTask(d, 'a/t4', null, T), scheduleTask(d, 'x/t1', '2026-11-07', T),
      scheduleTask(d, 'a/t2', '2026-11-06', T), scheduleTask(d, 'a/t1', null, T),
    ]) {
      expect(c.changed).toEqual([])
      expect(c.data).toBe(d)
    }
  })
})

describe('promoteScheduled', () => {
  it('moves every due To do task of an active project into Today, clearing the field', () => {
    const c = promoteScheduled(sample(), '2026-11-06')
    for (const ref of ['a/t2', 'a/t5', 'b/t1']) {
      expect(get(c.data, ref)).toMatchObject({ status: 'today', planned: '2026-11-06' })
      expect(get(c.data, ref).scheduled).toBeUndefined()
    }
    expect(get(c.data, 'a/t1').status).toBe('todo')
    expect(c.data.days['2026-11-06'].planned).toEqual(['a/t2', 'a/t5', 'b/t1'])
    expect(c.changed.sort()).toEqual(['days/2026-11-06.md', 'projects/a.md', 'projects/b.md'])
  })
  it('leaves due tasks of paused projects waiting with their date', () => {
    const c = promoteScheduled(sample(), '2026-11-06')
    expect(get(c.data, 'c/t1')).toMatchObject({ status: 'todo', scheduled: '2026-11-06' })
    expect(c.changed).not.toContain('projects/c.md')
  })
  it('only promotes what is due', () => {
    const c = promoteScheduled(sample(), T)
    expect(get(c.data, 'a/t5').status).toBe('today')
    expect(get(c.data, 'a/t2')).toMatchObject({ status: 'todo', scheduled: '2026-11-06' })
    expect(c.changed.sort()).toEqual([`days/${T}.md`, 'projects/a.md'])
  })
  it('is a no-op change when nothing is due', () => {
    const d = sample()
    const c = promoteScheduled(d, '2026-11-02')
    expect(c.changed).toEqual([])
    expect(c.data).toBe(d)
  })
})

describe('weekPlan', () => {
  const MON = '2026-11-02'
  it('buckets scheduled To do tasks by day, active projects only', () => {
    const w = weekPlan(sample(), MON, null)
    expect(w.days.map((x) => x.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    expect(w.days[4].scheduled.map((c) => c.key)).toEqual(['b/t1', 'a/t2'])
    expect(w.days[4].scheduled[1]).toMatchObject({ title: 'Two', projectTitle: 'Alpha', color: '#111', scheduled: '2026-11-06' })
    expect(w.days[1].scheduled.map((c) => c.key)).toEqual(['a/t5'])
    expect(w.days[1].done.map((e) => e.ref)).toEqual(['a/t4', 'b/t9'])
    expect(w.unscheduled.map((c) => c.key)).toEqual(['a/t6', 'a/t1', 'b/t2'])
  })
  it('respects the project filter for scheduled, done and unscheduled', () => {
    const w = weekPlan(sample(), MON, 'b')
    expect(w.days[4].scheduled.map((c) => c.key)).toEqual(['b/t1'])
    expect(w.days[1].done.map((e) => e.ref)).toEqual(['b/t9'])
    expect(w.unscheduled.map((c) => c.key)).toEqual(['b/t2'])
  })
})
