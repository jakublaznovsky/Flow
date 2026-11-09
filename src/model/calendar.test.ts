import { describe, expect, it } from 'vitest'
import {
  addCalendarItem, dedupeCalendarIds, deleteCalendarItem, findCalendarItem, itemsOn, nextCalendarId, setTaskTime, splitByTime,
  updateCalendarItem,
} from './calendar'
import { taskCard } from './board'
import { emptyFlow, type CalendarItem, type FlowData, type Task } from './types'

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    Object.values(o as object).forEach(deepFreeze)
  }
  return o
}

const item = (id: string, title: string, date: string, time: string, extra = {}): CalendarItem => ({ id, title, date, time, extra })
const task = (id: string, title: string, extra: Partial<Task> = {}): Task =>
  ({ id, title, status: 'todo', created: '2026-11-01', extra: {}, ...extra })

// 2026-11-09 is Monday of 2026-W46; 2026-11-16 starts W47.
function sample(): FlowData {
  const d = emptyFlow()
  d.calendar['2026-W46'] = {
    week: '2026-W46', body: 'Week notes\n', extra: { mood: 'calm' },
    items: [item('c1', 'Swimming', '2026-11-12', '18:00-19:30', { place: 'pool' }), item('c3', 'Dentist', '2026-11-12', '09:00-09:30')],
  }
  d.calendar['2026-W47'] = { week: '2026-W47', body: '', extra: {}, items: [item('c2', 'Run', '2026-11-16', '07:00-08:00')] }
  d.projects.a = {
    slug: 'a', title: 'Alpha', status: 'active', color: '#111', created: '2026-11-01', body: '', extra: {},
    tasks: [
      task('t1', 'One', { scheduled: '2026-11-12', time: '10:00-11:00' }),
      task('t2', 'Two', { status: 'done', done: '2026-11-08' }),
      task('t3', 'Three', { status: 'today', planned: '2026-11-09' }),
    ],
  }
  return deepFreeze(d)
}

describe('nextCalendarId / findCalendarItem', () => {
  it('ids are unique across all weeks', () => {
    expect(nextCalendarId(sample())).toBe('c4')
    expect(nextCalendarId(emptyFlow())).toBe('c1')
  })
  it('finds an item and its week file', () => {
    expect(findCalendarItem(sample(), 'c2')).toMatchObject({ week: '2026-W47', item: { title: 'Run' } })
    expect(findCalendarItem(sample(), 'nope')).toBeUndefined()
  })
})

describe('addCalendarItem', () => {
  it('adds a trimmed item to its ISO week file with a fresh id', () => {
    const c = addCalendarItem(sample(), { title: '  Yoga ', date: '2026-11-14', time: '08:00-09:00' })
    expect(c.id).toBe('c4')
    expect(c.changed).toEqual(['calendar/2026-W46.md'])
    expect(c.data.calendar['2026-W46'].items.at(-1)).toEqual(item('c4', 'Yoga', '2026-11-14', '08:00-09:00'))
    expect(c.data.calendar['2026-W46'].body).toBe('Week notes\n')
  })
  it('creates the week file when there is none', () => {
    const c = addCalendarItem(emptyFlow(), { title: 'Cinema', date: '2026-12-31', time: '20:00-22:30' })
    expect(c.changed).toEqual(['calendar/2026-W53.md'])
    expect(c.data.calendar['2026-W53']).toEqual({ week: '2026-W53', body: '', extra: {}, items: [item('c1', 'Cinema', '2026-12-31', '20:00-22:30')] })
  })
  it.each([
    ['blank title', { title: '   ', date: '2026-11-14', time: '08:00-09:00' }],
    ['invalid time', { title: 'X', date: '2026-11-14', time: '08:10-09:00' }],
    ['invalid date', { title: 'X', date: '2026-02-30', time: '08:00-09:00' }],
  ])('%s → no change', (_, input) => {
    const d = sample()
    const c = addCalendarItem(d, input)
    expect(c).toEqual({ data: d, changed: [] })
  })
  it('a skipped week file → no change', () => {
    const d = { ...sample(), skipped: ['calendar/2026-W48.md'] }
    expect(addCalendarItem(d, { title: 'X', date: '2026-11-25', time: '08:00-09:00' }).changed).toEqual([])
  })
})

describe('updateCalendarItem', () => {
  it('renames (trimmed) and retimes in place, keeping extra fields', () => {
    const c = updateCalendarItem(sample(), 'c1', { title: ' Swim ', time: '18:30-20:00' })
    expect(c.changed).toEqual(['calendar/2026-W46.md'])
    expect(c.data.calendar['2026-W46'].items[0]).toEqual(item('c1', 'Swim', '2026-11-12', '18:30-20:00', { place: 'pool' }))
  })
  it('moves to another day of the same week in the same file', () => {
    const c = updateCalendarItem(sample(), 'c1', { date: '2026-11-15' })
    expect(c.changed).toEqual(['calendar/2026-W46.md'])
    expect(c.data.calendar['2026-W46'].items[0].date).toBe('2026-11-15')
  })
  it('a day in another ISO week moves the item between files in one change', () => {
    const c = updateCalendarItem(sample(), 'c1', { date: '2026-11-17', time: '19:00-20:00' })
    expect(c.changed.sort()).toEqual(['calendar/2026-W46.md', 'calendar/2026-W47.md'])
    expect(c.data.calendar['2026-W46'].items.map((i) => i.id)).toEqual(['c3'])
    expect(c.data.calendar['2026-W47'].items).toEqual([
      item('c2', 'Run', '2026-11-16', '07:00-08:00'), item('c1', 'Swimming', '2026-11-17', '19:00-20:00', { place: 'pool' }),
    ])
  })
  it('moving into a week without a file creates it; the emptied file stays with no items', () => {
    const c = updateCalendarItem(sample(), 'c2', { date: '2026-11-25' })
    expect(c.changed.sort()).toEqual(['calendar/2026-W47.md', 'calendar/2026-W48.md'])
    expect(c.data.calendar['2026-W47'].items).toEqual([])
    expect(c.data.calendar['2026-W48'].items.map((i) => i.id)).toEqual(['c2'])
  })
  it.each([
    ['unknown id', 'zz', { title: 'X' }],
    ['blank title', 'c1', { title: '  ' }],
    ['invalid time', 'c1', { time: '18:00-18:00' }],
    ['invalid date', 'c1', { date: '12.11.2026' }],
    ['nothing different', 'c1', { title: 'Swimming', date: '2026-11-12', time: '18:00-19:30' }],
  ])('%s → no change', (_, id, patch) => {
    const d = sample()
    expect(updateCalendarItem(d, id, patch)).toEqual({ data: d, changed: [] })
  })
  it('no change when either file of a move was skipped', () => {
    const d1 = { ...sample(), skipped: ['calendar/2026-W47.md'] }
    expect(updateCalendarItem(d1, 'c1', { date: '2026-11-17' }).changed).toEqual([])
    const d2 = { ...sample(), skipped: ['calendar/2026-W46.md'] }
    expect(updateCalendarItem(d2, 'c1', { title: 'X' }).changed).toEqual([])
  })
})

describe('deleteCalendarItem', () => {
  it('removes the item; an emptied week file is kept with items: []', () => {
    const c = deleteCalendarItem(sample(), 'c2')
    expect(c.changed).toEqual(['calendar/2026-W47.md'])
    expect(c.data.calendar['2026-W47']).toEqual({ week: '2026-W47', body: '', extra: {}, items: [] })
  })
  it('unknown id or skipped file → no change', () => {
    const d = sample()
    expect(deleteCalendarItem(d, 'zz')).toEqual({ data: d, changed: [] })
    expect(deleteCalendarItem({ ...d, skipped: ['calendar/2026-W47.md'] }, 'c2').changed).toEqual([])
  })
})

describe('itemsOn', () => {
  it('lists the items of a date sorted by start time', () => {
    expect(itemsOn(sample(), '2026-11-12').map((i) => i.title)).toEqual(['Dentist', 'Swimming'])
    expect(itemsOn(sample(), '2026-11-13')).toEqual([])
  })
  it('also finds an item kept in another week file', () => {
    const d = structuredClone(sample())
    d.calendar['2026-W47'].items.push(item('c9', 'Odd', '2026-11-12', '12:00-13:00'))
    expect(itemsOn(d, '2026-11-12').map((i) => i.id)).toEqual(['c3', 'c9', 'c1'])
  })
})

describe('dedupeCalendarIds', () => {
  it('renames later duplicates across weeks in memory, preferring to rename the given weeks', () => {
    const d = structuredClone(sample())
    d.calendar['2026-W47'].items[0].id = 'c1'
    const a = dedupeCalendarIds(d)
    expect(a.calendar['2026-W46'].items[0].id).toBe('c1')
    expect(a.calendar['2026-W47'].items[0].id).toBe('c4')
    const b = dedupeCalendarIds(d, ['2026-W46'])
    expect(b.calendar['2026-W47'].items[0].id).toBe('c1')
    expect(b.calendar['2026-W46'].items[0].id).toBe('c4')
  })
  it('returns the same data when ids are unique', () => {
    const d = sample()
    expect(dedupeCalendarIds(d)).toBe(d)
  })
})

describe('setTaskTime', () => {
  it('sets and clears a task time', () => {
    const set = setTaskTime(sample(), 'a/t3', '09:00-10:30')
    expect(set.changed).toEqual(['projects/a.md'])
    expect(set.data.projects.a.tasks[2].time).toBe('09:00-10:30')
    const cleared = setTaskTime(sample(), 'a/t1', null)
    expect(cleared.changed).toEqual(['projects/a.md'])
    expect('time' in cleared.data.projects.a.tasks[0]).toBe(false)
  })
  it.each([
    ['unknown task', 'a/t9', '09:00-10:00'],
    ['done task', 'a/t2', '09:00-10:00'],
    ['invalid time', 'a/t3', '9-10'],
    ['same time', 'a/t1', '10:00-11:00'],
    ['clearing nothing', 'a/t3', null],
  ])('%s → no change', (_, ref, time) => {
    const d = sample()
    expect(setTaskTime(d, ref, time)).toEqual({ data: d, changed: [] })
  })
  it('skipped project file → no change', () => {
    expect(setTaskTime({ ...sample(), skipped: ['projects/a.md'] }, 'a/t3', '09:00-10:00').changed).toEqual([])
  })
})

describe('splitByTime', () => {
  it('splits cards into timed blocks (with minutes) and untimed ones', () => {
    const d = sample()
    const cards = d.projects.a.tasks.map((t) => taskCard(d.projects.a, t))
    const { timed, untimed } = splitByTime(cards)
    expect(timed.map((c) => [c.key, c.block])).toEqual([['a/t1', { start: 600, end: 660 }]])
    expect(untimed.map((c) => c.key)).toEqual(['a/t2', 'a/t3'])
  })
})
