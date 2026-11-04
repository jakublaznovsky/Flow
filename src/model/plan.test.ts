import { describe, it, expect } from 'vitest'
import { emptyFlow, type FlowData, type Task } from './types'
import { planSuggestions } from './plan'

const TODAY = '2026-11-04'
const t = (id: string, title: string, status: Task['status'], extra: Partial<Task> = {}): Task =>
  ({ id, title, status, created: '2026-10-01', extra: {}, ...extra })

function sample(): FlowData {
  const d = emptyFlow()
  d.projects.alpha = { slug: 'alpha', title: 'Alpha', status: 'active', color: '#111', created: '2026-10-01', body: '', extra: {},
    tasks: [t('t1', 'Write docs', 'todo'), t('t2', 'Fix bug', 'today', { planned: TODAY }), t('t3', 'Old', 'done', { done: '2026-11-01' })] }
  d.projects.home = { slug: 'home', title: 'Home', status: 'active', color: '#222', created: '2026-10-01', body: '', extra: {}, tasks: [] }
  d.projects.old = { slug: 'old', title: 'Old stuff', status: 'paused', color: '#333', created: '2026-10-01', body: '', extra: {}, tasks: [] }
  return d
}

describe('planSuggestions', () => {
  it('schedules an existing open task for tomorrow', () => {
    const c = planSuggestions(sample(), [{ ref: 'alpha/t1', title: 'Write docs', project: 'Alpha', first_step: 'x' }], TODAY)
    const task = c.data.projects.alpha.tasks.find((x) => x.id === 't1')!
    expect(task.status).toBe('todo')
    expect(task.scheduled).toBe('2026-11-05')
    expect(task.firstStep).toBeUndefined()
    expect(c.changed).toEqual(['projects/alpha.md'])
  })

  it('leaves a task already in Today where it is and counts it as planned', () => {
    const d = sample()
    const c = planSuggestions(d, [{ ref: 'alpha/t2', title: 'Fix bug', project: 'Alpha', first_step: 'x' }], TODAY)
    const task = c.data.projects.alpha.tasks.find((x) => x.id === 't2')!
    expect(task.status).toBe('today')
    expect(task.scheduled).toBeUndefined()
    expect(c.data).toBe(d)
    expect(c.changed).toEqual([])
    expect(c.added).toEqual([true])
  })

  it('creates a new task in the project matched by title, with its first step, scheduled for tomorrow', () => {
    const c = planSuggestions(sample(), [{ title: 'Buy stamps', project: '  home ', first_step: 'Find the wallet' }], TODAY)
    expect(c.data.projects.home.tasks).toEqual([
      { id: 't1', title: 'Buy stamps', status: 'todo', created: TODAY, firstStep: 'Find the wallet', scheduled: '2026-11-05', extra: {} },
    ])
    expect(c.changed).toEqual(['projects/home.md'])
  })

  it('treats unknown and done refs as new tasks; unknown projects fall back to the preferred, else first active project', () => {
    const d = sample()
    const a = planSuggestions(d, [{ ref: 'alpha/t9', title: 'New A', project: 'Nope', first_step: 's' }], TODAY)
    expect(a.data.projects.alpha.tasks.map((x) => x.title)).toContain('New A')
    const b = planSuggestions(d, [{ ref: 'alpha/t3', title: 'Again', project: 'Old stuff', first_step: 's' }], TODAY, 'home')
    expect(b.data.projects.home.tasks.map((x) => x.title)).toEqual(['Again'])
    expect(b.data.projects.old.tasks).toEqual([])
  })

  it('applies several suggestions as one change', () => {
    const c = planSuggestions(sample(), [
      { ref: 'alpha/t1', title: 'Write docs', project: 'Alpha', first_step: 'x' },
      { title: 'One', project: 'Alpha', first_step: 'a' },
      { title: 'Two', project: 'Alpha', first_step: 'b' },
    ], TODAY)
    const tasks = c.data.projects.alpha.tasks
    expect(tasks.filter((x) => x.scheduled === '2026-11-05').map((x) => x.id)).toEqual(['t1', 't4', 't5'])
    expect(c.changed).toEqual(['projects/alpha.md'])
  })

  it('treats a ref of a paused project as a new task in an active project', () => {
    const d = sample()
    d.projects.old.tasks = [t('t1', 'Paused task', 'todo')]
    const c = planSuggestions(d, [{ ref: 'old/t1', title: 'Paused task', project: 'Alpha', first_step: 's' }], TODAY)
    expect(c.data.projects.old.tasks[0].scheduled).toBeUndefined()
    expect(c.data.projects.alpha.tasks.find((x) => x.title === 'Paused task')?.scheduled).toBe('2026-11-05')
    expect(c.added).toEqual([true])
  })

  it('reports per suggestion whether it is now on tomorrow', () => {
    const d = sample()
    d.projects.alpha.tasks[0].scheduled = '2026-11-05'
    const c = planSuggestions(d, [
      { ref: 'alpha/t1', title: 'Write docs', project: 'Alpha', first_step: 'x' },
      { title: 'New', project: 'Home', first_step: 'y' },
      { title: '   ', project: 'Home', first_step: 'y' },
    ], TODAY)
    expect(c.added).toEqual([true, true, false])
    const none = planSuggestions(emptyFlow(), [{ title: 'X', project: 'Y', first_step: 'z' }], TODAY)
    expect(none.added).toEqual([false])
  })

  it('does nothing without an active project', () => {
    const d = emptyFlow()
    const c = planSuggestions(d, [{ title: 'X', project: 'Y', first_step: 'z' }], TODAY)
    expect(c.changed).toEqual([])
    expect(c.data).toBe(d)
  })
})
