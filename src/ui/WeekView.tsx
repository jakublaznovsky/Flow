import { useState, type CSSProperties } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import type { Card as CardData } from '../model/board'
import { addDays, dayParts, weekStart } from '../model/dates'
import { scheduleTask, weekPlan, type WeekDay } from '../model/schedule'
import type { ISODate } from '../model/types'
import type { useFlow } from './useFlow'

type Flow = ReturnType<typeof useFlow>

/**
 * A card dropped in the Week view: on a day from today on → planned for it (today means
 * straight to Today); on `unscheduled` → date cleared. Past days and other targets are ignored.
 */
export function handleWeekDrop(args: { cardKey: string; target: string }, ctx: { flow: Flow; today: ISODate }): void {
  const { cardKey, target } = args
  const { flow, today } = ctx
  if (!flow.data) return
  if (target === 'unscheduled') {
    flow.apply((d) => scheduleTask(d, cardKey, null, today))
    return
  }
  const date = /^day-(\d{4}-\d{2}-\d{2})$/.exec(target)?.[1]
  if (!date || date < today) return
  flow.apply((d) => scheduleTask(d, cardKey, date, today))
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

function WeekCard({ card }: { card: CardData }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: card.key })
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

function DayColumn({ day, today }: { day: WeekDay; today: ISODate }) {
  const past = day.date < today
  const isToday = day.date === today
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day.date}`, disabled: past })
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
        {day.inToday.map((c) => (
          <li key={`today-${c.key}`} className="week-in-today" style={{ '--project': c.color ?? 'var(--border-strong)' } as CSSProperties}>
            <span className="week-in-today-title">{c.title}</span>
            <span className="week-in-today-label">In Today</span>
          </li>
        ))}
        {day.done.map((e, i) => (
          <li key={`done-${e.ref}-${i}`} className="week-done is-done">
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2l2.3 2.3 4.7-4.9" /></svg>
            <span>{e.title}</span>
          </li>
        ))}
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
  const [dragging, setDragging] = useState<CardData | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  if (!data) return null

  const start = addDays(weekStart(today), 7 * offset)
  const plan = weekPlan(data, start, filter, today)
  const cards = [...plan.unscheduled, ...plan.days.flatMap((d) => d.scheduled)]

  const onDragStart = (e: DragStartEvent) => setDragging(cards.find((c) => c.key === String(e.active.id)) ?? null)
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    if (e.over) handleWeekDrop({ cardKey: String(e.active.id), target: String(e.over.id) }, { flow, today })
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
            {plan.days.map((day) => <DayColumn key={day.date} day={day} today={today} />)}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="card week-card is-dragging" style={{ '--project': dragging.color ?? 'var(--border-strong)' } as CSSProperties}>
              <CardFace card={dragging} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </section>
  )
}
