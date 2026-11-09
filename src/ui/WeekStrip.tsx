import type { CSSProperties, ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { Card as CardData } from '../model/board'
import type { DoneEntry, ISODate } from '../model/types'

/** What is being dragged with dnd-kit: the task ref and how the overlay shows it. */
export interface DragItem { ref: string; title: string; color?: string; kind: 'card' | 'today' | 'done' }

function useWeekDrag(id: string, item: DragItem) {
  return useDraggable({ id, data: item })
}

export function CardFace({ card }: { card: Pick<CardData, 'title' | 'color' | 'projectTitle'> }) {
  return (
    <>
      <span className="week-card-title">{card.title}</span>
      <span className="dot" aria-hidden="true" title={card.projectTitle} style={{ background: card.color }} />
    </>
  )
}

/** A To do task card (in a strip or the Unscheduled drawer). */
export function WeekCard({ card }: { card: CardData }) {
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

export function InTodayFace({ title }: { title: string }) {
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

export function DoneFace({ title }: { title: string }) {
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

interface Props {
  date: ISODate
  header: ReactNode
  /** Untimed To do tasks planned for the day. */
  scheduled: CardData[]
  /** Untimed Today tasks (today's column only). */
  inToday: CardData[]
  done: DoneEntry[]
  movable: (ref: string, date: ISODate) => boolean
  /** A grid block is being dragged over this strip. */
  pointerOver?: boolean
}

/**
 * The top of a day column: its header and the untimed strip (tasks without a time and done
 * history). Header and strip together are the `strip-<date>` drop target; a task dropped here keeps
 * (or gets) the day and loses its time.
 */
export default function WeekStrip({ date, header, scheduled, inToday, done, movable, pointerOver }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `strip-${date}` })
  return (
    <div ref={setNodeRef} className={`week-col-top${isOver || pointerOver ? ' is-over' : ''}`} data-strip-date={date}>
      {header}
      <ul className="week-cards week-strip">
        {scheduled.map((c) => <WeekCard key={c.key} card={c} />)}
        {inToday.map((c) => <InTodayItem key={`today-${c.key}`} card={c} />)}
        {done.map((e, i) => movable(e.ref, date)
          ? <DraggableDone key={`done-${e.ref}-${i}`} entry={e} date={date} />
          : <li key={`done-${e.ref}-${i}`} className="week-done is-done"><DoneFace title={e.title} /></li>)}
      </ul>
    </div>
  )
}
