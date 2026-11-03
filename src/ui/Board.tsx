import { useEffect, useRef, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { boardColumns, type Card as CardData, type ColumnId } from '../model/board'
import { addInboxItem, deleteInboxItem, editInboxItem, promoteInboxItem } from '../model/inbox'
import { createProject, updateProject } from '../model/projects'
import { addTask, changeTaskProject, deleteTask, editTask, moveTask } from '../model/tasks'
import type { FileStore } from '../storage/fileStore'
import AddCard from './AddCard'
import Card from './Card'
import Column from './Column'
import ProjectBar from './ProjectBar'
import ProjectPicker from './ProjectPicker'
import type { Settings } from './settings'
import { useFlow } from './useFlow'
import './board.css'

/** Handle for host shells (Tauri) to push changes into the board. Returns an optional cleanup. */
export interface BoardApi { apply: ReturnType<typeof useFlow>['apply']; today: () => string }
interface Props { store: FileStore; settings: Settings; now?: () => Date; onReady?: (api: BoardApi) => void | (() => void) }

const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: 'inbox', title: 'Parking lot' },
  { id: 'todo', title: 'To do' },
  { id: 'today', title: 'Today' },
  { id: 'done', title: 'Done' },
]

export interface DropContext {
  flow: ReturnType<typeof useFlow>
  openPicker(itemId: string, to: 'todo' | 'today', index?: number): void
}

/**
 * Store the column order after a drop. `index` is a position among the visible (filtered) cards;
 * the order is built from all cards so cards hidden by the project filter keep their place.
 */
function reorder(flow: ReturnType<typeof useFlow>, cardKey: string, from: ColumnId, to: ColumnId, index: number, insertKey = cardKey) {
  if (!flow.data) return
  const all = boardColumns(flow.data, flow.today, null, flow.order)
  const visible = boardColumns(flow.data, flow.today, flow.filter, flow.order)
  const others = (cards: CardData[]) => cards.map((c) => c.key).filter((k) => k !== cardKey && k !== insertKey)
  const keys = others(all[to])
  const shown = others(visible[to])
  const at = index < shown.length
    ? keys.indexOf(shown[Math.max(0, index)])
    : shown.length > 0 ? keys.indexOf(shown[shown.length - 1]) + 1 : keys.length
  keys.splice(at, 0, insertKey)
  const next = { ...flow.order, [to]: keys }
  if (from !== to) next[from] = all[from].map((c) => c.key).filter((k) => k !== cardKey)
  flow.setOrder(next)
}

export function handleDrop(
  args: { cardKey: string; from: ColumnId; to: ColumnId; index: number }, ctx: DropContext,
): void {
  const { cardKey, from, to, index } = args
  const { flow } = ctx
  if (!flow.data) return
  if (from === 'inbox') {
    const hasProject = Object.values(flow.data.projects).some((p) => p.status === 'active')
    if (to === 'inbox') reorder(flow, cardKey, from, to, index)
    // With no active project there is nothing to pick, so the drop is rejected.
    else if ((to === 'todo' || to === 'today') && hasProject) ctx.openPicker(cardKey.slice('inbox/'.length), to, index)
    return
  }
  if (to === 'inbox') return
  if (to !== from) flow.apply((d) => moveTask(d, cardKey, to, flow.today))
  reorder(flow, cardKey, from, to, index)
}

/** Picker state and the promotion it performs once a project is chosen. */
export function usePromotion(flow: ReturnType<typeof useFlow>) {
  const [pending, setPending] = useState<{ itemId: string; to: 'todo' | 'today'; index: number } | null>(null)
  const openPicker = (itemId: string, to: 'todo' | 'today', index = Number.MAX_SAFE_INTEGER) =>
    setPending({ itemId, to, index })
  const choose = (slug: string) => {
    if (!pending || !flow.data) return
    const before = new Set(flow.data.projects[slug]?.tasks.map((t) => t.id))
    let newKey: string | null = null
    flow.apply((d) => {
      const c = promoteInboxItem(d, pending.itemId, slug, pending.to, flow.today)
      const added = c.data.projects[slug]?.tasks.find((t) => !before.has(t.id))
      if (c.changed.length > 0 && added) newKey = `${slug}/${added.id}`
      return c
    })
    if (newKey) {
      flow.remember(slug)
      reorder(flow, `inbox/${pending.itemId}`, 'inbox', pending.to, pending.index, newKey)
    }
    setPending(null)
  }
  const projects = flow.data
    ? Object.values(flow.data.projects).filter((p) => p.status === 'active').map((p) => ({ slug: p.slug, title: p.title }))
    : []
  const picker = pending && (
    <ProjectPicker projects={projects} onChoose={choose} onCancel={() => setPending(null)} />
  )
  return { openPicker, picker, pendingTo: pending?.to ?? null }
}

export default function Board({ store, settings, now, onReady }: Props) {
  const flow = useFlow(store, settings, now)
  const { data, today, filter, setFilter, order, lastProject, remember, apply } = flow
  const todayRef = useRef(today)
  todayRef.current = today
  useEffect(() => onReady?.({ apply, today: () => todayRef.current }), [onReady, apply])
  const promotion = usePromotion(flow)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  if (!data) return <div className="app"><h1>Flow</h1></div>

  const active = Object.values(data.projects).filter((p) => p.status === 'active')
  const projects = active.map((p) => ({ slug: p.slug, title: p.title }))
  const cols = boardColumns(data, today, filter, order)
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
    handleDrop({ cardKey, from, to: overCol, index }, { flow, openPicker: promotion.openPicker })
  }
  const defaultProject =
    filter ?? (lastProject && active.some((p) => p.slug === lastProject) ? lastProject : null) ?? active[0]?.slug ?? null

  const addTaskTo = (status: 'todo' | 'today') => (title: string, slug: string | null) => {
    if (!slug) return
    remember(slug)
    apply((d) => addTask(d, slug, title, status, today))
  }
  const createProjectNamed = (title: string): string => {
    let slug = ''
    apply((d) => {
      const c = createProject(d, title, today)
      slug = c.slug
      return c
    })
    if (slug) remember(slug)
    return slug
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
    <div className="app">
      <header className="top">
        <h1>Flow</h1>
        <ProjectBar
          projects={active}
          hidden={Object.values(data.projects).filter((p) => p.status !== 'active')}
          filter={filter}
          onFilter={setFilter}
          onCreate={(t) => { const s = createProjectNamed(t); if (s) setFilter(null) }}
          onUpdate={(slug, patch) => apply((d) => updateProject(d, slug, patch))}
        />
      </header>
      {promotion.picker && <div className="picker-wrap">{promotion.picker}</div>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <main className="columns">
        {COLUMNS.map(({ id, title }) => (
          <Column
            key={id}
            id={id}
            keys={cols[id].map((c) => c.key)}
            title={title}
            hint={id === 'today' && cols.today.length === 0 ? 'pick up to 3' : undefined}
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
                onCreateProject={createProjectNamed}
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
              />
            ))}
          </Column>
        ))}
      </main>
      </DndContext>
    </div>
  )
}
