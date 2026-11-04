import { describe, it, expect } from 'vitest'
import { emptyFlow } from './types'
import type { FlowData, Task } from './types'
import { buildReviewPrompt } from './review'

const TODAY = '2026-11-04'
const t = (id: string, title: string, status: Task['status']): Task =>
  ({ id, title, status, created: '2026-10-01', extra: {} })

function sample(): FlowData {
  const d = emptyFlow()
  d.projects.alpha = {
    slug: 'alpha', title: 'Alpha', status: 'active', color: '#111', goal: 'Ship the alpha goal', created: '2026-10-01',
    body: '', extra: {}, tasks: [t('a', 'Done thing', 'done'), t('b', 'Write docs', 'todo'), t('c', 'Fix bug', 'today')],
  }
  d.projects.beta = {
    slug: 'beta', title: 'Beta', status: 'paused', color: '#222', goal: 'Paused beta goal', created: '2026-10-01',
    body: '', extra: {}, tasks: [t('x', 'Hidden task', 'todo')],
  }
  d.days['2026-11-03'] = {
    date: '2026-11-03', planned: [], body: 'Felt tired but pushed through.', extra: {},
    done: [{ ref: 'alpha/a', title: 'Done thing', project: 'alpha', extra: {} }],
    focus: [{ ref: 'alpha/a', title: 'Done thing', project: 'alpha', minutes: 25, extra: {} }],
  }
  return d
}

describe('buildReviewPrompt', () => {
  const p = buildReviewPrompt(sample(), TODAY)
  it('starts with the instruction paragraph', () => {
    expect(p).toMatch(/honest/i)
    expect(p).toMatch(/kind/i)
    expect(p).toMatch(/went well/i)
    expect(p).toMatch(/got in the way/i)
    expect(p).toMatch(/next 3 days/i)
    expect(p).toMatch(/at most 3 tasks per day/i)
  })
  it('has a Last 7 days section with a header per day, oldest to newest', () => {
    expect(p).toContain('## Last 7 days')
    const dates = ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']
    let last = -1
    for (const dt of dates) {
      const i = p.indexOf(`### ${dt}`)
      expect(i).toBeGreaterThan(last)
      last = i
    }
  })
  it('lists done titles with project, focus minutes and note body', () => {
    expect(p).toContain('Done thing')
    expect(p).toContain('Alpha')
    expect(p).toContain('25 min')
    expect(p).toContain('Felt tired but pushed through.')
  })
  it('says Nothing recorded. for empty days', () => {
    expect(p).toContain('### 2026-11-04\nNothing recorded.')
  })
  it('lists active projects with goal and open tasks', () => {
    expect(p).toContain('## Active projects')
    expect(p).toContain('Ship the alpha goal')
    expect(p).toContain('- [today] Fix bug')
    expect(p).toContain('- [todo] Write docs')
    expect(p).not.toContain('Done thing\n- [')
  })
  it('excludes paused projects', () => {
    expect(p).not.toContain('Paused beta goal')
    expect(p).not.toContain('Hidden task')
    expect(p).not.toContain('Beta')
  })
})

describe('buildReviewPrompt general notes', () => {
  it('has no General notes section when notes are empty or blank', () => {
    expect(buildReviewPrompt(sample(), TODAY)).not.toContain('General notes')
    const d = sample()
    d.notes.body = '  \n'
    expect(buildReviewPrompt(d, TODAY)).not.toContain('General notes')
  })
  it('appends the notes under ## General notes', () => {
    const d = sample()
    d.notes.body = 'Remember the thing\n'
    const p = buildReviewPrompt(d, TODAY)
    expect(p).toContain('## General notes\n\nRemember the thing')
    expect(p.indexOf('## General notes')).toBeGreaterThan(p.indexOf('## Active projects'))
  })
  it('truncates to 2,000 characters with an ellipsis', () => {
    const d = sample()
    d.notes.body = 'a'.repeat(2500)
    const p = buildReviewPrompt(d, TODAY)
    expect(p).toContain('a'.repeat(2000) + '…')
    expect(p).not.toContain('a'.repeat(2001))
  })
  it('does not add an ellipsis at exactly 2,000 characters', () => {
    const d = sample()
    d.notes.body = 'a'.repeat(2000)
    expect(buildReviewPrompt(d, TODAY)).not.toContain('…')
  })
})
