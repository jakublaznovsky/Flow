import { useState, type CSSProperties } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import type { Card as CardData } from '../model/board'
import { addDays, dayParts, weekStart } from '../model/dates'
import { scheduleTask, weekPlan, type WeekDay } from '../model/schedule'
import { completeOn, findTask, moveTask } from '../model/tasks'
import type { Change, DoneEntry, FlowData, ISODate } from '../model/types'
import type { useFlow } from './useFlow'

type Flow = ReturnType<typeof useFlow>

/**
 * A card dropped in the Week view (any task: To do, Today or done):
 * - a future day → planned for it (a done task is reopened first; a Today task leaves Today);
 * - today's column → straight to Today (a done task is reopened);
 * - a past day → done that day (`completeOn`; a task done elsewhere is re-dated);
 * - `unscheduled` → an undated To do task.
 * Other targets are ignored.
 */
export function handleWeekDrop(args: { cardKey: string; target: string }, ctx: { flow: Flow; today: ISODate }): void {
  const { cardKey: ref, target } = args
  const { flow, today } = ctx
  if (!flow.data) return
  const toTodo = (d: FlowData) => (findTask(d, ref)?.task.status === 'todo' ? { data: d, changed: [] } : moveTask(d, ref, 'todo', today))
  if (target === 'unscheduled') {
    flow.apply((d) => chain(d, toTodo, (x) => scheduleTask(x, ref, null, today)))
    return
  }
  const date = /^day-(\d{4}-\d{2}-\d{2})$/.exec(target)?.[1]
  if (!date) return
  if (date < today) flow.apply((d) => completeOn(d, ref, date, today))
  else if (date === today) flow.apply((d) => moveTask(d, ref, 'today', today))
  else {
    const reopen = (d: FlowData) => (findTask(d, ref)?.task.status === 'done' ? moveTask(d, ref, 'todo', today) : { data: d, changed: [] })
    flow.apply((d) => chain(d, reopen, (x) => scheduleTask(x, ref, date, today)))
  }
}

/** Two changes in a row as one Change. */
function chain(d: FlowData, a: (d: FlowData) => Change, b: (d: FlowData) => Change): Change {
  const first = a(d)
  const second = b(first.data)
  return { data: second.data, changed: [...new Set([...first.changed, ...second.changed])] }
}

function weekTitle(start: ISODate): string {
  const s = dayParts(start)
  const e = dayParts(addDays(start, 6))
  return `Week of ${s.day} ${s.month}${s.year !== e.year ? ` ${s.year}` : ''} – ${e.day} ${e.month} ${e.year}`
}

function CardFace({ card }: { card: CardData }) {
  return (
    <>
      <span className="week-card-title">{card.title}</span>
      <span className="dot" aria-hidden="true" title={card.projectTitle} style={{ background: card.color }} />
    </>
  )
}

/** What is being dragged: the task ref and how the overlay shows it. */
interface DragItem { ref: string; title: string; color?: string; kind: 'card' | 'today' | 'done' }

function useWeekDrag(id: string, item: DragItem) {
  return useDraggable({ id, data: item })
}

function WeekCard({ card }: { card: CardData }) {
  const { setNodeRef, listeners, attributes, isDragging } = useWeekDrag(card.key, { ref: card.key, title: card.title, color: card.color, kind: 'card' })
  const style = { '--project': card.color ?? 'var(--border-strong)' } as CSSProperties
  return (
    <li
      ref={setNodeRef} style={style} {...listeners} {...attributes}
      className={`card week-card${isDragging ? ' is-placeholder' : ''}`}
    >
      <CardFace card={card} />
    </li>
  )
}

function InTodayFace({ title }: { title: string }) {
  return (
    <>
      <span className="week-in-today-title">{title}</span>
      <span className="week-in-today-label">In Today</span>
    </>
  )
}

/** A task in the Today column, shown muted on today's day; it can be dragged to another day. */
function InTodayItem({ card }: { card: CardData }) {
  const { setNodeRef, listeners, attributes, isDragging } = useWeekDrag(card.key, { ref: card.key, title: card.title, color: card.color, kind: 'today' })
  return (
    <li
      ref={setNodeRef} {...listeners} {...attributes}
      className={`week-in-today is-draggable${isDragging ? ' is-placeholder' : ''}`}
      style={{ '--project': card.color ?? 'var(--border-strong)' } as CSSProperties}
    >
      <InTodayFace title={card.title} />
    </li>
  )
}

function DoneFace({ title }: { title: string }) {
  return (
    <>
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2l2.3 2.3 4.7-4.9" /></svg>
      <span>{title}</span>
    </>
  )
}

/** A completed entry whose task still exists in an active project: it can be dragged. */
function DraggableDone({ entry, date }: { entry: DoneEntry; date: ISODate }) {
  const { setNodeRef, listeners, attributes, isDragging } = useWeekDrag(`done:${date}:${entry.ref}`, { ref: entry.ref, title: entry.title, kind: 'done' })
  return (
    <li ref={setNodeRef} {...listeners} {...attributes} className={`week-done is-done is-draggable${isDragging ? ' is-placeholder' : ''}`}>
      <DoneFace title={entry.title} />
    </li>
  )
}

function DayColumn({ day, today, movable }: { day: WeekDay; today: ISODate; movable: (ref: string) => boolean }) {
  const past = day.date < today
  const isToday = day.date === today
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day.date}` })
  const p = dayParts(day.date)
  return (
    <section
      ref={setNodeRef}
      aria-label={`${p.weekday} ${p.day} ${p.month}`}
      aria-current={isToday ? 'date' : undefined}
      className={`week-col${isToday ? ' is-today' : ''}${past ? ' is-past' : ''}${isOver ? ' is-over' : ''}`}
    >
      <header><h3>{p.weekday} {p.day}</h3></header>
      <ul className="week-cards">
        {day.scheduled.map((c) => <WeekCard key={c.key} card={c} />)}
        {day.inToday.map((c) => <InTodayItem key={`today-${c.key}`} card={c} />)}
        {day.done.map((e, i) => movable(e.ref)
          ? <DraggableDone key={`done-${e.ref}-${i}`} entry={e} date={day.date} />
          : <li key={`done-${e.ref}-${i}`} className="week-done is-done"><DoneFace title={e.title} /></li>)}
      </ul>
    </section>
  )
}

function Tray({ cards }: { cards: CardData[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled' })
  return (
    <section ref={setNodeRef} aria-label="Unscheduled" className={`week-col week-tray${isOver ? ' is-over' : ''}`}>
      <header>
        <h3>Unscheduled</h3>
        <span className="count">{cards.length}</span>
      </header>
      <ul className="week-cards">
        {cards.map((c) => <WeekCard key={c.key} card={c} />)}
        {cards.length === 0 && <li className="empty">Nothing waiting</li>}
      </ul>
    </section>
  )
}

export default function WeekView({ flow }: { flow: Flow }) {
  const { data, today, filter } = flow
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState<DragItem | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  if (!data) return null

  const start = addDays(weekStart(today), 7 * offset)
  const plan = weekPlan(data, start, filter, today)
  const movable = (ref: string) => {
    const found = findTask(data, ref)
    return !!found && found.project.status === 'active'
  }

  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current as DragItem | undefined) ?? null)
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    const ref = (e.active.data.current as DragItem | undefined)?.ref ?? String(e.active.id)
    if (e.over) handleWeekDrop({ cardKey: ref, target: String(e.over.id) }, { flow, today })
  }

  return (
    <section className="week-view" aria-label="Week">
      <header className="week-head">
        <h2>{weekTitle(start)}</h2>
        <div className="week-nav">
          <button type="button" className="icon-btn" aria-label="Previous week" onClick={() => setOffset((o) => o - 1)}>‹</button>
          <button type="button" className="btn" onClick={() => setOffset(0)}>This week</button>
          <button type="button" className="icon-btn" aria-label="Next week" onClick={() => setOffset((o) => o + 1)}>›</button>
        </div>
      </header>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="week-board">
          <Tray cards={plan.unscheduled} />
          <div className="week-days">
            {plan.days.map((day) => <DayColumn key={day.date} day={day} today={today} movable={movable} />)}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging?.kind === 'card' && (
            <div className="card week-card is-overlay" style={{ '--project': dragging.color ?? 'var(--border-strong)' } as CSSProperties}>
              <span className="week-card-title">{dragging.title}</span>
              <span className="dot" aria-hidden="true" style={{ background: dragging.color }} />
            </div>
          )}
          {dragging?.kind === 'today' && (
            <div className="week-in-today is-overlay" style={{ '--project': dragging.color ?? 'var(--border-strong)' } as CSSProperties}>
              <InTodayFace title={dragging.title} />
            </div>
          )}
          {dragging?.kind === 'done' && (
            <div className="week-done is-done is-overlay"><DoneFace title={dragging.title} /></div>
          )}
        </DragOverlay>
      </DndContext>
    </section>
  )
}
