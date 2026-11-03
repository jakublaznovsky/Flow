import { boardColumns, type Card as CardData, type ColumnId } from '../model/board'
import { addInboxItem, deleteInboxItem } from '../model/inbox'
import { createProject, updateProject } from '../model/projects'
import { addTask, changeTaskProject, deleteTask, editTask, moveTask } from '../model/tasks'
import type { FileStore } from '../storage/fileStore'
import AddCard from './AddCard'
import Card from './Card'
import Column from './Column'
import ProjectBar from './ProjectBar'
import type { Settings } from './settings'
import { useFlow } from './useFlow'
import './board.css'

interface Props { store: FileStore; settings: Settings; now?: () => Date }

const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: 'inbox', title: 'Parking lot' },
  { id: 'todo', title: 'To do' },
  { id: 'today', title: 'Today' },
  { id: 'done', title: 'Done' },
]

export default function Board({ store, settings, now }: Props) {
  const { data, today, filter, setFilter, order, lastProject, remember, apply } = useFlow(store, settings, now)
  if (!data) return <div className="app"><h1>Flow</h1></div>

  const active = Object.values(data.projects).filter((p) => p.status === 'active')
  const projects = active.map((p) => ({ slug: p.slug, title: p.title }))
  const cols = boardColumns(data, today, filter, order)
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
    if (card.kind === 'inbox') return
    apply((d) => editTask(d, card.key, { title: patch.title, firstStep: patch.firstStep }, today))
    if (patch.project && patch.project !== card.projectSlug) {
      apply((d) => changeTaskProject(d, card.key, patch.project))
    }
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
          filter={filter}
          onFilter={setFilter}
          onCreate={(t) => { const s = createProjectNamed(t); if (s) setFilter(null) }}
          onUpdate={(slug, patch) => apply((d) => updateProject(d, slug, patch))}
        />
      </header>
      <main className="columns">
        {COLUMNS.map(({ id, title }) => (
          <Column
            key={id}
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
    </div>
  )
}
