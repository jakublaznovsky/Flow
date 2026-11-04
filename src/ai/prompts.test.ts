import { describe, expect, it } from 'vitest'
import { emptyFlow, type FlowData, type Task } from '../model/types'
import { buildPlanPrompt, buildReviewPrompt } from './prompts'
import { buildReviewPrompt as modelReview } from '../model/review'

const TODAY = '2026-11-04' // Wednesday, ISO week 2026-W45
const t = (id: string, title: string, status: Task['status'], extra: Partial<Task> = {}): Task =>
  ({ id, title, status, created: '2026-10-01', extra: {}, ...extra })
const done = (ref: string, title: string, project: string) => ({ ref, title, project, extra: {} })
const day = (date: string, entries: ReturnType<typeof done>[]) => ({ date, planned: [], done: entries, focus: [], body: '', extra: {} })

function sample(): FlowData {
  const d = emptyFlow()
  d.projects.alpha = { slug: 'alpha', title: 'Alpha', status: 'active', color: '#111', created: '2026-10-01', body: '', extra: {},
    tasks: [t('t1', 'Write docs', 'todo'), t('t2', 'Fix bug', 'today'), t('t3', 'Shipped', 'done'),
      t('t4', 'Call Bob', 'todo', { scheduled: '2026-11-06' }), t('t5', 'Far away', 'todo', { scheduled: '2026-11-20' })] }
  d.projects.home = { slug: 'home', title: 'Home', status: 'active', color: '#222', created: '2026-10-01', body: '', extra: {},
    tasks: [t('t1', 'Water plants', 'todo')] }
  d.projects.old = { slug: 'old', title: 'Old stuff', status: 'paused', color: '#333', created: '2026-10-01', body: '', extra: {},
    tasks: [t('t1', 'Paused task', 'todo')] }
  d.days['2026-11-01'] = day('2026-11-01', [done('alpha/t0', 'Too old', 'alpha')])
  d.days['2026-11-03'] = day('2026-11-03', [done('alpha/t3', 'Shipped', 'alpha')])
  d.reviews['2026-W44'] = { week: '2026-W44', focusProject: 'home', intention: 'Keep the house calm', body: '', extra: {} }
  return d
}

describe('buildReviewPrompt', () => {
  it('is the §3.5 review prompt', () => {
    expect(buildReviewPrompt(sample(), TODAY)).toBe(modelReview(sample(), TODAY))
  })
})

describe('buildPlanPrompt', () => {
  const p = buildPlanPrompt(sample(), TODAY)

  it('starts with a warm, ADHD-aware instruction for tomorrow', () => {
    const head = p.split('\n')[0]
    expect(head).toMatch(/ADHD/)
    expect(head).toMatch(/2026-11-05/)
    expect(head).toMatch(/at most 3 tasks/i)
    expect(head).toMatch(/existing open tasks/i)
    expect(head).toMatch(/first step/i)
    expect(head).toMatch(/empty ref/i)
  })

  it('lists the last 3 days with done titles', () => {
    const section = p.slice(p.indexOf('## Last 3 days'), p.indexOf('## Open tasks'))
    expect(section).toContain('### 2026-11-02\nNothing done.')
    expect(section).toContain('### 2026-11-03\n- Shipped (Alpha)')
    expect(section).toContain('### 2026-11-04\nNothing done.')
    expect(section).not.toContain('Too old')
  })

  it('lists open tasks of active projects with refs and status', () => {
    const section = p.slice(p.indexOf('## Open tasks'), p.indexOf('## Scheduled'))
    expect(section).toContain('- [todo] alpha/t1 — Write docs (project: Alpha)')
    expect(section).toContain('- [today] alpha/t2 — Fix bug (project: Alpha)')
    expect(section).toContain('- [todo] home/t1 — Water plants (project: Home)')
    expect(section).not.toContain('Shipped')
    expect(section).not.toContain('Paused task')
  })

  it('lists tasks scheduled in the next 7 days', () => {
    const section = p.slice(p.indexOf('## Scheduled'), p.indexOf("## This week's focus"))
    expect(section).toContain('- 2026-11-06: alpha/t4 — Call Bob (project: Alpha)')
    expect(section).not.toContain('Far away')
  })

  it("names this week's focus project and intention, and the active projects", () => {
    expect(p).toContain("## This week's focus\n\nProject: Home\nIntention: Keep the house calm")
    expect(p).toContain('## Active projects\n\n- Alpha\n- Home')
    expect(p).not.toContain('- Old stuff')
  })

  it('says when nothing is planned or chosen', () => {
    const d = emptyFlow()
    const q = buildPlanPrompt(d, TODAY)
    expect(q).toContain('## Open tasks\n\nNone.')
    expect(q).toContain('## Scheduled in the next 7 days\n\nNone.')
    expect(q).toContain("## This week's focus\n\nNone chosen.")
    expect(q).toContain('## Active projects\n\nNone.')
  })
})
