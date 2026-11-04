import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import type { Step } from '../model/types'
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent, type Modifier,
  type ScreenReaderInstructions, type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { stepIds } from './stepDrop'
import type { Card as CardData, ColumnId } from '../model/board'
import { dayParts } from '../model/dates'
import type { ISODate } from '../model/types'
import PlanMenu from './PlanMenu'

interface Props {
  card: CardData
  column: ColumnId
  projects: { slug: string; title: string }[]
  onToggle: () => void
  /** `scheduled` is the "Plan for" day, '' for none. */
  onSave: (patch: { title: string; firstStep: string; project: string; scheduled: string }) => void
  onDelete: () => void
  /** Today cards only: start a focus session on this task. */
  onFocus?: () => void
  inFocus?: boolean
  today?: ISODate
  /** Task cards in To do, Tomorrow and Today: plan the task for a day (null removes the date). */
  onPlan?: (date: ISODate | null) => void
  /** Task cards only: checklist edits. */
  steps?: {
    onAdd: (text: string) => void
    onToggle: (index: number) => void
    onEdit: (index: number, text: string) => void
    onDelete: (index: number) => void
    /** Move the step at `from` to index `to` (drag and drop or Alt+Arrow on its handle). */
    onMove: (from: number, to: number) => void
  }
}

const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
/** Steps only move up and down inside their own list. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })
/** Screen-reader text for step drags: the step text, not its internal id. */
const stepName = (id: UniqueIdentifier) => String(id).replace(/#\d+$/, '')
const stepA11y: { screenReaderInstructions: ScreenReaderInstructions; announcements: Announcements } = {
  screenReaderInstructions: { draggable: 'Drag to reorder, or press Alt+Up or Alt+Down to move this step.' },
  announcements: {
    onDragStart: ({ active }) => `Picked up step ${stepName(active.id)}.`,
    onDragOver: ({ active, over }) => over ? `Step ${stepName(active.id)} is over ${stepName(over.id)}.` : `Step ${stepName(active.id)} is outside the list.`,
    onDragEnd: ({ active, over }) => over ? `Step ${stepName(active.id)} dropped at ${stepName(over.id)}.` : `Step ${stepName(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving step ${stepName(active.id)} was cancelled.`,
  },
}

/** One checklist row; only its grip handle starts a drag (text, checkbox and × keep their clicks). */
function StepRow({ id, text, ticked, onKeyDown, handleRef, children }: {
  id: string; text: string; ticked: boolean
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  handleRef: (el: HTMLButtonElement | null) => void
  children: ReactNode
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id, transition: reduceMotion() ? null : { duration: 160, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  })
  const style = { transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined, transition }
  const cls = [ticked && 'is-ticked', isDragging && 'is-dragging-step'].filter(Boolean).join(' ') || undefined
  return (
    <li ref={setNodeRef} className={cls} style={style}>
      <button
        type="button" className="step-grip" {...attributes} {...listeners} aria-label={`Reorder step ${text}`}
        ref={(el) => { setActivatorNodeRef(el); handleRef(el) }} onKeyDown={onKeyDown}
      >
        <svg viewBox="0 0 8 12" width="8" height="12" aria-hidden="true" fill="currentColor">
          <circle cx="2" cy="2" r="1.1" /><circle cx="6" cy="2" r="1.1" />
          <circle cx="2" cy="6" r="1.1" /><circle cx="6" cy="6" r="1.1" />
          <circle cx="2" cy="10" r="1.1" /><circle cx="6" cy="10" r="1.1" />
        </svg>
      </button>
      {children}
    </li>
  )
}

function Checklist({ steps, api }: { steps: Step[]; api: NonNullable<Props['steps']> }) {
  const [adding, setAdding] = useState('')
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  // Step drags live in their own DndContext, so they never reach the board's card drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const ids = stepIds(steps)
  const handles = useRef<(HTMLButtonElement | null)[]>([])
  const focusAfterMove = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (focusAfterMove.current === null) return
    handles.current[focusAfterMove.current]?.focus()
    focusAfterMove.current = null
  }, [steps])
  const commitEdit = () => {
    if (editIdx !== null) api.onEdit(editIdx, editText)
    setEditIdx(null)
  }
  const move = (from: number, to: number) => {
    if (from < 0 || to < 0 || to >= steps.length || from === to) return
    setEditIdx(null)
    api.onMove(from, to)
  }
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over) move(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
  }
  const onHandleKey = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    e.stopPropagation()
    const to = e.key === 'ArrowUp' ? i - 1 : i + 1
    if (to < 0 || to >= steps.length) return
    focusAfterMove.current = to
    move(i, to)
  }
  return (
    // Stop pointer-down here so the card's drag listeners never see clicks inside the checklist.
    <div className="checklist" onPointerDown={(e) => e.stopPropagation()}>
      {steps.length > 0 && (
        <DndContext
          sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]}
          onDragEnd={onDragEnd} accessibility={stepA11y}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul role="list" className="steps">
              {steps.map((st, i) => (
                <StepRow
                  key={ids[i]} id={ids[i]} text={st.text} ticked={st.done}
                  onKeyDown={onHandleKey(i)} handleRef={(el) => { handles.current[i] = el }}
                >
                  <input type="checkbox" aria-label={editIdx === i ? `Done: ${st.text}` : st.text} checked={st.done} onChange={() => api.onToggle(i)} />
                  {editIdx === i ? (
                    <input
                      autoFocus className="step-edit" aria-label="Edit step" value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                        else if (e.key === 'Escape') { e.stopPropagation(); setEditIdx(null) }
                      }}
                      onBlur={commitEdit}
                    />
                  ) : (
                    <button type="button" className="step-text" onClick={() => { setEditText(st.text); setEditIdx(i) }}>{st.text}</button>
                  )}
                  <button type="button" className="step-del" aria-label={`Delete step ${st.text}`} onClick={() => api.onDelete(i)}>×</button>
                </StepRow>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <input
        className="step-add" aria-label="Add step" placeholder="Add step" value={adding}
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          if (adding.trim()) { api.onAdd(adding); setAdding('') }
        }}
      />
    </div>
  )
}

/** Static look-alike of a card, shown in the drag overlay so it can float above every column. */
export function CardPreview({ card, column }: { card: CardData; column: ColumnId }) {
  const list = card.steps ?? []
  const chip = card.scheduled && column !== 'tomorrow' ? dayParts(card.scheduled) : undefined
  return (
    <div
      className={`card is-overlay${column === 'done' ? ' is-done' : ''}${card.kind === 'inbox' ? ' is-inbox' : ''}`}
      style={{ '--project': card.color ?? 'var(--border-strong)' } as CSSProperties}
      aria-hidden="true"
    >
      {card.kind === 'task' && <input type="checkbox" tabIndex={-1} readOnly checked={column === 'done'} />}
      <div className="card-body">
        <div className="card-head">
          <span className="card-title">{card.title}</span>
          {list.length > 0 && (
            <div className="steps-ctl"><span className="steps-pill">{list.filter((x) => x.done).length}/{list.length}</span></div>
          )}
        </div>
        {card.firstStep && <div className="step">{card.firstStep}</div>}
        {(card.projectTitle || chip) && (
          <div className="card-meta">
            {card.projectTitle && <span className="tag"><span className="tag-text">{card.projectTitle}</span></span>}
            {chip && <span className="day-chip">{chip.weekday} {chip.day}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Card({ card, column, projects, onToggle, onSave, onDelete, onFocus, inFocus, today, onPlan, steps }: Props) {
  const [editing, setEditing] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  const list = card.steps ?? []
  const doneCount = list.filter((x) => x.done).length
  const next = list.find((x) => !x.done)?.text
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: card.key, data: { column }, disabled: editing,
  })
  const stripe = { '--project': card.color ?? 'var(--border-strong)' } as CSSProperties
  const dragStyle = { ...stripe, transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }
  const [title, setTitle] = useState(card.title)
  const [step, setStep] = useState(card.firstStep ?? '')
  const [project, setProject] = useState(card.projectSlug ?? '')
  const [planFor, setPlanFor] = useState(card.scheduled ?? '')
  // In the Tomorrow column the day is the column itself; no chip.
  const chip = card.scheduled && column !== 'tomorrow' ? dayParts(card.scheduled) : undefined
  const plan = onPlan && today && card.kind === 'task' && column !== 'done' && column !== 'inbox'

  const open = () => {
    setTitle(card.title); setStep(card.firstStep ?? ''); setProject(card.projectSlug ?? ''); setPlanFor(card.scheduled ?? '')
    setEditing(true)
  }
  const save = () => { onSave({ title, firstStep: step, project, scheduled: planFor }); setEditing(false) }

  if (editing) {
    return (
      <li className="card editing" ref={setNodeRef} style={dragStyle}>
        <form
          onSubmit={(e) => { e.preventDefault(); save() }}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
        >
          <input autoFocus aria-label={card.kind === 'inbox' ? 'Text' : 'Title'} value={title} onChange={(e) => setTitle(e.target.value)} />
          {card.kind === 'task' && (
            <>
              <input aria-label="First step" placeholder="First step" value={step} onChange={(e) => setStep(e.target.value)} />
              <select aria-label="Project" value={project} onChange={(e) => setProject(e.target.value)}>
                {projects.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
              </select>
              {column !== 'done' && (
                <label className="plan-for">
                  <span>Plan for</span>
                  <input type="date" aria-label="Plan for" value={planFor} onChange={(e) => setPlanFor(e.target.value)} />
                </label>
              )}
            </>
          )}
          <div className="row">
            <button type="submit" className="primary">Save</button>
            <button type="button" className="danger" onClick={onDelete}>Delete</button>
          </div>
        </form>
      </li>
    )
  }
  return (
    <li
      className={`card${column === 'done' ? ' is-done' : ''}${card.kind === 'inbox' ? ' is-inbox' : ''}${isDragging ? ' is-dragging' : ''}${inFocus ? ' in-focus' : ''}`}
      ref={setNodeRef}
      style={dragStyle}
      {...listeners}
    >
      {card.kind === 'task' && (
        <input
          type="checkbox"
          aria-label={`Done: ${card.title}`}
          checked={column === 'done'}
          onChange={onToggle}
        />
      )}
      <div className="card-body">
        <div className="card-head">
          <button className="card-title" onClick={open}>
            {steps && <span className="title-gap" aria-hidden="true" data-pill={list.length > 0 ? `${doneCount}/${list.length}` : undefined} />}
            {card.title}
          </button>
          {steps && (
            <div className="steps-ctl" onPointerDown={(e) => e.stopPropagation()}>
              {list.length > 0 && (
                <span className="steps-pill" aria-label={`${doneCount} of ${list.length} steps done`}>{doneCount}/{list.length}</span>
              )}
              <button
                type="button" className="steps-toggle" aria-expanded={showSteps}
                aria-label={showSteps ? 'Hide steps' : 'Show steps'} onClick={() => setShowSteps((v) => !v)}
              >
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5l3 3 3-3" /></svg>
              </button>
            </div>
          )}
        </div>
        {card.firstStep && <div className="step">{card.firstStep}</div>}
        {next && !showSteps && <div className="step next-step">Next: {next}</div>}
        {(card.projectTitle || chip || plan) && (
          <div className="card-meta">
            {card.projectTitle && <span className="tag" title={card.projectTitle}><span className="tag-text">{card.projectTitle}</span></span>}
            {chip && <span className="day-chip" aria-label={`Planned for ${chip.weekday} ${chip.day} ${chip.month}`}>{chip.weekday} {chip.day}</span>}
            {plan && (
              // Stop pointer-down so the calendar button never starts a drag.
              <span className="plan-ctl" onPointerDown={(e) => e.stopPropagation()}>
                <PlanMenu title={card.title} today={today} scheduled={card.scheduled} inToday={column === 'today'} onPlan={onPlan} />
              </span>
            )}
          </div>
        )}
        {(inFocus || (onFocus && column === 'today' && card.kind === 'task')) && (
          <div className="focus-row">
            {inFocus && <span className="focus-mark">in focus</span>}
            {onFocus && column === 'today' && card.kind === 'task' && (
              <button type="button" className="card-focus" aria-label={`Focus on ${card.title}`} onClick={onFocus}>Focus</button>
            )}
          </div>
        )}
      </div>
      {steps && showSteps && <Checklist steps={list} api={steps} />}
    </li>
  )
}
