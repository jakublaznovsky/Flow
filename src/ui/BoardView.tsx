import { useState, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, type DropAnimation,
} from '@dnd-kit/core'
import { boardColumns, searchCards, type Card as CardData, type ColumnId } from '../model/board'
import { addInboxItem, deleteInboxItem, editInboxItem } from '../model/inbox'
import { addStep, deleteStep, editStep, toggleStep } from '../model/steps'
import { scheduleTask } from '../model/schedule'
import { addTask, changeTaskProject, deleteTask, editTask, moveTask } from '../model/tasks'
import { addDays } from '../model/dates'
import { nextTaskIdFor } from '../model/ids'
import type { Change, ISODate } from '../model/types'
import AddCard from './AddCard'
import Card, { CardPreview } from './Card'
import Column from './Column'
import DoneBar from './DoneBar'
import { handleStepDrop } from './stepDrop'
import type { useFlow } from './useFlow'

export const COLUMNS: { id: ColumnId; title: string; empty: string }[] = [
  { id: 'inbox', title: 'Parking lot', empty: 'Nothing parked' },
  { id: 'todo', title: 'To do', empty: 'Nothing to do' },
  { id: 'today', title: 'Today', empty: 'pick up to 3' },
  { id: 'tomorrow', title: 'Tomorrow', empty: 'Plan tomorrow here' },
  // Not a column: the Done bar under the board (listed here for Settings and drop targets).
  { id: 'done', title: 'Done', empty: '' },
]

/** Short settle animation into the drop place; none when the OS asks for reduced motion. */
function dropAnimation(): DropAnimation | null {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return reduce ? null : { duration: 160, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
}

interface Props {
  flow: ReturnType<typeof useFlow>
  query: string
  picker: ReactNode
  onDrop: (args: { cardKey: string; from: ColumnId; to: ColumnId; index: number }) => void
  createProject: (title: string) => string
  /** Set by the `n` shortcut to open "New task" in To do; cleared via onAddHandled. */
  addRequest: boolean
  onAddHandled: () => void
  /** Start a focus session on a Today task; `focusRef` marks the card currently in focus. */
  onFocus?: (ref: string, title: string) => void
  focusRef?: string | null
  /** Columns turned off in Settings; their cards are untouched, just not shown. */
  hidden?: readonly ColumnId[]
  /** Whether the Done bar shows its cards (local setting `doneBarOpen`). */
  doneOpen?: boolean
  onToggleDone?: () => void
}

export default function BoardView({ flow, query, picker, onDrop, createProject, addRequest, onAddHandled, onFocus, focusRef, hidden = [], doneOpen = true, onToggleDone }: Props) {
  const { data, today, filter, order, lastProject, remember, apply } = flow
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  // The card being dragged is drawn in a DragOverlay (fixed position, above all columns) so it is
  // never clipped by a column's scroll area; the original stays in place as a faded placeholder.
  const [dragging, setDragging] = useState<{ card: CardData; column: ColumnId } | null>(null)
  if (!data) return null

  const active = Object.values(data.projects).filter((p) => p.status === 'active')
  const projects = active.map((p) => ({ slug: p.slug, title: p.title }))
  const cols = searchCards(boardColumns(data, today, filter, order), query)
  const shown = COLUMNS.filter(({ id }) => !hidden.includes(id))
  const columnOf = (key: string): ColumnId | undefined =>
    shown.find(({ id }) => cols[id].some((c) => c.key === key))?.id

  const onDragStart = (e: DragStartEvent) => {
    const key = String(e.active.id)
    const column = columnOf(key)
    const card = column && cols[column].find((c) => c.key === key)
    setDragging(card && column ? { card, column } : null)
  }
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    if (!e.over) return
    const cardKey = String(e.active.id)
    const from = columnOf(cardKey)
    const overId = String(e.over.id)
    const overCol = shown.find(({ id }) => id === overId)?.id ?? columnOf(overId)
    if (!from || !overCol) return
    const overIdx = cols[overCol].findIndex((c) => c.key === overId)
    const index = overIdx >= 0 ? overIdx : cols[overCol].length
    onDrop({ cardKey, from, to: overCol, index })
  }
  const defaultProject =
    filter ?? (lastProject && active.some((p) => p.slug === lastProject) ? lastProject : null) ?? active[0]?.slug ?? null

  /** "+" in a column; Tomorrow (or a "Plan for" day) plans the new task in the same save. */
  const addTaskTo = (column: 'todo' | 'tomorrow' | 'today') => (title: string, slug: string | null, scheduled: string) => {
    if (!slug) return
    remember(slug)
    const date = column === 'tomorrow' ? addDays(today, 1) : scheduled
    apply((d): Change => {
      const ref = `${slug}/${nextTaskIdFor(d, slug)}`
      const added = addTask(d, slug, title, column === 'today' ? 'today' : 'todo', today)
      if (!date || added.changed.length === 0) return added
      const planned = scheduleTask(added.data, ref, date, today)
      return { data: planned.data, changed: [...new Set([...added.changed, ...planned.changed])] }
    })
  }
  const planCard = (card: CardData, date: ISODate | null) => apply((d) => scheduleTask(d, card.key, date, today))
  const saveCard = (card: CardData, patch: { title: string; firstStep?: string; project: string; scheduled: string }) => {
    if (card.kind === 'inbox') {
      apply((d) => editInboxItem(d, card.key.slice('inbox/'.length), patch.title))
      return
    }
    // One apply (one save) for the edit, the optional project change and the "Plan for" day.
    apply((d) => {
      const edited = editTask(d, card.key, { title: patch.title, firstStep: patch.firstStep }, today)
      let { data, changed } = edited
      let ref = card.key
      if (patch.project && patch.project !== card.projectSlug) {
        const moved = changeTaskProject(data, ref, patch.project)
        data = moved.data
        changed = [...new Set([...changed, ...moved.changed])]
        ref = moved.ref
      }
      if (patch.scheduled !== (card.scheduled ?? '')) {
        const planned = scheduleTask(data, ref, patch.scheduled || null, today)
        data = planned.data
        changed = [...new Set([...changed, ...planned.changed])]
      }
      return { data, changed }
    })
  }
  const deleteCard = (card: CardData) => {
    if (card.kind === 'inbox') apply((d) => deleteInboxItem(d, card.key.slice('inbox/'.length)))
    else apply((d) => deleteTask(d, card.key))
  }

  const renderCard = (card: CardData, id: ColumnId) => (
    <Card
      key={card.key}
      card={card}
      column={id}
      projects={projects}
      compact={id === 'done'}
      onToggle={() => apply((d) => moveTask(d, card.key, id === 'done' ? 'today' : 'done', today))}
      onSave={(patch) => saveCard(card, patch)}
      onDelete={() => deleteCard(card)}
      onFocus={onFocus ? () => onFocus(card.key, card.title) : undefined}
      inFocus={card.key === focusRef}
      today={today}
      onPlan={card.kind === 'task' && id !== 'done' ? (date) => planCard(card, date) : undefined}
      steps={card.kind === 'task' && id !== 'done' ? {
        onAdd: (text) => apply((d) => addStep(d, card.key, text)),
        onToggle: (i) => apply((d) => toggleStep(d, card.key, i)),
        onEdit: (i, text) => apply((d) => editStep(d, card.key, i, text)),
        onDelete: (i) => apply((d) => deleteStep(d, card.key, i)),
        onMove: (from, to) => handleStepDrop({ ref: card.key, activeIndex: from, overIndex: to }, apply),
      } : undefined}
    />
  )

  return (
    <div className="board-view">
      {picker && (
        <div className="picker-wrap">
          <span className="picker-label" aria-hidden="true">Move to which project?</span>
          {picker}
        </div>
      )}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="columns">
          {shown.filter(({ id }) => id !== 'done').map(({ id, title, empty }) => (
            <Column
              key={id}
              id={id}
              keys={cols[id].map((c) => c.key)}
              title={title}
              empty={empty}
              footer={(
                <AddCard
                  label={`Add to ${title}`}
                  placeholder={id === 'inbox' ? 'Capture a thought' : 'New task'}
                  needProject={id !== 'inbox' && active.length === 0}
                  pickProject={id !== 'inbox'}
                  projects={projects}
                  defaultProject={defaultProject}
                  onAdd={id === 'inbox'
                    ? (text) => apply((d) => addInboxItem(d, text, today))
                    : addTaskTo(id as 'todo' | 'tomorrow' | 'today')}
                  onCreateProject={createProject}
                  planFor={id === 'todo'}
                  openRequest={id === 'todo' && addRequest}
                  onOpenHandled={id === 'todo' ? onAddHandled : undefined}
                />
              )}
            >
              {cols[id].map((card) => renderCard(card, id))}
            </Column>
          ))}
        </div>
        {!hidden.includes('done') && (
          <DoneBar keys={cols.done.map((c) => c.key)} open={doneOpen} onToggle={() => onToggleDone?.()}>
            {cols.done.map((card) => renderCard(card, 'done'))}
          </DoneBar>
        )}
        <DragOverlay dropAnimation={dropAnimation()}>
          {dragging && <CardPreview card={dragging.card} column={dragging.column} />}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
