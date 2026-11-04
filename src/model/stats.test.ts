import { describe, it, expect } from 'vitest'
import { emptyFlow } from './types'
import type { FlowData, Day, DoneEntry, FocusEntry, Task } from './types'
import { addDays } from './dates'
import { weekDates, doneOn, focusMinutesOn, streak, heatmap, projectProgress } from './stats'

const done = (ref: string): DoneEntry => ({ ref, title: ref, project: ref.split('/')[0], extra: {} })
const focus = (ref: string, minutes: number): FocusEntry => ({ ref, title: ref, project: ref.split('/')[0], minutes, extra: {} })
function day(date: string, doneN = 0, focusMins: number[] = [], prefix = 'p'): Day {
  return {
    date, planned: [], body: '', extra: {},
    done: Array.from({ length: doneN }, (_, i) => done(`${prefix}/t${i}`)),
    focus: focusMins.map((m, i) => focus(`${prefix}/t${i}`, m)),
  }
}
function withDays(...days: Day[]): FlowData {
  const d = emptyFlow()
  for (const x of days) d.days[x.date] = x
  return d
}
const TODAY = '2026-11-04' // Wednesday

describe('weekDates', () => {
  it('returns Mon..Sun of the week containing today', () => {
    expect(weekDates(TODAY)).toEqual([
      '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08',
    ])
  })
})

describe('doneOn / focusMinutesOn', () => {
  it('returns done entries, [] for a missing day', () => {
    const d = withDays(day(TODAY, 2))
    expect(doneOn(d, TODAY)).toHaveLength(2)
    expect(doneOn(d, '2026-11-01')).toEqual([])
  })
  it('sums focus minutes, 0 for a missing day', () => {
    const d = withDays(day(TODAY, 0, [25, 15]))
    expect(focusMinutesOn(d, TODAY)).toBe(40)
    expect(focusMinutesOn(d, '2026-11-01')).toBe(0)
  })
})

describe('streak', () => {
  it('counts back from today when today has done', () => {
    const d = withDays(day('2026-11-04', 1), day('2026-11-03', 2), day('2026-11-02', 1))
    expect(streak(d, TODAY)).toBe(3)
  })
  it('counts from yesterday when nothing today', () => {
    const d = withDays(day('2026-11-03', 1), day('2026-11-02', 1))
    expect(streak(d, TODAY)).toBe(2)
  })
  it('stops at the first gap', () => {
    const d = withDays(day('2026-11-04', 1), day('2026-11-03', 1), day('2026-11-01', 5))
    expect(streak(d, TODAY)).toBe(2)
  })
  it('is 1 with only today', () => {
    expect(streak(withDays(day(TODAY, 1)), TODAY)).toBe(1)
  })
  it('is 0 with nothing today or yesterday', () => {
    expect(streak(withDays(day('2026-11-01', 3)), TODAY)).toBe(0)
    expect(streak(emptyFlow(), TODAY)).toBe(0)
  })
  it('ignores day files with an empty done list', () => {
    expect(streak(withDays(day(TODAY, 0), day('2026-11-03', 2)), TODAY)).toBe(1)
  })
})

describe('heatmap', () => {
  it('is 53 columns of 7 rows, Monday first, last column is current week', () => {
    const h = heatmap(emptyFlow(), TODAY)
    expect(h).toHaveLength(53)
    for (const col of h) expect(col).toHaveLength(7)
    expect(h[52].map((c) => c.date)).toEqual(weekDates(TODAY))
    expect(h[0][0].date).toBe('2025-11-03') // Monday 52 weeks before 2026-11-02
  })
  it('flags dates after today as future with count 0, level 0', () => {
    const h = heatmap(withDays(day('2026-11-06', 9)), TODAY)
    const last = h[52]
    expect(last.map((c) => c.future)).toEqual([false, false, false, true, true, true, true])
    expect(last[4]).toMatchObject({ count: 0, level: 0, future: true })
    expect(last[2].future).toBe(false)
  })
  it('buckets levels 0 / 1 / 2-3 / 4-5 / 6+', () => {
    const counts = [0, 1, 2, 3, 4, 5, 6]
    const base = '2026-10-26' // Monday of previous week, all past
    const days = counts.map((n, i) => day(addDays('2026-10-26', i), n))
    const h = heatmap(withDays(...days), TODAY)
    expect(h[51].map((c) => c.level)).toEqual([0, 1, 2, 2, 3, 3, 4])
    expect(h[51].map((c) => c.count)).toEqual(counts)
    expect(h[51][0].date).toBe(base)
    const big = heatmap(withDays(day('2026-10-26', 20)), TODAY)
    expect(big[51][0].level).toBe(4)
  })
  it('honours a custom number of weeks', () => {
    expect(heatmap(emptyFlow(), TODAY, 4)).toHaveLength(4)
  })
})

describe('projectProgress', () => {
  function proj(): FlowData {
    const d = emptyFlow()
    const t = (id: string, status: Task['status']): Task => ({ id, title: id, status, created: '2026-10-01', extra: {} })
    d.projects.p = {
      slug: 'p', title: 'P', status: 'active', color: '#000', created: '2026-10-01', body: '', extra: {},
      tasks: [t('a', 'done'), t('b', 'done'), t('c', 'todo'), t('d', 'today')],
    }
    return d
  }
  it('counts total, done and done in the last 7 days for the project only', () => {
    const d = proj()
    d.days[TODAY] = day(TODAY, 2, [], 'p')
    d.days['2026-10-29'] = day('2026-10-29', 1, [], 'p')   // today-6: included
    d.days['2026-10-28'] = day('2026-10-28', 4, [], 'p')   // today-7: excluded
    d.days['2026-11-03'] = day('2026-11-03', 3, [], 'other')
    expect(projectProgress(d, 'p', TODAY)).toEqual({ done: 2, total: 4, doneLast7: 3 })
  })
  it('returns zeros for an unknown project', () => {
    expect(projectProgress(emptyFlow(), 'nope', TODAY)).toEqual({ done: 0, total: 0, doneLast7: 0 })
  })
})
