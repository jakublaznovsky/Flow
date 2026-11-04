import { useCallback, useEffect, useRef, useState } from 'react'
import { boardColumns, searchCards, type Card as CardData, type ColumnId } from '../model/board'
import { promoteInboxItem } from '../model/inbox'
import { addDecision, createProject, updateProject } from '../model/projects'
import { doneOn, projectProgress, weekDates } from '../model/stats'
import { logFocus } from '../model/focus'
import { findTask, moveTask } from '../model/tasks'
import type { FileStore } from '../storage/fileStore'
import FocusBar from './FocusBar'
import { nextStep } from '../model/steps'
import BoardView from './BoardView'
import ProgressView from './ProgressView'
import NotesPanel from './NotesPanel'
import NotesView from './NotesView'
import ProjectHeader from './ProjectHeader'
import ProjectPicker from './ProjectPicker'
import SearchBox from './SearchBox'
import Sidebar, { type View } from './Sidebar'
import type { Settings } from './settings'
import { useFlow } from './useFlow'
import { useFocus } from './useFocus'
import './theme.css'
import './board.css'

/** Handle for host shells (Tauri) to push changes into the board. Returns an optional cleanup. */
export interface BoardApi { apply: ReturnType<typeof useFlow>['apply']; today: () => string }
interface Props { store: FileStore; settings: Settings; now?: () => Date; onReady?: (api: BoardApi) => void | (() => void) }

export interface DropContext {
  flow: ReturnType<typeof useFlow>
  openPicker(itemId: string, to: 'todo' | 'today', index?: number): void
  /** Active search text; drop indexes are positions among the cards it leaves visible. */
  query?: string
}

/**
 * Store the column order after a drop. `index` is a position among the visible (filtered and
 * searched) cards; the order is built from all cards so hidden cards keep their place.
 */
function reorder(flow: ReturnType<typeof useFlow>, cardKey: string, from: ColumnId, to: ColumnId, index: number, insertKey = cardKey, query = '') {
  if (!flow.data) return
  const all = boardColumns(flow.data, flow.today, null, flow.order)
  const visible = searchCards(boardColumns(flow.data, flow.today, flow.filter, flow.order), query)
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
  const { flow, query } = ctx
  if (!flow.data) return
  if (from === 'inbox') {
    const hasProject = Object.values(flow.data.projects).some((p) => p.status === 'active')
    if (to === 'inbox') reorder(flow, cardKey, from, to, index, cardKey, query)
    // With no active project there is nothing to pick, so the drop is rejected.
    else if ((to === 'todo' || to === 'today') && hasProject) ctx.openPicker(cardKey.slice('inbox/'.length), to, index)
    return
  }
  if (to === 'inbox') return
  if (to !== from) flow.apply((d) => moveTask(d, cardKey, to, flow.today))
  reorder(flow, cardKey, from, to, index, cardKey, query)
}

/** Picker state and the promotion it performs once a project is chosen. */
export function usePromotion(flow: ReturnType<typeof useFlow>, query = '') {
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
      reorder(flow, `inbox/${pending.itemId}`, 'inbox', pending.to, pending.index, newKey, query)
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

const isView = (v: unknown): v is View => v === 'board' || v === 'progress' || v === 'notes'

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'])

/** True while focus is in a text field (typed letters belong to it, not to shortcuts). */
function typingTarget(el: Element | null): boolean {
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type)
  return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable)
}

export default function Board({ store, settings, now, onReady }: Props) {
  const flow = useFlow(store, settings, now)
  const { data, today, filter, setFilter, remember, apply } = flow
  const todayRef = useRef(today)
  todayRef.current = today
  useEffect(() => onReady?.({ apply, today: () => todayRef.current }), [onReady, apply])
  const clock = useCallback(() => (now ?? (() => new Date()))(), [now])
  const focus = useFocus((ref, m) => apply((d) => logFocus(d, ref, m, todayRef.current)), clock)
  const [query, setQuery] = useState('')
  const promotion = usePromotion(flow, query)
  const [view, setViewState] = useState<View>('board')
  const [notesOpen, setNotesOpen] = useState(false)
  const [addRequest, setAddRequest] = useState(false)
  const clearAddRequest = useCallback(() => setAddRequest(false), [])
  const searchRef = useRef<HTMLInputElement>(null)
  const viewChosen = useRef(false)

  useEffect(() => {
    let cancelled = false
    void settings.get<unknown>('view').then((v) => {
      if (!cancelled && !viewChosen.current && isView(v)) setViewState(v)
    })
    return () => { cancelled = true }
  }, [settings])

  const setView = useCallback((v: View) => {
    viewChosen.current = true
    setViewState(v)
    void settings.set('view', v)
  }, [settings])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (typingTarget(document.activeElement)) return
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus() }
      else if (e.key === 'n') { e.preventDefault(); setView('board'); setAddRequest(true) }
      else if (e.key === 'b') { e.preventDefault(); setView('board') }
      else if (e.key === 'p') { e.preventDefault(); setView('progress') }
      else if (e.key === 'o') { e.preventDefault(); setView('notes') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setView])

  if (!data) return <div className="app loading"><span className="brand-name">Flow</span></div>

  const all = Object.values(data.projects)
  const active = all.filter((p) => p.status === 'active')
  const progress = Object.fromEntries(active.map((p) => [p.slug, projectProgress(data, p.slug, today)]))

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
  const focusTask = focus.state ? findTask(data, focus.state.ref)?.task : undefined
  const focused = filter ? data.projects[filter] : undefined
  const showHeader = view === 'board' && !!focused
  const showNotes = showHeader && notesOpen
  const doneThisWeek = focused
    ? weekDates(today).reduce((n, date) => n + doneOn(data, date).filter((e) => e.ref.startsWith(`${focused.slug}/`)).length, 0)
    : 0
  const onSearch = (q: string) => {
    setQuery(q)
    if (q.trim() && view !== 'board') setView('board')
  }

  return (
    <div className="shell">
      <Sidebar
        view={view}
        onView={setView}
        projects={active}
        hidden={all.filter((p) => p.status !== 'active')}
        progress={progress}
        filter={filter}
        onFilter={setFilter}
        onCreate={(t) => { const s = createProjectNamed(t); if (s) setFilter(null) }}
        onUpdate={(slug, patch) => apply((d) => updateProject(d, slug, patch))}
      />
      <main className="main">
        <div className="topbar">
          <div className="header-slot">
            {showHeader && focused && (
              <ProjectHeader
                project={focused}
                done={progress[focused.slug]?.done ?? projectProgress(data, focused.slug, today).done}
                total={progress[focused.slug]?.total ?? projectProgress(data, focused.slug, today).total}
                doneThisWeek={doneThisWeek}
                notesOpen={showNotes}
                onToggleNotes={() => setNotesOpen((o) => !o)}
                onGoal={(goal) => apply((d) => updateProject(d, focused.slug, { goal }))}
              />
            )}
          </div>
          <SearchBox ref={searchRef} value={query} onChange={onSearch} />
        </div>
        <div className="focus-slot">
          <FocusBar
            focus={focus}
            nextStep={focusTask ? nextStep(focusTask) : undefined}
            onMarkDone={(ref) => { apply((d) => moveTask(d, ref, 'done', today)); focus.close() }}
          />
        </div>
        <div className="content">
        <div className="view">
          {view === 'board' ? (
            <BoardView
              flow={flow}
              query={query}
              picker={promotion.picker}
              onDrop={(args) => handleDrop(args, { flow, openPicker: promotion.openPicker, query })}
              createProject={createProjectNamed}
              addRequest={addRequest}
              onAddHandled={clearAddRequest}
              onFocus={(ref, title) => focus.start(ref, title)}
              focusRef={focus.state?.finished ? null : focus.state?.ref}
            />
          ) : view === 'notes' ? (
            <NotesView data={data} apply={apply} initial={filter} />
          ) : (
            <ProgressView data={data} today={today} apply={apply} />
          )}
        </div>
        {showNotes && focused && (
          <NotesPanel
            key={focused.slug}
            body={focused.body}
            onSaveBody={(body) => apply((d) => updateProject(d, focused.slug, { body }))}
            onAddDecision={(text) => apply((d) => addDecision(d, focused.slug, text, today))}
            onClose={() => setNotesOpen(false)}
          />
        )}
        </div>
      </main>
    </div>
  )
}
