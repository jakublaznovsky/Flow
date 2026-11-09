import { describe, expect, it } from 'vitest'
import { edgeStep } from './edgeScroll'

// Scroller 100..700 (x 0..1000); the sticky strip row ends at y = 250.
const box = { left: 0, right: 1000, top: 100, bottom: 700 }
const step = (x: number, y: number) => edgeStep(box, 250, x, y)

describe('edgeStep', () => {
  it('scrolls up only in the 32px band just below the sticky strips', () => {
    expect(step(500, 260)).toBeLessThan(0)
    expect(step(500, 290)).toBe(0)
    expect(step(500, 240)).toBe(0) // over the strips / headers
    expect(step(500, 110)).toBe(0)
  })

  it('scrolls down in the 32px band above the bottom', () => {
    expect(step(500, 690)).toBeGreaterThan(0)
    expect(step(500, 660)).toBe(0)
  })

  it('never scrolls with the pointer outside the scroller (e.g. in the drawer above it)', () => {
    expect(step(500, 90)).toBe(0)
    expect(step(500, 50)).toBe(0)
    expect(step(500, 710)).toBe(0)
    expect(step(-5, 690)).toBe(0)
    expect(step(1005, 260)).toBe(0)
  })
})
