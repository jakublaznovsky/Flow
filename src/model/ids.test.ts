import { describe, it, expect } from 'vitest'
import { slugify, uniqueSlug, nextTaskId, nextInboxId, PROJECT_COLORS, pickColor } from './ids'

describe('slugify', () => {
  it('lowercases and hyphenates words', () => {
    expect(slugify('Flow app')).toBe('flow-app')
  })

  it('strips diacritics', () => {
    expect(slugify('Učit se španělsky')).toBe('ucit-se-spanelsky')
  })

  it('collapses separators and trims hyphens', () => {
    expect(slugify('  A -- B!! ')).toBe('a-b')
  })

  it('falls back to "project" when nothing remains', () => {
    expect(slugify('🚀')).toBe('project')
  })
})

describe('uniqueSlug', () => {
  it('appends -2 when the base is taken', () => {
    expect(uniqueSlug('Work', ['work'])).toBe('work-2')
  })

  it('increments past taken suffixes', () => {
    expect(uniqueSlug('Work', ['work', 'work-2'])).toBe('work-3')
  })
})

describe('nextTaskId', () => {
  it('starts at t1', () => {
    expect(nextTaskId([])).toBe('t1')
  })

  it('uses max numeric suffix + 1, ignoring non-numeric ids', () => {
    expect(nextTaskId([{ id: 't1' }, { id: 't7' }, { id: 'x' }])).toBe('t8')
  })
})

describe('nextInboxId', () => {
  it('uses max numeric suffix + 1', () => {
    expect(nextInboxId([{ id: 'i2' }])).toBe('i3')
  })
})

describe('project colors', () => {
  it('has 8 hex colors', () => {
    expect(PROJECT_COLORS).toHaveLength(8)
    for (const c of PROJECT_COLORS) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('picks colors cyclically', () => {
    expect(pickColor(0)).toBe(PROJECT_COLORS[0])
    expect(pickColor(8)).toBe(PROJECT_COLORS[0])
    expect(pickColor(9)).toBe(PROJECT_COLORS[1])
  })
})
