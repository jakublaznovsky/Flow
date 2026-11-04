import { describe, it, expect } from 'vitest'
import { addDecision, createProject, updateProject } from './projects'
import { emptyFlow, type FlowData } from './types'

function sample(): FlowData {
  const d = emptyFlow()
  d.projects['flow-app'] = {
    slug: 'flow-app', title: 'Flow app', status: 'active', color: '#0091ff', created: '2026-11-01',
    tasks: [], body: 'notes', extra: {},
  }
  return Object.freeze(d)
}
const T = '2026-11-04'

describe('createProject', () => {
  it('creates an active project with slug, color and created date', () => {
    const r = createProject(sample(), 'Learn Spanish', T)
    expect(r.slug).toBe('learn-spanish')
    expect(r.data.projects['learn-spanish']).toEqual({
      slug: 'learn-spanish', title: 'Learn Spanish', status: 'active', color: '#f76b15',
      created: T, tasks: [], body: '', extra: {},
    })
    expect(r.changed).toEqual(['projects/learn-spanish.md'])
  })
  it('avoids slugs of skipped project files', () => {
    const d = { ...sample(), skipped: ['projects/work.md'] }
    const r = createProject(d, 'Work', T)
    expect(r.slug).toBe('work-2')
  })
  it('avoids existing slugs', () => {
    expect(createProject(sample(), 'Flow app', T).slug).toBe('flow-app-2')
  })
  it('blank title is a no-op with empty slug', () => {
    const d = sample()
    const r = createProject(d, '  ', T)
    expect(r.slug).toBe('')
    expect(r.data).toBe(d)
    expect(r.changed).toEqual([])
  })
})

describe('updateProject', () => {
  it('patches title, color, status but never the slug', () => {
    const r = updateProject(sample(), 'flow-app', { title: ' Flow ', color: '#fff', status: 'paused' })
    expect(r.data.projects['flow-app']).toMatchObject({ slug: 'flow-app', title: 'Flow', color: '#fff', status: 'paused', body: 'notes' })
    expect(r.changed).toEqual(['projects/flow-app.md'])
  })
  it('blank title keeps the old one', () => {
    const r = updateProject(sample(), 'flow-app', { title: '  ' })
    expect(r.data.projects['flow-app'].title).toBe('Flow app')
  })
  it('unknown slug is a no-op', () => {
    const d = sample()
    expect(updateProject(d, 'nope', { title: 'x' })).toEqual({ data: d, changed: [] })
  })
})

const withBody = (body: string, goal?: string): FlowData => {
  const d = structuredClone(sample()) as FlowData
  d.projects['flow-app'].body = body
  if (goal !== undefined) d.projects['flow-app'].goal = goal
  return Object.freeze(d)
}

describe('updateProject goal and body', () => {
  it('sets the goal', () => {
    const r = updateProject(sample(), 'flow-app', { goal: 'Ship it' })
    expect(r.data.projects['flow-app'].goal).toBe('Ship it')
    expect(r.changed).toEqual(['projects/flow-app.md'])
  })
  it('removes the goal when empty', () => {
    const r = updateProject(withBody('x', 'old'), 'flow-app', { goal: '' })
    expect('goal' in r.data.projects['flow-app']).toBe(false)
    expect(r.changed).toEqual(['projects/flow-app.md'])
  })
  it('replaces the body', () => {
    const r = updateProject(sample(), 'flow-app', { body: 'new notes\n' })
    expect(r.data.projects['flow-app'].body).toBe('new notes\n')
  })
})

describe('addDecision', () => {
  const body = (d: FlowData) => d.projects['flow-app'].body
  it('appends after the last decision line of the section', () => {
    const r = addDecision(withBody('Notes\n\n## Decisions\n- 2026-11-01: a\n- 2026-11-02: b\n\n## Other\ntext\n'), 'flow-app', '  c  ', T)
    expect(body(r.data)).toBe('Notes\n\n## Decisions\n- 2026-11-01: a\n- 2026-11-02: b\n- 2026-11-04: c\n\n## Other\ntext\n')
    expect(r.changed).toEqual(['projects/flow-app.md'])
  })
  it('inserts right after the heading when the section is empty', () => {
    const r = addDecision(withBody('Notes\n\n## Decisions\n\n## Other\n'), 'flow-app', 'c', T)
    expect(body(r.data)).toBe('Notes\n\n## Decisions\n- 2026-11-04: c\n\n## Other\n')
  })
  it('inserts after the heading when the section is last and empty', () => {
    const r = addDecision(withBody('Notes\n\n## Decisions\n'), 'flow-app', 'c', T)
    expect(body(r.data)).toBe('Notes\n\n## Decisions\n- 2026-11-04: c\n')
  })
  it('creates the section at the end when missing', () => {
    expect(body(addDecision(withBody('Notes'), 'flow-app', 'c', T).data)).toBe('Notes\n\n## Decisions\n- 2026-11-04: c\n')
    expect(body(addDecision(withBody('Notes\n'), 'flow-app', 'c', T).data)).toBe('Notes\n\n## Decisions\n- 2026-11-04: c\n')
    expect(body(addDecision(withBody('Notes\n\n'), 'flow-app', 'c', T).data)).toBe('Notes\n\n## Decisions\n- 2026-11-04: c\n')
    expect(body(addDecision(withBody(''), 'flow-app', 'c', T).data)).toBe('## Decisions\n- 2026-11-04: c\n')
  })
  it('does nothing for blank text or unknown project', () => {
    expect(addDecision(sample(), 'flow-app', '   ', T)).toEqual({ data: sample(), changed: [] })
    expect(addDecision(sample(), 'nope', 'x', T).changed).toEqual([])
  })
})
