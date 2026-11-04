import { describe, it, expect } from 'vitest'
import { emptyFlow } from './types'
import { appendNotes, setNotes } from './notes'

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

describe('appendNotes', () => {
  it('appends a heading and the text after existing notes', () => {
    const d = emptyFlow()
    d.notes.body = 'Old notes\n'
    const c = appendNotes(d, 'Claude review 2026-11-04', '## Went well\n\nLots.\n')
    expect(c.data.notes.body).toBe('Old notes\n\n## Claude review 2026-11-04\n\n## Went well\n\nLots.\n')
    expect(c.changed).toEqual(['notes.md'])
  })
  it('starts empty notes with the heading', () => {
    const c = appendNotes(emptyFlow(), 'Claude review 2026-11-04', 'Hi')
    expect(c.data.notes.body).toBe('## Claude review 2026-11-04\n\nHi\n')
  })
  it('does nothing when notes.md could not be read, or the text is empty', () => {
    const d = emptyFlow()
    d.skipped = ['notes.md']
    expect(appendNotes(d, 'H', 'Hi').changed).toEqual([])
    expect(appendNotes(emptyFlow(), 'H', '  ').changed).toEqual([])
  })
})
