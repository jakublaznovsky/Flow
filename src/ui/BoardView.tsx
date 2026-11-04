import type { ReactNode } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { boardColumns, searchCards, type Card as CardData, type ColumnId } from '../model/board'
import { addInboxItem, deleteInboxItem, editInboxItem } from '../model/inbox'
import { addTask, changeTaskProject, deleteTask, editTask, moveTask } from '../model/tasks'
import AddCard from './AddCard'
import Card from './Card'
import Column from './Column'
import type { useFlow } from './useFlow'

export const COLUMNS: { id: ColumnId; title: string; empty: string }[] = [
  { id: 'inbox', title: 'Parking lot', empty: 'Nothing parked' },
  { id: 'todo', title: 'To do', empty: 'Nothing to do' },
  { id: 'today', title: 'Today', empty: 'pick up to 3' },
  { id: 'done', title: 'Done', empty: 'Done today shows here' },
]

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
}

export default function BoardView({ flow, query, picker, onDrop, createProject, addRequest, onAddHandled, onFocus, focusRef }: Props) {
  const { data, today, filter, order, lastProject, remember, apply } = flow
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  if (!data) return null

  const active = Object.values(data.projects).filter((p) => p.status === 'active')
  const projects = active.map((p) => ({ slug: p.slug, title: p.title }))
  const cols = searchCards(boardColumns(data, today, filter, order), query)
  const columnOf = (key: string): ColumnId | undefined =>
    COLUMNS.find(({ id }) => cols[id].some((c) => c.key === key))?.id

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return
    const cardKey = String(e.active.id)
    const from = columnOf(cardKey)
    const overId = String(e.over.id)
    const overCol = COLUMNS.find(({ id }) => id === overId)?.id ?? columnOf(overId)
    if (!from || !overCol) return
    const overIdx = cols[overCol].findIndex((c) => c.key === overId)
    const index = overIdx >= 0 ? overIdx : cols[overCol].length
    onDrop({ cardKey, from, to: overCol, index })
  }
  const defaultProject =
    filter ?? (lastProject && active.some((p) => p.slug === lastProject) ? lastProject : null) ?? active[0]?.slug ?? null

  const addTaskTo = (status: 'todo' | 'today') => (title: string, slug: string | null) => {
    if (!slug) return
    remember(slug)
    apply((d) => addTask(d, slug, title, status, today))
  }
  const saveCard = (card: CardData, patch: { title: string; firstStep: string; project: string }) => {
    if (card.kind === 'inbox') {
      apply((d) => editInboxItem(d, card.key.slice('inbox/'.length), patch.title))
      return
    }
    // One apply (one save) for the edit and the optional project change.
    apply((d) => {
      const edited = editTask(d, card.key, { title: patch.title, firstStep: patch.firstStep }, today)
      if (!patch.project || patch.project === card.projectSlug) return edited
      const moved = changeTaskProject(edited.data, card.key, patch.project)
      return { data: moved.data, changed: [...new Set([...edited.changed, ...moved.changed])] }
    })
  }
  const deleteCard = (card: CardData) => {
    if (card.kind === 'inbox') apply((d) => deleteInboxItem(d, card.key.slice('inbox/'.length)))
    else apply((d) => deleteTask(d, card.key))
  }

  return (
    <div className="board-view">
      {picker && (
        <div className="picker-wrap">
          <span className="picker-label" aria-hidden="true">Move to which project?</span>
          {picker}
        </div>
      )}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="columns">
          {COLUMNS.map(({ id, title, empty }) => (
            <Column
              key={id}
              id={id}
              keys={cols[id].map((c) => c.key)}
              title={title}
              empty={empty}
              footer={id === 'done' ? undefined : (
                <AddCard
                  label={`Add to ${title}`}
                  placeholder={id === 'inbox' ? 'Capture a thought' : 'New task'}
                  needProject={id !== 'inbox' && active.length === 0}
                  pickProject={id !== 'inbox'}
                  projects={projects}
                  defaultProject={defaultProject}
                  onAdd={id === 'inbox'
                    ? (text) => apply((d) => addInboxItem(d, text, today))
                    : addTaskTo(id)}
                  onCreateProject={createProject}
                  openRequest={id === 'todo' && addRequest}
                  onOpenHandled={id === 'todo' ? onAddHandled : undefined}
                />
              )}
            >
              {cols[id].map((card) => (
                <Card
                  key={card.key}
                  card={card}
                  column={id}
                  projects={projects}
                  onToggle={() => apply((d) => moveTask(d, card.key, id === 'done' ? 'today' : 'done', today))}
                  onSave={(patch) => saveCard(card, patch)}
                  onDelete={() => deleteCard(card)}
                  onFocus={onFocus ? () => onFocus(card.key, card.title) : undefined}
                  inFocus={card.key === focusRef}
                />
              ))}
            </Column>
          ))}
        </div>
      </DndContext>
    </div>
  )
}
