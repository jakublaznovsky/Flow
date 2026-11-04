import { describe, expect, it } from 'vitest'
import { emptyFlow, type FlowData } from './types'
import { setDayNote } from './notes-day'

const withDay = (body: string): FlowData => ({
  ...emptyFlow(),
  days: { '2026-11-04': { date: '2026-11-04', planned: ['a/t1'], done: [], focus: [], body, extra: { mood: 'ok' } } },
})

describe('setDayNote', () => {
  it('creates the day file for a non-empty note', () => {
    const c = setDayNote(emptyFlow(), '2026-11-04', 'Good day')
    expect(c.changed).toEqual(['days/2026-11-04.md'])
    expect(c.data.days['2026-11-04'].body).toBe('Good day')
  })
  it('does nothing for an empty note when there is no day file', () => {
    expect(setDayNote(emptyFlow(), '2026-11-04', '').changed).toEqual([])
    expect(setDayNote(emptyFlow(), '2026-11-04', '').data.days).toEqual({})
  })
  it('does nothing when unchanged', () => {
    expect(setDayNote(withDay('same'), '2026-11-04', 'same').changed).toEqual([])
  })
  it('updates an existing day, keeping its other fields', () => {
    const c = setDayNote(withDay('old'), '2026-11-04', 'new')
    expect(c.changed).toEqual(['days/2026-11-04.md'])
    expect(c.data.days['2026-11-04']).toMatchObject({ body: 'new', planned: ['a/t1'], extra: { mood: 'ok' } })
  })
  it('clears the note on an existing day', () => {
    const c = setDayNote(withDay('old'), '2026-11-04', '')
    expect(c.changed).toEqual(['days/2026-11-04.md'])
    expect(c.data.days['2026-11-04'].body).toBe('')
  })
})
