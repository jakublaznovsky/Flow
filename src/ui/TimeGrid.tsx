import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { deleteCalendarItem, updateCalendarItem } from '../model/calendar'
import { GRID_END, GRID_START, layoutLanes, minutesToY, yToMinutes, type TimeBlock } from '../model/timeblock'
import type { Change, FlowData, ISODate } from '../model/types'
import { useEdgeScroll } from './edgeScroll'
import CalendarBlock, { blockStyle, GhostBlock, HOUR_PX, TitleInput, type BlockData, type Edge } from './CalendarBlock'
import {
  clickBlock, createItem, dropItem, dropTask, moveBlock, nudgeBlock, placeTask, resizeBlock, spanBlock, type WeekTarget,
} from './calendarDrop'

type Apply = (fn: (d: FlowData) => Change) => void

/** Where a drag would land right now (also drives the drop highlights and the grid ghost). */
export type Over = WeekTarget | null

const HOURS = Array.from({ length: (GRID_END - GRID_START) / 60 + 1 }, (_, i) => GRID_START / 60 + i)

/** The hour numbers (7 … 24) left of the days, each on its hour line. */
export function TimeAxis() {
  return (
    <div className="cal-axis" aria-hidden="true">
      {HOURS.map((h) => <span key={h} className="cal-hour" style={{ top: `${minutesToY(h * 60, HOUR_PX)}px` }}>{h}</span>)}
    </div>
  )
}

const gridEl = (date: ISODate) => document.querySelector<HTMLElement>(`[data-grid-date="${date}"]`)

/** Minutes from 00:00 at a viewport y on a day's grid (not snapped). */
export function minutesAt(date: ISODate, clientY: number): number {
  const top = gridEl(date)?.getBoundingClientRect().top ?? 0
  return yToMinutes(clientY - top, HOUR_PX)
}

/**
 * What is under the pointer: a day's grid, a day's strip (header + untimed list) or the Unscheduled
 * drawer. Without hit testing (jsdom) the gesture stays on `fallback`'s grid.
 */
export type Hit = { kind: 'grid'; date: ISODate } | { kind: 'strip'; date: ISODate } | { kind: 'unscheduled' }

export function hitAt(x: number, y: number, fallback?: ISODate): Hit | null {
  if (typeof document.elementsFromPoint !== 'function') return fallback ? { kind: 'grid', date: fallback } : null
  for (const el of document.elementsFromPoint(x, y)) {
    const t = el.closest<HTMLElement>('[data-grid-date], [data-strip-date], [data-drop="unscheduled"]')
    if (!t) continue
    if (t.dataset.gridDate) return { kind: 'grid', date: t.dataset.gridDate }
    if (t.dataset.stripDate) return { kind: 'strip', date: t.dataset.stripDate }
    return { kind: 'unscheduled' }
  }
  return null
}

type Gesture =
  | { kind: 'move'; src: BlockData; grab: number; x0: number; y0: number; active: boolean; to: Over }
  | { kind: 'resize'; src: BlockData; edge: Edge; grab: number; block: TimeBlock }
  | { kind: 'create'; date: ISODate; anchor: number; x0: number; y0: number; active: boolean; block: TimeBlock }

const MOVE_THRESHOLD = 4

/**
 * Pointer gestures in the grid (plain pointer events, not dnd-kit): move a block across times and
 * days (or onto a strip / the drawer), resize from its edges, click or drag on empty grid to start a
 * new item; plus the keyboard and the inline title inputs. Each gesture makes one apply on release.
 */
export function useGridGestures({ apply, today, scroller }: { apply: Apply; today: ISODate; scroller: RefObject<HTMLElement | null> }) {
  const [gesture, setGestureState] = useState<Gesture | null>(null)
  const gRef = useRef<Gesture | null>(null)
  const [draft, setDraft] = useState<{ date: ISODate; block: TimeBlock } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const busy = useRef(false)
  busy.current = draft !== null || editing !== null
  const refocus = useRef<string | null>(null)
  const cleanup = useRef<(() => void) | null>(null)

  const setGesture = (g: Gesture | null) => {
    gRef.current = g
    setGestureState(g)
    // One cursor for the whole gesture, wherever the pointer is (board.css `html[data-cal-gesture]`).
    const mode = g?.kind === 'resize' ? 'resize' : g?.kind === 'move' && g.active ? 'move' : undefined
    const root = document.documentElement
    if (mode) root.dataset.calGesture = mode
    else delete root.dataset.calGesture
  }

  // Keyboard moves and closed title inputs give focus back to the block (it may have re-rendered).
  useLayoutEffect(() => {
    if (!refocus.current) return
    const el = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(refocus.current)}"] .cal-block-body`)
    if (el) { el.focus(); refocus.current = null }
  })
  useEffect(() => () => cleanup.current?.(), [])

  /** A block's new time on a day: a task only retimed on its own day (else the Week drop rules), items moved/retimed. */
  const place = useCallback((src: BlockData, date: ISODate, block: TimeBlock) => {
    if (src.kind === 'task') apply((d) => placeTask(d, src.id, src.date, date, block, today))
    else apply((d) => dropItem(d, src.id, date, block))
  }, [apply, today])

  // Edge auto-scroll (also while the pointer is held still in a band); each scroll re-tracks the
  // last pointer position, so the gesture follows the grid under it.
  const last = useRef<{ clientX: number; clientY: number } | null>(null)
  const edgeScroll = useEdgeScroll(scroller, () => { if (last.current) track(last.current) })

  const track = (e: { clientX: number; clientY: number }) => {
    last.current = { clientX: e.clientX, clientY: e.clientY }
    const g = gRef.current
    if (!g) return
    if (g.kind === 'move') {
      const active = g.active || Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) > MOVE_THRESHOLD
      if (!active) return
      const hit = hitAt(e.clientX, e.clientY, g.src.date)
      let to: Over = null
      if (hit?.kind === 'grid') to = { kind: 'grid', date: hit.date, block: moveBlock(g.src.block, minutesAt(hit.date, e.clientY) - g.grab) }
      else if (hit && g.src.kind === 'task') to = hit as Exclude<Hit, { kind: 'grid' }>
      setGesture({ ...g, active, to })
    } else if (g.kind === 'resize') {
      setGesture({ ...g, block: resizeBlock(g.src.block, g.edge, minutesAt(g.src.date, e.clientY) - g.grab) })
    } else {
      const active = g.active || Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) > MOVE_THRESHOLD
      setGesture({ ...g, active, block: active ? spanBlock(g.anchor, minutesAt(g.date, e.clientY)) : clickBlock(g.anchor) })
    }
    edgeScroll.update(e.clientX, e.clientY)
  }

  const finish = (commit: boolean) => {
    cleanup.current?.()
    const g = gRef.current
    setGesture(null)
    if (!g || !commit) return
    if (g.kind === 'move') {
      if (!g.active || !g.to) return
      const to = g.to
      if (to.kind === 'grid') place(g.src, to.date, to.block)
      else if (g.src.kind === 'task') apply((d) => dropTask(d, g.src.id, to, today))
    } else if (g.kind === 'resize') {
      place(g.src, g.src.date, g.block)
    } else {
      setDraft({ date: g.date, block: g.block })
    }
  }

  const begin = (g: Gesture) => {
    setGesture(g)
    const move = (e: globalThis.PointerEvent) => track(e)
    const up = (e: globalThis.PointerEvent) => { track(e); finish(true) }
    const cancel = () => finish(false)
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false) } }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
    cleanup.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      edgeScroll.stop()
      delete document.documentElement.dataset.calGesture
      last.current = null
      cleanup.current = null
    }
  }

  const onBlockPointerDown = (e: PointerEvent<HTMLElement>, data: BlockData, edge?: Edge) => {
    if (e.button !== 0 || gRef.current) return
    e.stopPropagation()
    const at = minutesAt(data.date, e.clientY)
    if (edge) {
      e.preventDefault()
      begin({ kind: 'resize', src: data, edge, grab: at - (edge === 'top' ? data.block.start : data.block.end), block: data.block })
    } else {
      begin({ kind: 'move', src: data, grab: at - data.block.start, x0: e.clientX, y0: e.clientY, active: false, to: null })
    }
  }

  const onGridPointerDown = (e: PointerEvent<HTMLElement>, date: ISODate) => {
    // While a title input is open, a click elsewhere only closes it (its blur saves).
    if (e.button !== 0 || gRef.current || busy.current) return
    e.preventDefault()
    const anchor = minutesAt(date, e.clientY)
    begin({ kind: 'create', date, anchor, x0: e.clientX, y0: e.clientY, active: false, block: clickBlock(anchor) })
  }

  const onBlockKeyDown = (e: KeyboardEvent<HTMLElement>, data: BlockData) => {
    const item = data.kind === 'item'
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      e.stopPropagation()
      refocus.current = data.id
      place(data, data.date, nudgeBlock(data.block, e.key === 'ArrowUp' ? 'up' : 'down', e.shiftKey))
    } else if (item && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault()
      e.stopPropagation()
      apply((d) => deleteCalendarItem(d, data.id))
    } else if (item && (e.key === 'Enter' || e.key === 'F2')) {
      e.preventDefault()
      e.stopPropagation()
      setEditing(data.id)
    }
  }

  const onRenamed = (data: BlockData, title: string | null, byKey: boolean) => {
    setEditing(null)
    if (byKey) refocus.current = data.id
    if (title !== null) apply((d) => updateCalendarItem(d, data.id, { title }))
  }

  const onDraftDone = (title: string | null) => {
    const d0 = draft
    setDraft(null)
    if (d0 && title !== null) apply((d) => createItem(d, title, d0.date, d0.block))
  }

  return {
    gesture, draft, editing,
    /** The block being moved (shown faded in place) and where it would land. */
    moving: gesture?.kind === 'move' && gesture.active ? gesture : null,
    onBlockPointerDown, onGridPointerDown, onBlockKeyDown, onRenamed, onDraftDone,
    onRename: (data: BlockData) => setEditing(data.id),
    onDelete: (data: BlockData) => apply((d) => deleteCalendarItem(d, data.id)),
  }
}

export type Gestures = ReturnType<typeof useGridGestures>

interface DayGridProps {
  date: ISODate
  blocks: BlockData[]
  g: Gestures
  /** A task dragged in from a strip or the drawer (dnd-kit), where it would land on this day. */
  incoming?: { title: string; color?: string; block: TimeBlock } | null
}

/**
 * One day's 07:00–24:00 grid: hour lines, its blocks (overlaps side by side), the ghost of a block
 * being dragged here, and the new-item input. Empty grid starts a new week-only item.
 */
export function DayGrid({ date, blocks, g, incoming }: DayGridProps) {
  const resize = g.gesture?.kind === 'resize' ? g.gesture : null
  const shown = blocks.map((b) => (resize && resize.src.id === b.id && resize.src.kind === b.kind ? { ...b, block: resize.block } : b))
  const lanes = layoutLanes(shown.map((b) => ({ id: `${b.kind}:${b.id}`, start: b.block.start, end: b.block.end })))
  const moving = g.moving
  const ghost = moving?.to?.kind === 'grid' && moving.to.date === date
    ? { title: moving.src.title, color: moving.src.color, item: moving.src.kind === 'item', block: moving.to.block }
    : incoming ? { ...incoming, item: false } : null
  const creating = g.gesture?.kind === 'create' && g.gesture.date === date && g.gesture.active ? g.gesture.block : null
  const draft = g.draft?.date === date ? g.draft.block : null
  return (
    <div
      className={`cal-day${ghost ? ' is-over' : ''}`} data-grid-date={date}
      style={{ height: `${minutesToY(GRID_END, HOUR_PX)}px` }}
      onPointerDown={(e) => g.onGridPointerDown(e, date)}
    >
      {shown.map((b) => {
        const lane = lanes.get(`${b.kind}:${b.id}`) ?? { lane: 0, lanes: 1 }
        return (
          <CalendarBlock
            key={`${b.kind}:${b.id}`} data={b} lane={lane.lane} lanes={lane.lanes}
            placeholder={moving?.src.id === b.id && moving.src.kind === b.kind}
            editing={b.kind === 'item' && g.editing === b.id}
            onPointerDown={g.onBlockPointerDown} onKeyDown={g.onBlockKeyDown}
            onRename={g.onRename} onRenamed={(data, t, byKey) => g.onRenamed(data, t, byKey)} onDelete={g.onDelete}
          />
        )
      })}
      {ghost && <GhostBlock {...ghost} />}
      {creating && <div className="cal-block is-item is-draft" style={blockStyle(creating)} aria-hidden="true" />}
      {draft && (
        <div className="cal-block is-item is-draft" style={blockStyle(draft)}>
          <TitleInput label="New item title" onDone={(t) => g.onDraftDone(t)} />
        </div>
      )}
    </div>
  )
}
