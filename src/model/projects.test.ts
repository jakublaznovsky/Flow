import { describe, it, expect } from 'vitest'
import { createProject, updateProject } from './projects'
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
