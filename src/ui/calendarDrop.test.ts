import { describe, expect, it } from 'vitest'
import {
  blockLabel, clickBlock, createItem, dropItem, dropTask, moveBlock, nudgeBlock, placeTask, resizeBlock, spanBlock, stripDropBlock,
} from './calendarDrop'
import { emptyFlow, type CalendarItem, type FlowData, type Task } from '../model/types'

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    Object.values(o as object).forEach(deepFreeze)
  }
  return o
}

const T = '2026-11-11' // Wednesday of 2026-W46 (Mon 9 – Sun 15 Nov)
const task = (id: string, title: string, extra: Partial<Task> = {}): Task =>
  ({ id, title, status: 'todo', created: '2026-11-01', extra: {}, ...extra })
const item = (id: string, title: string, date: string, time: string): CalendarItem => ({ id, title, date, time, extra: {} })

function sample(): FlowData {
  const d = emptyFlow()
  d.projects.a = {
    slug: 'a', title: 'Alpha', status: 'active', color: '#111', created: '2026-11-01', body: '', extra: {},
    tasks: [
      task('t1', 'Timed', { scheduled: '2026-11-13', time: '10:00-11:00' }),
      task('t2', 'Untimed', { scheduled: '2026-11-13' }),
      task('t3', 'In today', { status: 'today', planned: T, time: '09:00-10:00' }),
      task('t4', 'Loose'),
      task('t5', 'Finished', { status: 'done', done: '2026-11-10' }),
    ],
  }
  d.days[T] = { date: T, planned: ['a/t3'], done: [], focus: [], body: '', extra: {} }
  d.days['2026-11-10'] = { date: '2026-11-10', planned: [], done: [{ ref: 'a/t5', title: 'Finished', project: 'Alpha', extra: {} }], focus: [], body: '', extra: {} }
  d.calendar['2026-W46'] = { week: '2026-W46', body: '', extra: {}, items: [item('c1', 'Swim', '2026-11-12', '18:00-19:30')] }
  return deepFreeze(d)
}
const t = (d: FlowData, id: string) => d.projects.a.tasks.find((x) => x.id === id)!
const skip = (d: FlowData, ...paths: string[]): FlowData => ({ ...d, skipped: [...d.skipped, ...paths] })

describe('block math', () => {
  it('a click gives a 1-hour block in the 15-minute slot clicked, shifted up near midnight', () => {
    expect(clickBlock(9 * 60 + 10)).toEqual({ start: 540, end: 600 })
    expect(clickBlock(23 * 60 + 40)).toEqual({ start: 1380, end: 1440 })
    expect(clickBlock(6 * 60)).toEqual({ start: 420, end: 480 })
  })

  it('a drag spans the slots it covers, in either direction, at least 15 minutes, inside the grid', () => {
    expect(spanBlock(9 * 60 + 5, 10 * 60 + 20)).toEqual({ start: 540, end: 630 })
    expect(spanBlock(10 * 60 + 20, 9 * 60 + 5)).toEqual({ start: 540, end: 630 })
    expect(spanBlock(600, 600)).toEqual({ start: 600, end: 615 })
    expect(spanBlock(1430, 1500)).toEqual({ start: 1425, end: 1440 })
    expect(spanBlock(300, 450)).toEqual({ start: 420, end: 450 })
  })

  it('a strip drop gives a 1-hour block from the 15-minute slot under the pointer, shifted up before 24:00', () => {
    expect(stripDropBlock(14 * 60 + 5)).toEqual({ start: 840, end: 900 })
    expect(stripDropBlock(14 * 60 + 14)).toEqual({ start: 840, end: 900 })
    expect(stripDropBlock(6 * 60)).toEqual({ start: 420, end: 480 })
    expect(stripDropBlock(23 * 60 + 30)).toEqual({ start: 1380, end: 1440 })
  })

  it('moving keeps the length, snaps and clamps to 07:00–24:00', () => {
    const b = { start: 600, end: 690 }
    expect(moveBlock(b, 13 * 60 + 7)).toEqual({ start: 780, end: 870 })
    expect(moveBlock(b, 23 * 60)).toEqual({ start: 1350, end: 1440 })
    expect(moveBlock(b, 5 * 60)).toEqual({ start: 420, end: 510 })
  })

  it('resizing moves one edge, snapped, keeping at least 15 minutes and inside the grid', () => {
    const b = { start: 600, end: 660 }
    expect(resizeBlock(b, 'bottom', 11 * 60 + 52)).toEqual({ start: 600, end: 705 })
    expect(resizeBlock(b, 'bottom', 590)).toEqual({ start: 600, end: 615 })
    expect(resizeBlock(b, 'bottom', 1500)).toEqual({ start: 600, end: 1440 })
    expect(resizeBlock(b, 'top', 9 * 60 + 24)).toEqual({ start: 570, end: 660 })
    expect(resizeBlock(b, 'top', 700)).toEqual({ start: 645, end: 660 })
    expect(resizeBlock(b, 'top', 100)).toEqual({ start: 420, end: 660 })
  })

  it('keyboard nudges: Alt+arrows move 15 minutes, with Shift the end changes', () => {
    const b = { start: 600, end: 660 }
    expect(nudgeBlock(b, 'up', false)).toEqual({ start: 585, end: 645 })
    expect(nudgeBlock(b, 'down', false)).toEqual({ start: 615, end: 675 })
    expect(nudgeBlock(b, 'up', true)).toEqual({ start: 600, end: 645 })
    expect(nudgeBlock(b, 'down', true)).toEqual({ start: 600, end: 675 })
    expect(nudgeBlock({ start: 420, end: 480 }, 'up', false)).toEqual({ start: 420, end: 480 })
    expect(nudgeBlock({ start: 1380, end: 1440 }, 'down', false)).toEqual({ start: 1380, end: 1440 })
    expect(nudgeBlock({ start: 600, end: 615 }, 'up', true)).toEqual({ start: 600, end: 615 })
    expect(nudgeBlock({ start: 600, end: 1440 }, 'down', true)).toEqual({ start: 600, end: 1440 })
  })

  it('labels a block with its title, weekday and time in words', () => {
    expect(blockLabel('Swim', '2026-11-12', { start: 1080, end: 1170 })).toBe('Swim, Thursday 18:00 to 19:30')
    expect(blockLabel('Late', '2026-11-15', { start: 1380, end: 1440 })).toBe('Late, Sunday 23:00 to 24:00')
  })
})

describe('dropTask', () => {
  it('grid of a future day: scheduled for it with the new time, in one Change', () => {
    const d = sample()
    const c = dropTask(d, 'a/t4', { kind: 'grid', date: '2026-11-14', block: { start: 600, end: 660 } }, T)
    expect(t(c.data, 't4')).toMatchObject({ status: 'todo', scheduled: '2026-11-14', time: '10:00-11:00' })
    expect(c.changed).toEqual(['projects/a.md'])
  })

  it('grid of the same day: only the time changes', () => {
    const c = dropTask(sample(), 'a/t1', { kind: 'grid', date: '2026-11-13', block: { start: 780, end: 840 } }, T)
    expect(t(c.data, 't1')).toMatchObject({ scheduled: '2026-11-13', time: '13:00-14:00' })
  })

  it('grid of another future day: day and time change together', () => {
    const c = dropTask(sample(), 'a/t1', { kind: 'grid', date: '2026-11-15', block: { start: 480, end: 540 } }, T)
    expect(t(c.data, 't1')).toMatchObject({ scheduled: '2026-11-15', time: '08:00-09:00' })
  })

  it("grid of today: moves to Today with the time", () => {
    const c = dropTask(sample(), 'a/t1', { kind: 'grid', date: T, block: { start: 900, end: 960 } }, T)
    expect(t(c.data, 't1')).toMatchObject({ status: 'today', time: '15:00-16:00' })
    expect(t(c.data, 't1').scheduled).toBeUndefined()
    expect(c.data.days[T].planned).toContain('a/t1')
  })

  it('grid of a past day: done that day, no time', () => {
    const c = dropTask(sample(), 'a/t1', { kind: 'grid', date: '2026-11-09', block: { start: 600, end: 660 } }, T)
    expect(t(c.data, 't1')).toMatchObject({ status: 'done', done: '2026-11-09' })
    expect(t(c.data, 't1').time).toBeUndefined()
    expect(c.data.days['2026-11-09'].done.map((e) => e.ref)).toEqual(['a/t1'])
  })

  it('a done task dropped on a future grid is reopened, scheduled and timed', () => {
    const c = dropTask(sample(), 'a/t5', { kind: 'grid', date: '2026-11-14', block: { start: 600, end: 660 } }, T)
    expect(t(c.data, 't5')).toMatchObject({ status: 'todo', scheduled: '2026-11-14', time: '10:00-11:00' })
    expect(c.data.days['2026-11-10'].done).toEqual([])
  })

  it("the strip removes the time (same day, another day, and today's strip)", () => {
    const same = dropTask(sample(), 'a/t1', { kind: 'strip', date: '2026-11-13' }, T)
    expect(t(same.data, 't1')).toMatchObject({ scheduled: '2026-11-13' })
    expect(t(same.data, 't1').time).toBeUndefined()
    const other = dropTask(sample(), 'a/t1', { kind: 'strip', date: '2026-11-14' }, T)
    expect(t(other.data, 't1')).toMatchObject({ scheduled: '2026-11-14' })
    expect(t(other.data, 't1').time).toBeUndefined()
    const today = dropTask(sample(), 'a/t3', { kind: 'strip', date: T }, T)
    expect(t(today.data, 't3')).toMatchObject({ status: 'today' })
    expect(t(today.data, 't3').time).toBeUndefined()
  })

  it("a timed To do task dropped on today's strip goes to Today without its time", () => {
    const c = dropTask(sample(), 'a/t1', { kind: 'strip', date: T }, T)
    expect(t(c.data, 't1')).toMatchObject({ status: 'today' })
    expect(t(c.data, 't1').time).toBeUndefined()
    expect(t(c.data, 't1').scheduled).toBeUndefined()
  })

  it('Unscheduled → strip sets the day only; Unscheduled → grid sets day and time', () => {
    const strip = dropTask(sample(), 'a/t4', { kind: 'strip', date: '2026-11-13' }, T)
    expect(t(strip.data, 't4')).toMatchObject({ scheduled: '2026-11-13' })
    expect(t(strip.data, 't4').time).toBeUndefined()
    const grid = dropTask(sample(), 'a/t4', { kind: 'grid', date: '2026-11-13', block: { start: 1380, end: 1440 } }, T)
    expect(t(grid.data, 't4')).toMatchObject({ scheduled: '2026-11-13', time: '23:00-24:00' })
  })

  it('Unscheduled target clears day and time', () => {
    const c = dropTask(sample(), 'a/t1', { kind: 'unscheduled' }, T)
    expect(t(c.data, 't1').scheduled).toBeUndefined()
    expect(t(c.data, 't1').time).toBeUndefined()
  })

  it('no change at all when a file it would write is skipped', () => {
    const d = skip(sample(), 'projects/a.md')
    expect(dropTask(d, 'a/t4', { kind: 'grid', date: '2026-11-14', block: { start: 600, end: 660 } }, T).changed).toEqual([])
    expect(dropTask(d, 'a/t1', { kind: 'strip', date: '2026-11-13' }, T).changed).toEqual([])
    const day = skip(sample(), `days/${T}.md`)
    const c = dropTask(day, 'a/t1', { kind: 'grid', date: T, block: { start: 600, end: 660 } }, T)
    expect(c.changed).toEqual([])
    expect(c.data).toBe(day)
  })

  it('an unknown task or a drop that changes nothing gives no change', () => {
    expect(dropTask(sample(), 'a/t9', { kind: 'strip', date: '2026-11-13' }, T).changed).toEqual([])
    expect(dropTask(sample(), 'a/t2', { kind: 'strip', date: '2026-11-13' }, T).changed).toEqual([])
    expect(dropTask(sample(), 'a/t1', { kind: 'grid', date: '2026-11-13', block: { start: 600, end: 660 } }, T).changed).toEqual([])
  })
})

describe('placeTask (a block moved or resized in the grid)', () => {
  it('same day, even a past one: only the time changes (never done)', () => {
    const d = deepFreeze({ ...sample(), projects: { a: { ...sample().projects.a, tasks: [task('t1', 'Old', { scheduled: '2026-11-09', time: '10:00-11:00' })] } } })
    const c = placeTask(d, 'a/t1', '2026-11-09', '2026-11-09', { start: 660, end: 720 }, T)
    expect(t(c.data, 't1')).toMatchObject({ status: 'todo', scheduled: '2026-11-09', time: '11:00-12:00' })
    expect(c.data.days['2026-11-09']).toBeUndefined()
    expect(c.changed).toEqual(['projects/a.md'])
  })

  it("same day for a Today task: only the time changes", () => {
    const c = placeTask(sample(), 'a/t3', T, T, { start: 600, end: 690 }, T)
    expect(t(c.data, 't3')).toMatchObject({ status: 'today', time: '10:00-11:30' })
    expect(c.changed).toEqual(['projects/a.md'])
  })

  it('another day: the Week drop rules (a past day = done that day)', () => {
    const c = placeTask(sample(), 'a/t1', '2026-11-13', '2026-11-10', { start: 600, end: 660 }, T)
    expect(t(c.data, 't1')).toMatchObject({ status: 'done', done: '2026-11-10' })
  })

  it('a skipped project file: no change', () => {
    const d = skip(sample(), 'projects/a.md')
    expect(placeTask(d, 'a/t1', '2026-11-13', '2026-11-13', { start: 600, end: 720 }, T).changed).toEqual([])
  })
})

describe('week-only items', () => {
  it('dropItem moves and retimes an item, across weeks too', () => {
    const c = dropItem(sample(), 'c1', '2026-11-13', { start: 600, end: 690 })
    expect(c.data.calendar['2026-W46'].items[0]).toMatchObject({ date: '2026-11-13', time: '10:00-11:30' })
    const w = dropItem(sample(), 'c1', '2026-11-16', { start: 600, end: 690 })
    expect(w.data.calendar['2026-W46'].items).toEqual([])
    expect(w.data.calendar['2026-W47'].items[0]).toMatchObject({ id: 'c1', date: '2026-11-16' })
    expect(w.changed.sort()).toEqual(['calendar/2026-W46.md', 'calendar/2026-W47.md'])
  })

  it('createItem adds a titled item; a blank title adds nothing', () => {
    const c = createItem(sample(), '  Dentist ', '2026-11-10', { start: 540, end: 600 })
    expect(c.data.calendar['2026-W46'].items.at(-1)).toMatchObject({ title: 'Dentist', date: '2026-11-10', time: '09:00-10:00' })
    expect(createItem(sample(), '   ', '2026-11-10', { start: 540, end: 600 }).changed).toEqual([])
  })
})
