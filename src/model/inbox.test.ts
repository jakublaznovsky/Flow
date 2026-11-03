import { describe, it, expect } from 'vitest'
import { addInboxItem, deleteInboxItem, editInboxItem, promoteInboxItem } from './inbox'
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
