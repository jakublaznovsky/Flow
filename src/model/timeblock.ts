/** A time span on one day, in minutes from 00:00 (end exclusive). Stored in files as "HH:MM-HH:MM". */
export interface TimeBlock { start: number; end: number }

/** The Week grid runs 07:00-24:00; everything snaps to 15 minutes; new blocks are 1 hour. */
export const GRID_START = 7 * 60
export const GRID_END = 24 * 60
export const SNAP = 15
export const DEFAULT_BLOCK = 60

const TIME_RE = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/

/**
 * Strict parse of "HH:MM-HH:MM": 15-minute multiples, 07:00 <= start < end <= 24:00.
 * Throws on anything else (a file with such a value fails to parse).
 */
export function parseTime(s: string): TimeBlock {
  const m = TIME_RE.exec(s)
  if (!m) throw new Error(`time must look like 09:00-10:30, got ${JSON.stringify(s)}`)
  const [h1, m1, h2, m2] = m.slice(1).map(Number)
  if (m1 > 59 || m2 > 59) throw new Error(`time ${s} has invalid minutes`)
  const block = { start: h1 * 60 + m1, end: h2 * 60 + m2 }
  if (block.start % SNAP !== 0 || block.end % SNAP !== 0) throw new Error(`time ${s} must use 15-minute steps`)
  if (block.start < GRID_START || block.end > GRID_END) throw new Error(`time ${s} must be between 07:00 and 24:00`)
  if (block.start >= block.end) throw new Error(`time ${s} must end after it starts`)
  return block
}

/** True when `v` is a string parseTime accepts. */
export function isTime(v: unknown): v is string {
  if (typeof v !== 'string') return false
  try {
    parseTime(v)
    return true
  } catch {
    return false
  }
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** "HH:MM-HH:MM" (an end of 24:00 is written as 24:00). */
export function formatTime(b: TimeBlock): string {
  return `${hhmm(b.start)}-${hhmm(b.end)}`
}

/** Nearest 15-minute mark. */
export function snap(min: number): number {
  return Math.round(min / SNAP) * SNAP
}

/** Snapped block inside the grid: at least 15 minutes, keeping its length where it fits (shifted, not cut). */
export function clampBlock(b: TimeBlock): TimeBlock {
  const length = Math.min(GRID_END - GRID_START, Math.max(SNAP, snap(b.end) - snap(b.start)))
  const start = Math.min(GRID_END - length, Math.max(GRID_START, snap(b.start)))
  return { start, end: start + length }
}

/** A new block of `length` minutes starting at the (snapped) position, shifted to fit 07:00-24:00. */
export function placeAt(startMin: number, length: number = DEFAULT_BLOCK): TimeBlock {
  const start = snap(startMin)
  return clampBlock({ start, end: start + length })
}

/** Pixel offset from the top of the grid (07:00) for a time, given the height of one hour. */
export function minutesToY(min: number, pxPerHour: number): number {
  return ((min - GRID_START) / 60) * pxPerHour
}

/** Minutes from 00:00 for a pixel offset from the top of the grid (not snapped). */
export function yToMinutes(y: number, pxPerHour: number): number {
  return GRID_START + (y / pxPerHour) * 60
}

/**
 * Side-by-side layout for one day's blocks: blocks that overlap (directly or through a chain) form a
 * cluster; each block gets the first free lane, and every block of a cluster shares its lane count
 * (equal widths). Touching blocks (one ends when the next starts) do not overlap.
 */
export function layoutLanes<K>(blocks: { id: K; start: number; end: number }[]): Map<K, { lane: number; lanes: number }> {
  const out = new Map<K, { lane: number; lanes: number }>()
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end)
  let cluster: { id: K; lane: number }[] = []
  let laneEnds: number[] = []
  let clusterEnd = -Infinity
  const flush = () => {
    for (const c of cluster) out.set(c.id, { lane: c.lane, lanes: laneEnds.length })
    cluster = []
    laneEnds = []
  }
  for (const b of sorted) {
    if (b.start >= clusterEnd) {
      flush()
      clusterEnd = b.end
    } else {
      clusterEnd = Math.max(clusterEnd, b.end)
    }
    let lane = laneEnds.findIndex((end) => end <= b.start)
    if (lane === -1) lane = laneEnds.push(b.end) - 1
    else laneEnds[lane] = b.end
    cluster.push({ id: b.id, lane })
  }
  flush()
  return out
}
