import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { boardColumns, searchCards, type Card as CardData, type ColumnId } from '../model/board'
import { parkTask, promoteInboxItem } from '../model/inbox'
import { addDays } from '../model/dates'
import { scheduleTask } from '../model/schedule'
import type { Change, FlowData } from '../model/types'
import { addDecision, createProject, updateProject } from '../model/projects'
import { doneOn, projectProgress, weekDates } from '../model/stats'
import { logFocus } from '../model/focus'
import { findTask, moveTask } from '../model/tasks'
import { appendNotes } from '../model/notes'
import { planSuggestions } from '../model/plan'
import { aiErrorDetail, createAiClient, DEFAULT_MODEL, isAiModel, type AiClient, type AiModel } from '../ai/claude'
import { logIssue } from '../storage/flowRepo'
import { buildPlanPrompt, buildReviewPrompt } from '../ai/prompts'
import AiPanel, { AiActions, type AiKind } from './AiPanel'
import SettingsPanel from './SettingsPanel'
import { typingTarget } from './typing'
import type { FileStore } from '../storage/fileStore'
import type { ShortcutStatus } from '../shortcut'
import FocusBar from './FocusBar'
import { nextStep } from '../model/steps'
import BoardView from './BoardView'
import ProgressView from './ProgressView'
import NotesPanel from './NotesPanel'
import NotesView from './NotesView'
import WeeklyReview from './WeeklyReview'
import { focusProjectThisWeek } from '../model/review-week'
import ProjectHeader from './ProjectHeader'
import ProjectPicker from './ProjectPicker'
import SearchBox from './SearchBox'
import Sidebar, { type View } from './Sidebar'
import type { Settings } from './settings'
import { useFlow } from './useFlow'
import { useFocus } from './useFocus'
import { useStoredFlag } from './useStoredFlag'
import './theme.css'
import './board.css'

// The Week calendar is its own chunk (loaded the first time the Week view opens).
const WeekView = lazy(() => import('./WeekView'))

/** Handle for host shells (Tauri) to push changes into the board. Returns an optional cleanup. */
export interface BoardApi { apply: ReturnType<typeof useFlow>['apply']; today: () => string }
interface Props {
  store: FileStore
  settings: Settings
  now?: () => Date
  onReady?: (api: BoardApi) => void | (() => void)
  /** Claude client for an API key; defaults to the real SDK client. */
  ai?: (apiKey: string) => AiClient
  /** Quick-capture shortcut state for the Settings status line (Tauri only). */
  shortcut?: ShortcutStatus
}

/** Columns an inbox item can be promoted into (Tomorrow = To do planned for tomorrow; Done = done today). */
export type PromoteTo = 'todo' | 'today' | 'tomorrow' | 'done'

const mergeChanges = (a: Change, b: Change): Change => ({ data: b.data, changed: [...new Set([...a.changed, ...b.changed])] })

/** Plan a task for tomorrow (a Done task is first reopened in To do); one Change. Board moves keep a Week time. */
function planTomorrow(d: FlowData, ref: string, today: string): Change {
  const found = findTask(d, ref)
  const reopened = found?.task.status === 'done' ? moveTask(d, ref, 'todo', today) : { data: d, changed: [] }
  return mergeChanges(reopened, scheduleTask(reopened.data, ref, addDays(today, 1), today, { keepTime: true }))
}

export interface DropContext {
  flow: ReturnType<typeof useFlow>
  openPicker(itemId: string, to: PromoteTo, index?: number): void
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
    if (to === 'inbox') reorder(flow, cardKey, from, to, index, cardKey, query)
    // The picker opens even with no active project: it can create one ("+ New project").
    else ctx.openPicker(cardKey.slice('inbox/'.length), to, index)
    return
  }
  if (to === 'inbox') {
    // "Park it": the task becomes a Parking lot item, placed where it was dropped.
    let itemId: string | undefined
    flow.apply((d) => { const c = parkTask(d, cardKey, flow.today); itemId = c.itemId; return c })
    if (itemId) reorder(flow, cardKey, from, to, index, `inbox/${itemId}`, query)
    return
  }
  if (to === 'tomorrow' && from !== 'tomorrow') flow.apply((d) => planTomorrow(d, cardKey, flow.today))
  else if (from === 'tomorrow' && to === 'todo') flow.apply((d) => scheduleTask(d, cardKey, null, flow.today, { keepTime: true }))
  else if (to !== from) flow.apply((d) => moveTask(d, cardKey, to === 'tomorrow' ? 'todo' : to, flow.today))
  reorder(flow, cardKey, from, to, index, cardKey, query)
}

/** Picker state and the promotion it performs once a project is chosen (or created in the picker). */
export function usePromotion(flow: ReturnType<typeof useFlow>, query = '') {
  const [pending, setPending] = useState<{ itemId: string; to: PromoteTo; index: number } | null>(null)
  const openPicker = (itemId: string, to: PromoteTo, index = Number.MAX_SAFE_INTEGER) =>
    setPending({ itemId, to, index })
  /** One apply: optionally create the project (`create` = its title), then promote into it. */
  const promote = (target: { slug: string } | { create: string }) => {
    if (!pending || !flow.data) return
    const { itemId, to } = pending
    let slug = 'slug' in target ? target.slug : ''
    let newKey: string | null = null
    flow.apply((d) => {
      let base: Change = { data: d, changed: [] }
      if ('create' in target) {
        const created = createProject(d, target.create, flow.today)
        if (!created.slug) return base
        slug = created.slug
        base = created
      }
      const before = new Set(base.data.projects[slug]?.tasks.map((t) => t.id))
      const c = promoteInboxItem(base.data, itemId, slug, to === 'tomorrow' ? 'todo' : to, flow.today)
      // All or nothing: a project made here only exists together with its promoted task.
      if (c.changed.length === 0) return { data: d, changed: [] }
      const added = c.data.projects[slug]?.tasks.find((t) => !before.has(t.id))
      if (added) newKey = `${slug}/${added.id}`
      const promoted = mergeChanges(base, c)
      // Tomorrow: the new To do task is planned for the next day in the same save.
      if (newKey && to === 'tomorrow') return mergeChanges(promoted, scheduleTask(promoted.data, newKey, addDays(flow.today, 1), flow.today))
      return promoted
    })
    if (newKey) {
      flow.remember(slug)
      reorder(flow, `inbox/${itemId}`, 'inbox', to, pending.index, newKey, query)
    }
    setPending(null)
  }
  const projects = flow.data
    ? Object.values(flow.data.projects).filter((p) => p.status === 'active').map((p) => ({ slug: p.slug, title: p.title }))
    : []
  const picker = pending && (
    <ProjectPicker projects={projects} onChoose={(slug) => promote({ slug })} onCreate={(title) => promote({ create: title })}
      onCancel={() => setPending(null)} />
  )
  const label = pending ? (pending.to === 'done' ? 'Done in which project?' : 'Move to which project?') : null
  return { openPicker, picker, label }
}

/** Views the app reopens on; Settings and the Weekly review are one-off visits, so the next start opens the Board. */
const isRestorableView = (v: unknown): v is View =>
  v === 'board' || v === 'week' || v === 'progress' || v === 'notes'

/** The owner's Claude key and model from local settings (never the Flow folder). */
function useAiSettings(settings: Settings) {
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [model, setModelState] = useState<AiModel>(DEFAULT_MODEL)
  useEffect(() => {
    let cancelled = false
    void Promise.all([settings.get<unknown>('anthropicApiKey'), settings.get<unknown>('aiModel')]).then(([k, m]) => {
      if (cancelled) return
      if (typeof k === 'string' && k !== '') setApiKey(k)
      if (isAiModel(m)) setModelState(m)
    })
    return () => { cancelled = true }
  }, [settings])
  const saveKey = (key: string) => { setApiKey(key); void settings.set('anthropicApiKey', key) }
  const removeKey = () => { setApiKey(null); void settings.set('anthropicApiKey', null) }
  const setModel = (m: AiModel) => { setModelState(m); void settings.set('aiModel', m) }
  return { apiKey, model, saveKey, removeKey, setModel }
}

const COLUMN_IDS: readonly ColumnId[] = ['inbox', 'todo', 'today', 'tomorrow', 'done']

/** The four real board columns; the Done bar is hidden or shown on its own. */
export const BOARD_COLUMN_IDS: readonly ColumnId[] = COLUMN_IDS.filter((id) => id !== 'done')

/**
 * Stored `hiddenColumns`, cleaned: known ids only, and never all four columns (one always stays
 * visible; the Done bar does not count, so it can be hidden on its own).
 */
export function cleanHiddenColumns(v: unknown): ColumnId[] {
  if (!Array.isArray(v)) return []
  const hidden = COLUMN_IDS.filter((id) => v.includes(id))
  return BOARD_COLUMN_IDS.every((id) => hidden.includes(id)) ? hidden.filter((id) => !BOARD_COLUMN_IDS.includes(id)) : hidden
}

/** Which board columns are hidden, from local settings (never the Flow folder). */
function useHiddenColumns(settings: Settings) {
  const [hidden, setHidden] = useState<ColumnId[]>([])
  const chosen = useRef(false)
  useEffect(() => {
    let cancelled = false
    void settings.get<unknown>('hiddenColumns').then((v) => {
      if (!cancelled && !chosen.current) setHidden(cleanHiddenColumns(v))
    })
    return () => { cancelled = true }
  }, [settings])
  const hiddenRef = useRef(hidden)
  hiddenRef.current = hidden
  const setVisible = useCallback((id: ColumnId, visible: boolean) => {
    chosen.current = true
    const cur = hiddenRef.current
    const next = cleanHiddenColumns(visible ? cur.filter((c) => c !== id) : [...cur, id])
    hiddenRef.current = next
    setHidden(next)
    void settings.set('hiddenColumns', next)
  }, [settings])
  return { hidden, setVisible }
}

export default function Board({ store, settings, now, onReady, ai, shortcut }: Props) {
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
  const aiSettings = useAiSettings(settings)
  const columns = useHiddenColumns(settings)
  const [doneOpen, toggleDone] = useStoredFlag(settings, 'doneBarOpen', true)
  const [trayOpen, toggleTray] = useStoredFlag(settings, 'weekTrayOpen', true)
  const todoVisible = !columns.hidden.includes('todo')
  const aiClient = useMemo(() => (aiSettings.apiKey ? (ai ?? createAiClient)(aiSettings.apiKey) : null), [ai, aiSettings.apiKey])
  const [aiRun, setAiRun] = useState<{ id: number; kind: AiKind; prompt: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    void settings.get<unknown>('view').then((v) => {
      if (!cancelled && !viewChosen.current && isRestorableView(v)) setViewState(v)
    })
    return () => { cancelled = true }
  }, [settings])

  // The AI panel belongs to the view it was opened from (and would crowd the board).
  useEffect(() => setAiRun(null), [view])

  const setView = useCallback((v: View) => {
    viewChosen.current = true
    setViewState(v)
    void settings.set('view', isRestorableView(v) ? v : 'board')
  }, [settings])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (typingTarget(document.activeElement)) return
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus() }
      else if (e.key === 'n') { if (!todoVisible) return; e.preventDefault(); setView('board'); setAddRequest(true) }
      else if (e.key === 'b') { e.preventDefault(); setView('board') }
      else if (e.key === 'p') { e.preventDefault(); setView('progress') }
      else if (e.key === 'o') { e.preventDefault(); setView('notes') }
      else if (e.key === 'w') { e.preventDefault(); setView('week') }
      else if (e.key === 'r') { e.preventDefault(); setView('review') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setView, todoVisible])

  // The top bar's left slot: the project header on the Board, the week header on Week.
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null)

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
  const openAi = (kind: AiKind) => setAiRun((cur) => ({
    id: (cur?.id ?? 0) + 1, kind, prompt: kind === 'review' ? buildReviewPrompt(data, today) : buildPlanPrompt(data, today),
  }))
  const aiActions = (withPlan: boolean) => (
    <AiActions ready={!!aiClient} onReview={() => openAi('review')} onPlan={withPlan ? () => openAi('plan') : undefined}
      onSetup={() => setView('settings')} />
  )
  const saveReviewToNotes = (text: string) => {
    let ok = false
    apply((d) => { const c = appendNotes(d, `Claude review ${today}`, text); ok = c.changed.length > 0; return c })
    return ok
  }
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
        focusSlug={focusProjectThisWeek(data, today)}
        onFilter={setFilter}
        onCreate={(t) => { const s = createProjectNamed(t); if (s) setFilter(null) }}
        onUpdate={(slug, patch) => apply((d) => updateProject(d, slug, patch))}
        onDelete={(slug) => { void flow.removeProject(slug) }}
      />
      <main className="main">
        <div className="topbar">
          <div className="header-slot" ref={setHeaderSlot}>
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
              pickerLabel={promotion.label ?? undefined}
              onDrop={(args) => handleDrop(args, { flow, openPicker: promotion.openPicker, query })}
              createProject={createProjectNamed}
              addRequest={addRequest}
              onAddHandled={clearAddRequest}
              onFocus={(ref, title) => focus.start(ref, title)}
              focusRef={focus.state?.finished ? null : focus.state?.ref}
              hidden={columns.hidden}
              doneOpen={doneOpen}
              onToggleDone={toggleDone}
            />
          ) : view === 'week' ? (
            <Suspense fallback={null}><WeekView flow={flow} trayOpen={trayOpen} onToggleTray={toggleTray} headerSlot={headerSlot} now={clock} /></Suspense>
          ) : view === 'notes' ? (
            <NotesView data={data} apply={apply} initial={filter} />
          ) : view === 'review' ? (
            <WeeklyReview data={data} today={today} apply={apply} onFinish={() => setView('board')} aiSlot={aiActions(true)} />
          ) : view === 'settings' ? (
            <SettingsPanel hasKey={!!aiSettings.apiKey} model={aiSettings.model}
              onSaveKey={aiSettings.saveKey} onRemoveKey={aiSettings.removeKey} onModel={aiSettings.setModel}
              hiddenColumns={columns.hidden} onColumnVisible={columns.setVisible} shortcut={shortcut} />
          ) : (
            <ProgressView data={data} today={today} apply={apply} aiSlot={aiActions(true)} />
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
        {aiRun && aiClient && (
          <AiPanel
            key={aiRun.id}
            kind={aiRun.kind}
            client={aiClient}
            model={aiSettings.model}
            prompt={aiRun.prompt}
            onClose={() => setAiRun(null)}
            onSaveNotes={saveReviewToNotes}
            onError={(e) => { const detail = aiErrorDetail(e); if (detail) void logIssue(store, 'claude', detail) }}
            onAdd={(list) => {
              let added = list.map(() => false)
              apply((d) => { const c = planSuggestions(d, list, today, focusProjectThisWeek(d, today)); added = c.added; return c })
              return added
            }}
          />
        )}
        </div>
      </main>
    </div>
  )
}
