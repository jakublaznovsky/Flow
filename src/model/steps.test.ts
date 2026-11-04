import { describe, it, expect } from 'vitest'
import { addStep, deleteStep, editStep, nextStep, toggleStep } from './steps'
import { findTask } from './tasks'
import { emptyFlow, type FlowData } from './types'

function sample(): FlowData {
  const d = emptyFlow()
  d.projects['flow-app'] = {
    slug: 'flow-app', title: 'Flow app', status: 'active', color: '#0091ff', created: '2026-11-01', body: '', extra: {},
    tasks: [
      { id: 't1', title: 'Write tests', status: 'todo', created: '2026-11-01', extra: {} },
      { id: 't2', title: 'Ship', status: 'today', created: '2026-11-01', extra: {},
        steps: [{ text: 'a', done: true, extra: {} }, { text: 'b', done: false, extra: { n: 1 } }] },
    ],
  }
  return Object.freeze(d)
}
const steps = (d: FlowData, ref: string) => findTask(d, ref)!.task.steps

describe('steps', () => {
  it('adds a trimmed step without mutating the input', () => {
    const d = sample()
    const r = addStep(d, 'flow-app/t1', '  first  ')
    expect(steps(r.data, 'flow-app/t1')).toEqual([{ text: 'first', done: false, extra: {} }])
    expect(r.changed).toEqual(['projects/flow-app.md'])
    expect(findTask(d, 'flow-app/t1')!.task.steps).toBeUndefined()
  })
  it('ignores blank text and unknown refs', () => {
    const d = sample()
    expect(addStep(d, 'flow-app/t1', '   ')).toEqual({ data: d, changed: [] })
    expect(addStep(d, 'flow-app/zz', 'x').changed).toEqual([])
    expect(addStep(d, 'nope', 'x').changed).toEqual([])
  })
  it('toggles a step and keeps the task status', () => {
    const r = toggleStep(sample(), 'flow-app/t2', 1)
    expect(steps(r.data, 'flow-app/t2')!.map((s) => s.done)).toEqual([true, true])
    expect(findTask(r.data, 'flow-app/t2')!.task.status).toBe('today')
    expect(steps(r.data, 'flow-app/t2')![1].extra).toEqual({ n: 1 })
    expect(r.changed).toEqual(['projects/flow-app.md'])
  })
  it('returns no change for a bad index', () => {
    const d = sample()
    expect(toggleStep(d, 'flow-app/t2', 5).changed).toEqual([])
    expect(toggleStep(d, 'flow-app/t2', -1).changed).toEqual([])
    expect(deleteStep(d, 'flow-app/t2', 2).changed).toEqual([])
    expect(editStep(d, 'flow-app/t2', 9, 'x').changed).toEqual([])
    expect(toggleStep(d, 'flow-app/t1', 0).changed).toEqual([])
  })
  it('edits text, and a blank edit deletes the step', () => {
    const d = sample()
    expect(steps(editStep(d, 'flow-app/t2', 0, ' z ').data, 'flow-app/t2')![0].text).toBe('z')
    expect(steps(editStep(d, 'flow-app/t2', 0, '  ').data, 'flow-app/t2')!.map((s) => s.text)).toEqual(['b'])
  })
  it('deletes a step; deleting the last one drops the list', () => {
    let d = deleteStep(sample(), 'flow-app/t2', 0).data
    expect(steps(d, 'flow-app/t2')!.map((s) => s.text)).toEqual(['b'])
    d = deleteStep(d, 'flow-app/t2', 0).data
    expect(steps(d, 'flow-app/t2')).toBeUndefined()
  })
  it('nextStep is the first unchecked step', () => {
    const t = findTask(sample(), 'flow-app/t2')!.task
    expect(nextStep(t)).toBe('b')
    expect(nextStep(findTask(sample(), 'flow-app/t1')!.task)).toBeUndefined()
    expect(nextStep({ ...t, steps: t.steps!.map((s) => ({ ...s, done: true })) })).toBeUndefined()
  })
})
