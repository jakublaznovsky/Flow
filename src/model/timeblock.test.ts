import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BLOCK, GRID_END, GRID_START, SNAP, clampBlock, formatTime, isTime, layoutLanes, minutesToY, parseTime, placeAt,
  snap, yToMinutes,
} from './timeblock'

describe('constants', () => {
  it('grid is 07:00-24:00 with 15-minute snapping and 1-hour default blocks', () => {
    expect([GRID_START, GRID_END, SNAP, DEFAULT_BLOCK]).toEqual([420, 1440, 15, 60])
  })
})

describe('parseTime / formatTime', () => {
  it('parses HH:MM-HH:MM into minutes', () => {
    expect(parseTime('09:00-10:30')).toEqual({ start: 540, end: 630 })
    expect(parseTime('07:00-24:00')).toEqual({ start: 420, end: 1440 })
    expect(parseTime('23:45-24:00')).toEqual({ start: 1425, end: 1440 })
  })
  it.each([
    '', '9:00-10:00', '09:00 - 10:00', '09:00-10:00 ', '09:00', '09:00-10:00-11:00', '09:10-10:00', '09:00-10:05',
    '06:45-08:00', '23:00-24:15', '24:00-24:00', '10:00-10:00', '11:00-10:00', '09:60-10:00', '25:00-26:00', 'ab:cd-ef:gh',
  ])('rejects %j', (s) => {
    expect(() => parseTime(s)).toThrow()
    expect(isTime(s)).toBe(false)
  })
  it('isTime accepts valid strings only', () => {
    expect(isTime('18:00-19:30')).toBe(true)
    expect(isTime(1080)).toBe(false)
    expect(isTime(undefined)).toBe(false)
  })
  it('formats with leading zeros and 24:00 as an end', () => {
    expect(formatTime({ start: 420, end: 435 })).toBe('07:00-07:15')
    expect(formatTime({ start: 1380, end: 1440 })).toBe('23:00-24:00')
    expect(formatTime(parseTime('18:00-19:30'))).toBe('18:00-19:30')
  })
})

describe('snap', () => {
  it('rounds to the nearest 15 minutes', () => {
    expect(snap(540)).toBe(540)
    expect(snap(547)).toBe(540)
    expect(snap(548)).toBe(555)
    expect(snap(552.5)).toBe(555)
  })
})

describe('clampBlock', () => {
  it('snaps and keeps a block inside the grid, keeping its length', () => {
    expect(clampBlock({ start: 541, end: 602 })).toEqual({ start: 540, end: 600 })
    expect(clampBlock({ start: 360, end: 480 })).toEqual({ start: 420, end: 540 })
    expect(clampBlock({ start: 1400, end: 1500 })).toEqual({ start: 1335, end: 1440 })
  })
  it('makes blocks at least 15 minutes and at most the whole grid', () => {
    expect(clampBlock({ start: 600, end: 600 })).toEqual({ start: 600, end: 615 })
    expect(clampBlock({ start: 600, end: 590 })).toEqual({ start: 600, end: 615 })
    expect(clampBlock({ start: 1440, end: 1440 })).toEqual({ start: 1425, end: 1440 })
    expect(clampBlock({ start: 0, end: 2000 })).toEqual({ start: 420, end: 1440 })
  })
})

describe('placeAt', () => {
  it('gives a snapped 1-hour block at the position', () => {
    expect(placeAt(547)).toEqual({ start: 540, end: 600 })
    expect(placeAt(600, 90)).toEqual({ start: 600, end: 690 })
  })
  it('shifts up to end by 24:00 and down to start at 07:00', () => {
    expect(placeAt(1410)).toEqual({ start: 1380, end: 1440 })
    expect(placeAt(300)).toEqual({ start: 420, end: 480 })
  })
})

describe('minutesToY / yToMinutes', () => {
  it('maps minutes from 07:00 to pixels and back', () => {
    expect(minutesToY(420, 48)).toBe(0)
    expect(minutesToY(570, 48)).toBe(120)
    expect(yToMinutes(120, 48)).toBe(570)
    expect(yToMinutes(0, 48)).toBe(420)
  })
})

describe('layoutLanes', () => {
  const lay = (blocks: { id: string; start: number; end: number }[]) => Object.fromEntries(layoutLanes(blocks))
  it('gives a lone block one lane', () => {
    expect(lay([{ id: 'a', start: 540, end: 600 }])).toEqual({ a: { lane: 0, lanes: 1 } })
  })
  it('touching blocks do not overlap', () => {
    expect(lay([{ id: 'a', start: 540, end: 600 }, { id: 'b', start: 600, end: 660 }]))
      .toEqual({ a: { lane: 0, lanes: 1 }, b: { lane: 0, lanes: 1 } })
  })
  it('overlapping blocks share their cluster in equal lanes; separate clusters are independent', () => {
    expect(lay([
      { id: 'c', start: 570, end: 630 },
      { id: 'a', start: 540, end: 660 },
      { id: 'b', start: 630, end: 690 }, // overlaps a; takes c's lane once c has ended
      { id: 'd', start: 800, end: 860 },
    ])).toEqual({
      a: { lane: 0, lanes: 2 }, c: { lane: 1, lanes: 2 }, b: { lane: 1, lanes: 2 }, d: { lane: 0, lanes: 1 },
    })
  })
  it('three-way overlap uses three lanes', () => {
    expect(lay([
      { id: 'a', start: 540, end: 600 }, { id: 'b', start: 540, end: 600 }, { id: 'c', start: 555, end: 570 },
    ])).toEqual({ a: { lane: 0, lanes: 3 }, b: { lane: 1, lanes: 3 }, c: { lane: 2, lanes: 3 } })
  })
  it('a chain of overlaps forms one cluster', () => {
    const r = lay([{ id: 'a', start: 540, end: 600 }, { id: 'b', start: 590, end: 650 }, { id: 'c', start: 640, end: 700 }])
    expect(r).toEqual({ a: { lane: 0, lanes: 2 }, b: { lane: 1, lanes: 2 }, c: { lane: 0, lanes: 2 } })
  })
})
