import { describe, it, expect } from 'vitest'
import { boardColumns } from './board'
import { emptyFlow, type FlowData, type Task } from './types'

const T = '2026-11-04'
const task = (id: string, title: string, extra: Partial<Task> = {}): Task =>
  ({ id, title, status: 'todo', created: '2026-11-01', extra: {}, ...extra })

function sample(): FlowData {
  const d = emptyFlow()
  d.projects['flow-app'] = {
    slug: 'flow-app', title: 'Flow app', status: 'active', color: '#0091ff', created: '2026-11-01',
    tasks: [
      task('t1', 'Spec', { firstStep: 'open doc' }),
      task('t2', 'Build', { status: 'today', created: '2026-11-02' }),
      task('t3', 'Ship', { status: 'done', done: T }),
      task('t4', 'Old', { status: 'done', done: '2026-11-03' }),
    ], body: '', extra: {},
  }
  d.projects['learn-spanish'] = {
    slug: 'learn-spanish', title: 'Learn Spanish', status: 'active', color: '#30a46c', created: '2026-11-01',
    tasks: [task('t1', 'Lesson 1')], body: '', extra: {},
  }
  d.projects.paused = {
    slug: 'paused', title: 'Paused', status: 'paused', color: '#000', created: '2026-11-01',
    tasks: [task('t1', 'Hidden'), task('t2', 'Hidden today', { status: 'today' }), task('t3', 'Hidden done', { status: 'done', done: T })],
    body: '', extra: {},
  }
  d.inbox.items = [
    { id: 'i1', text: 'Idea B', created: '2026-11-03', extra: {} },
    { id: 'i2', text: 'Idea A', created: '2026-11-02', extra: {} },
  ]
  return d
}
const keys = (cards: { key: string }[]) => cards.map((c) => c.key)

describe('boardColumns', () => {
  it('puts cards into columns, default sorted by created then key', () => {
    const c = boardColumns(sample(), T, null, {})
    expect(keys(c.inbox)).toEqual(['inbox/i2', 'inbox/i1'])
    expect(keys(c.todo)).toEqual(['flow-app/t1', 'learn-spanish/t1'])
    expect(keys(c.today)).toEqual(['flow-app/t2'])
    expect(keys(c.done)).toEqual(['flow-app/t3'])
  })
  it('builds task and inbox cards', () => {
    const c = boardColumns(sample(), T, null, {})
    expect(c.todo[0]).toEqual({
      key: 'flow-app/t1', kind: 'task', title: 'Spec', firstStep: 'open doc', projectSlug: 'flow-app',
      projectTitle: 'Flow app', color: '#0091ff', created: '2026-11-01',
    })
    expect(c.inbox[0]).toEqual({ key: 'inbox/i2', kind: 'inbox', title: 'Idea A', created: '2026-11-02' })
  })
  it('excludes paused project tasks from every column', () => {
    const c = boardColumns(sample(), T, null, {})
    const all = Object.values(c).flat().map((x) => x.key)
    expect(all.some((k) => k.startsWith('paused/'))).toBe(false)
  })
  it('done column excludes tasks done on other days', () => {
    expect(keys(boardColumns(sample(), T, null, {}).done)).not.toContain('flow-app/t4')
  })
  it('filter hides other projects but keeps inbox', () => {
    const c = boardColumns(sample(), T, 'flow-app', {})
    expect(keys(c.todo)).toEqual(['flow-app/t1'])
    expect(c.inbox).toHaveLength(2)
  })
  it('explicit order first, unknown keys ignored, rest by default order', () => {
    const c = boardColumns(sample(), T, null, { todo: ['learn-spanish/t1', 'nope/t9'] })
    expect(keys(c.todo)).toEqual(['learn-spanish/t1', 'flow-app/t1'])
    const i = boardColumns(sample(), T, null, { inbox: ['inbox/i1'] })
    expect(keys(i.inbox)).toEqual(['inbox/i1', 'inbox/i2'])
  })
})
