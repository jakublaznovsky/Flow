import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from '@dnd-kit/core'
import type { Card as CardData } from '../model/board'
import { itemsOn, splitByTime } from '../model/calendar'
import { addDays, dayParts, daysBetween, weekStart } from '../model/dates'
import { weekPlan, type WeekDay } from '../model/schedule'
import { findTask } from '../model/tasks'
import { GRID_START, minutesToY, parseTime, type TimeBlock } from '../model/timeblock'
import type { CalendarItem, ISODate } from '../model/types'
import { HOUR_PX, type BlockData } from './CalendarBlock'
import { dropTask, stripDropBlock, type WeekTarget } from './calendarDrop'
import MonthPicker from './MonthPicker'
import { DayGrid, hitAt, minutesAt, TimeAxis, useGridGestures, type Gestures, type Over } from './TimeGrid'
import type { useFlow } from './useFlow'
import { useEdgeScroll } from './edgeScroll'
import WeekStrip, { CardFace, DoneFace, InTodayFace, WeekCard, type DragItem } from './WeekStrip'

type Flow = ReturnType<typeof useFlow>

/**
 * A card dropped in the Week view (any task: To do, Today or done), applied once (`dropTask`):
 * - a future day → planned for it (a done task is reopened first; a Today task leaves Today);
 * - today's column → straight to Today (a done task is reopened);
 * - a past day → done that day (`completeOn`; a task done elsewhere is re-dated);
 * - `unscheduled` → an undated To do task.
 * On a day's strip the task has no time; on its grid it gets the target's block.
 */
export function handleWeekDrop(args: { cardKey: string; target: WeekTarget }, ctx: { flow: Flow; today: ISODate }): void {
  const { flow, today } = ctx
  if (flow.data) flow.apply((d) => dropTask(d, args.cardKey, args.target, today))
}

function weekTitle(start: ISODate): string {
  const s = dayParts(start)
  const e = dayParts(addDays(start, 6))
  return `Week of ${s.day} ${s.month}${s.year !== e.year ? ` ${s.year}` : ''} – ${e.day} ${e.month} ${e.year}`
}

/**
 * Sizes the title box for the widest title ("May" is the widest month name, two-digit days, two
 * years, tabular digits), so the arrows after it never move when the title changes length.
 */
const TITLE_SIZER = 'Week of 28 May 2026 – 28 May 2027'

const Chevron = () => (
  <svg className="week-title-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5l3 3 3-3" /></svg>
)

/**
 * The week title as a button opening the month/year picker. The title and an invisible sizer share
 * one grid cell, so the box is always as wide as the widest title.
 */
function WeekTitle({ start, today, onChooseMonth }: { start: ISODate; today: ISODate; onChooseMonth: (first: ISODate) => void }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }
  return (
    <div className="week-title">
      <h2>
        <button
          ref={buttonRef} type="button" className="week-title-btn" aria-haspopup="dialog" aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="week-title-text">
            <span>{weekTitle(start)}<Chevron /></span>
            <span className="week-title-sizer" aria-hidden="true">{TITLE_SIZER}<Chevron /></span>
          </span>
        </button>
      </h2>
      {open && (
        <MonthPicker
          // The shown week's month is the month of its Sunday: a week that contains the 1st of a
          // month counts as that month, so choosing a month highlights it next time.
          current={addDays(start, 6)} today={today} anchor={buttonRef} onClose={close}
          onChoose={(first) => { close(true); onChooseMonth(first) }}
        />
      )}
    </div>
  )
}

/** Blocks for one day's grid: timed To do and Today tasks, and week-only items. */
function dayBlocks(cards: CardData[], items: CalendarItem[], date: ISODate): BlockData[] {
  const out: BlockData[] = []
  for (const c of splitByTime(cards).timed) out.push({ kind: 'task', id: c.key, title: c.title, color: c.color, date, block: c.block })
  for (const i of items) out.push({ kind: 'item', id: i.id, title: i.title, date, block: parseTime(i.time) })
  return out
}

interface DayProps {
  day: WeekDay
  today: ISODate
  items: CalendarItem[]
  movable: (ref: string, date: ISODate) => boolean
  over: Over
  g: Gestures
  incoming: { title: string; color?: string; block: TimeBlock } | null
}

/** A day: header and untimed strip on top (they stay in view), its 07:00–24:00 grid below. */
function DayColumn({ day, today, items, movable, over, g, incoming }: DayProps) {
  const past = day.date < today
  const isToday = day.date === today
  const p = dayParts(day.date)
  const scheduled = splitByTime(day.scheduled)
  const inToday = splitByTime(day.inToday)
  const stripOver = over?.kind === 'strip' && over.date === day.date
  const isOver = stripOver || (over?.kind === 'grid' && over.date === day.date)
  return (
    <section
      aria-label={`${p.weekday} ${p.day} ${p.month}`}
      aria-current={isToday ? 'date' : undefined}
      className={`week-col${isToday ? ' is-today' : ''}${past ? ' is-past' : ''}${isOver ? ' is-over' : ''}`}
    >
      <WeekStrip
        date={day.date} header={<header><h3>{p.weekday} {p.day}</h3></header>}
        scheduled={scheduled.untimed} inToday={inToday.untimed} done={day.done} movable={movable} pointerOver={stripOver}
      />
      <DayGrid
        date={day.date} g={g} incoming={incoming}
        blocks={dayBlocks([...day.scheduled, ...day.inToday], items, day.date)}
      />
    </section>
  )
}

/**
 * The Unscheduled drawer above the days: one horizontally scrolling row of compact cards. Its
 * header button opens and closes it; open or closed, it is the `unscheduled` drop target.
 */
function Tray({ cards, open, onToggle, over }: { cards: CardData[]; open: boolean; onToggle: () => void; over: boolean }) {
  return (
    <section aria-label="Unscheduled" data-drop="unscheduled" className={`week-tray${open ? ' is-open' : ''}${over ? ' is-over' : ''}`}>
      <h3 className="week-tray-head">
        <button type="button" className="week-tray-toggle" aria-expanded={open} aria-controls={open ? 'week-tray-cards' : undefined} onClick={onToggle}>
          <svg className="week-tray-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 3l3 3-3 3" /></svg>
          Unscheduled <span className="count">{cards.length}</span>
        </button>
      </h3>
      {open && (
        <ul id="week-tray-cards" className="week-tray-cards">
          {cards.map((c) => <WeekCard key={c.key} card={c} />)}
          {cards.length === 0 && <li className="week-tray-empty">Nothing waiting</li>}
        </ul>
      )}
    </section>
  )
}

interface Props {
  flow: Flow
  /** Whether the Unscheduled drawer shows its cards (local setting `weekTrayOpen`). */
  trayOpen?: boolean
  onToggleTray?: () => void
  /**
   * Where the week header (title + ‹ This week ›) goes: the shell's top bar, on the search box's
   * line. Without one (or before it mounts) the header renders at the top of the view.
   */
  headerSlot?: HTMLElement | null
  /** The clock (the grid opens scrolled to the current hour). */
  now?: () => Date
}

const sameOver = (a: Over, b: Over) => JSON.stringify(a) === JSON.stringify(b)

/** Where a strip/drawer card would land with the pointer at (x, y). */
function targetAt(x: number, y: number): Over {
  const hit = hitAt(x, y)
  if (hit?.kind === 'grid') return { kind: 'grid', date: hit.date, block: stripDropBlock(minutesAt(hit.date, y)) }
  return hit as Exclude<typeof hit, { kind: 'grid' }>
}

export default function WeekView({ flow, trayOpen = true, onToggleTray, headerSlot, now = () => new Date() }: Props) {
  const { data, today, filter } = flow
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState<DragItem | null>(null)
  const [dndOver, setDndOver] = useState<Over>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const scroller = useRef<HTMLDivElement>(null)
  const g = useGridGestures({ apply: flow.apply, today, scroller })
  // The pointer during a dnd-kit drag, read from the pointer events themselves: dnd-kit's delta also
  // counts scrolling, which would put the drop off the pointer. dnd-kit's own auto-scroll is off (it
  // scrolled the grid while the pointer was nowhere near its edges); like a block drag, the grid
  // scrolls only in its edge bands (`useEdgeScroll`), also while the pointer is held still there.
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const edge = useEdgeScroll(scroller, () => {
    const p = pointer.current
    if (!p) return
    const next = targetAt(p.x, p.y)
    setDndOver((cur) => (sameOver(cur, next) ? cur : next))
  })
  const isDragging = dragging !== null
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY }
      edge.update(e.clientX, e.clientY)
    }
    window.addEventListener('pointermove', onMove, true)
    return () => {
      window.removeEventListener('pointermove', onMove, true)
      edge.stop()
    }
  }, [isDragging, edge.update, edge.stop])

  // On open: the current hour (one hour of context above it) this week, 07:00 otherwise. The
  // strips stay on top (sticky), so the hour lands just below them.
  const hasData = data !== null
  const nowRef = useRef(now)
  nowRef.current = now
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const t = nowRef.current()
    const thisWeek = offset === 0
    const minute = thisWeek ? Math.max(GRID_START, (t.getHours() - 1) * 60) : GRID_START
    const firstGrid = el.querySelector<HTMLElement>('.cal-day')
    const top = el.querySelector<HTMLElement>('.week-col-top')
    const gridTop = firstGrid ? firstGrid.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop : 0
    el.scrollTop = minute === GRID_START ? 0 : Math.max(0, gridTop - (top?.offsetHeight ?? 0) + minutesToY(minute, HOUR_PX))
    // Only when the view opens: moving between weeks keeps the scroll position.
  }, [hasData])

  if (!data) return null

  const start = addDays(weekStart(today), 7 * offset)
  const plan = weekPlan(data, start, filter, today)
  // A done entry drags only while its task still exists in an active project and is done that day
  // (a stale snapshot, e.g. after an external edit, stays static).
  const movable = (ref: string, date: ISODate) => {
    const found = findTask(data, ref)
    return !!found && found.project.status === 'active' && found.task.status === 'done' && found.task.done === date
  }

  /** Where a dnd-kit drag (strip, drawer, done entry) is now: the pointer, hit-tested. */
  const dndTarget = (e: DragMoveEvent | DragEndEvent): Over => {
    const start = e.activatorEvent as PointerEvent
    if (typeof start?.clientX !== 'number') return null
    const { x, y } = pointer.current ?? { x: start.clientX + e.delta.x, y: start.clientY + e.delta.y }
    return targetAt(x, y)
  }
  const onDragStart = (e: DragStartEvent) => {
    pointer.current = null
    setDragging((e.active.data.current as DragItem | undefined) ?? null)
  }
  const onDragMove = (e: DragMoveEvent) => {
    const next = dndTarget(e)
    setDndOver((cur) => (sameOver(cur, next) ? cur : next))
  }
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    setDndOver(null)
    const ref = (e.active.data.current as DragItem | undefined)?.ref ?? String(e.active.id)
    const target = dndTarget(e)
    if (target) handleWeekDrop({ cardKey: ref, target }, { flow, today })
  }
  const onDragCancel = () => { setDragging(null); setDndOver(null) }

  const over: Over = g.moving?.to ?? dndOver
  const incoming = (date: ISODate) => (dragging && dndOver?.kind === 'grid' && dndOver.date === date
    ? { title: dragging.title, color: dragging.color, block: dndOver.block } : null)

  const header = (
    <header className="week-head" role="group" aria-label="Week navigation">
      <WeekTitle
        start={start} today={today}
        // The week (Mon–Sun) containing the 1st, kept as an offset from this week.
        onChooseMonth={(first) => setOffset(Math.round(daysBetween(weekStart(today), weekStart(first)) / 7))}
      />
      <div className="week-nav">
        <button type="button" className="icon-btn" aria-label="Previous week" onClick={() => setOffset((o) => o - 1)}>‹</button>
        <button type="button" className="btn" onClick={() => setOffset(0)}>This week</button>
        <button type="button" className="icon-btn" aria-label="Next week" onClick={() => setOffset((o) => o + 1)}>›</button>
      </div>
    </header>
  )

  return (
    <section className={`week-view${g.gesture ? ' is-gesture' : ''}`} aria-label="Week">
      {headerSlot ? createPortal(header, headerSlot) : header}
      <DndContext sensors={sensors} autoScroll={false} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
        <div className="week-board">
          <Tray cards={plan.unscheduled} open={trayOpen} onToggle={() => onToggleTray?.()} over={over?.kind === 'unscheduled'} />
          <div className="week-cal" ref={scroller} style={{ '--hour-px': `${HOUR_PX}px` } as CSSProperties}>
            <div className="week-cal-corner" aria-hidden="true" />
            <TimeAxis />
            {plan.days.map((day) => (
              <DayColumn
                key={day.date} day={day} today={today} items={itemsOn(data, day.date)} movable={movable}
                over={over} g={g} incoming={incoming(day.date)}
              />
            ))}
          </div>
        </div>
        {/* Over a grid the drop ghost shows where it lands; the floating card would only cover it. */}
        <DragOverlay dropAnimation={null}>
          {dndOver?.kind !== 'grid' && dragging?.kind === 'card' && (
            <div className="card week-card is-overlay" style={{ '--project': dragging.color ?? 'var(--border-strong)' } as CSSProperties}>
              <CardFace card={dragging} />
            </div>
          )}
          {dndOver?.kind !== 'grid' && dragging?.kind === 'today' && (
            <div className="week-in-today is-overlay" style={{ '--project': dragging.color ?? 'var(--border-strong)' } as CSSProperties}>
              <InTodayFace title={dragging.title} />
            </div>
          )}
          {dndOver?.kind !== 'grid' && dragging?.kind === 'done' && (
            <div className="week-done is-overlay is-done"><DoneFace title={dragging.title} /></div>
          )}
        </DragOverlay>
      </DndContext>
    </section>
  )
}
