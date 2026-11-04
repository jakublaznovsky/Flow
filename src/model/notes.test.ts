import { describe, it, expect } from 'vitest'
import { emptyFlow } from './types'
import { setNotes } from './notes'

describe('setNotes', () => {
  it('stores the body and reports notes.md as changed', () => {
    const c = setNotes(emptyFlow(), 'Hello')
    expect(c.data.notes.body).toBe('Hello')
    expect(c.changed).toEqual(['notes.md'])
  })
  it('keeps extra frontmatter', () => {
    const d = emptyFlow()
    d.notes.extra = { tags: ['a'] }
    expect(setNotes(d, 'x').data.notes.extra).toEqual({ tags: ['a'] })
  })
  it('does nothing when the text is unchanged', () => {
    const d = emptyFlow()
    const c = setNotes(d, '')
    expect(c.changed).toEqual([])
    expect(c.data).toBe(d)
  })
})
