import { describe, it, expect } from 'vitest'
import { logFocus } from './focus'
import { emptyFlow, type FlowData } from './types'

const T = '2026-11-04'
function sample(): FlowData {
  const d = emptyFlow()
  d.projects['flow-app'] = {
    slug: 'flow-app', title: 'Flow app', status: 'active', color: '#0091ff', created: '2026-11-01', body: '', extra: {},
    tasks: [{ id: 't1', title: 'Write tests', status: 'todo', created: '2026-11-01', extra: {} }],
  }
  return Object.freeze(d)
}

describe('logFocus', () => {
  it('creates the day and appends a snapshot entry', () => {
    const r = logFocus(sample(), 'flow-app/t1', 25, T)
    expect(r.data.days[T].focus).toEqual([{ ref: 'flow-app/t1', title: 'Write tests', project: 'Flow app', minutes: 25, extra: {} }])
    expect(r.data.days[T].planned).toEqual([])
    expect(r.changed).toEqual(['days/2026-11-04.md'])
  })
  it('appends to an existing day without mutating the input', () => {
    const first = logFocus(sample(), 'flow-app/t1', 10, T).data
    const r = logFocus(first, 'flow-app/t1', 15.9, T)
    expect(r.data.days[T].focus.map((e) => e.minutes)).toEqual([10, 15])
    expect(first.days[T].focus).toHaveLength(1)
  })
  it('ignores sessions under one minute and unknown refs', () => {
    const d = sample()
    expect(logFocus(d, 'flow-app/t1', 0.9, T)).toEqual({ data: d, changed: [] })
    expect(logFocus(d, 'flow-app/zz', 5, T).changed).toEqual([])
    expect(logFocus(d, 'nope/t1', 5, T).changed).toEqual([])
    expect(logFocus(d, 'flow-app/t1', NaN, T).changed).toEqual([])
  })
})
