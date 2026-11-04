import { describe, expect, it } from 'vitest'
import { focusProjectThisWeek, saveReview, unfinishedThisWeek } from './review-week'
import { emptyFlow, type FlowData, type Task } from './types'

const T = '2026-11-04' // Wednesday, ISO week 2026-W45
const WEEK = '2026-W45'
const task = (id: string, title: string, extra: Partial<Task> = {}): Task =>
  ({ id, title, status: 'todo', created: '2026-11-01', extra: {}, ...extra })

function sample(): FlowData {
  const d = emptyFlow()
  d.projects.a = {
    slug: 'a', title: 'Alpha', status: 'active', color: '#111', created: '2026-11-01', body: '', extra: {},
    tasks: [
      task('t1', 'Unscheduled'),
      task('t2', 'Friday', { scheduled: '2026-11-06' }),
      task('t3', 'In today', { status: 'today' }),
      task('t4', 'Finished', { status: 'done', done: T }),
      task('t5', 'Sunday', { scheduled: '2026-11-08' }),
      task('t6', 'Next Monday', { scheduled: '2026-11-09' }),
      task('t7', 'Last Sunday', { scheduled: '2026-11-01' }),
      task('t8', 'Monday', { scheduled: '2026-11-02' }),
    ],
  }
  d.projects.p = {
    slug: 'p', title: 'Paused', status: 'paused', color: '#222', created: '2026-11-01', body: '', extra: {},
    tasks: [task('t1', 'Hidden today', { status: 'today' }), task('t2', 'Hidden sched', { scheduled: '2026-11-05' })],
  }
  return d
}

describe('unfinishedThisWeek', () => {
  it('lists Today tasks and To do tasks scheduled Mon-Sun this week, active projects only', () => {
    const keys = unfinishedThisWeek(sample(), T).map((c) => c.key).sort()
    expect(keys).toEqual(['a/t2', 'a/t3', 'a/t5', 'a/t8'])
  })
  it('returns cards with project info', () => {
    const c = unfinishedThisWeek(sample(), T).find((x) => x.key === 'a/t3')!
    expect(c).toMatchObject({ title: 'In today', projectTitle: 'Alpha', kind: 'task' })
  })
})

describe('saveReview', () => {
  it('creates the review file content when missing', () => {
    const d = sample()
    const c = saveReview(d, WEEK, { intention: 'Calm week' })
    expect(c.changed).toEqual([`reviews/${WEEK}.md`])
    expect(c.data.reviews[WEEK]).toEqual({ week: WEEK, intention: 'Calm week', body: '', extra: {} })
    expect(d.reviews[WEEK]).toBeUndefined()
  })
  it('updates fields, keeps the rest and extras', () => {
    let d = sample()
    d.reviews[WEEK] = { week: WEEK, body: 'old', extra: { mood: 'ok' } }
    d = saveReview(d, WEEK, { focusProject: 'a' }).data
    d = saveReview(d, WEEK, { body: 'new' }).data
    expect(d.reviews[WEEK]).toEqual({ week: WEEK, focusProject: 'a', body: 'new', extra: { mood: 'ok' } })
  })
  it('null or empty focus project and empty intention remove the key', () => {
    let d = saveReview(sample(), WEEK, { focusProject: 'a', intention: 'x' }).data
    d = saveReview(d, WEEK, { focusProject: null }).data
    expect('focusProject' in d.reviews[WEEK]).toBe(false)
    d = saveReview(d, WEEK, { focusProject: 'a' }).data
    d = saveReview(d, WEEK, { focusProject: '', intention: '' }).data
    expect('focusProject' in d.reviews[WEEK]).toBe(false)
    expect('intention' in d.reviews[WEEK]).toBe(false)
  })
  it('unchanged values are no change, and an empty patch on a missing review writes nothing', () => {
    const d = saveReview(sample(), WEEK, { focusProject: 'a', intention: 'x', body: 'b' }).data
    expect(saveReview(d, WEEK, { focusProject: 'a', intention: 'x', body: 'b' }).changed).toEqual([])
    expect(saveReview(sample(), WEEK, { focusProject: null, intention: '', body: '' }).changed).toEqual([])
    expect(saveReview(sample(), WEEK, {}).changed).toEqual([])
  })
})

describe('focusProjectThisWeek', () => {
  it('returns the focus project of this ISO week when that project exists', () => {
    const d = saveReview(sample(), WEEK, { focusProject: 'a' }).data
    expect(focusProjectThisWeek(d, T)).toBe('a')
    expect(focusProjectThisWeek(d, '2026-11-09')).toBeUndefined()
  })
  it('ignores a project that does not exist', () => {
    const d = saveReview(sample(), WEEK, { focusProject: 'gone' }).data
    expect(focusProjectThisWeek(d, T)).toBeUndefined()
  })
})
