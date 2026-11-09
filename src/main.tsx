import { StrictMode, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { addInboxItem } from './model/inbox'
import { addDays, isoWeek, localDate } from './model/dates'
import FolderSetup from './ui/FolderSetup'
import QuickCapture from './ui/QuickCapture'
import { logIssue } from './storage/flowRepo'
import type { BoardApi } from './ui/Board'
import { MemoryFileStore, type FileStore } from './storage/fileStore'
import { MemorySettings } from './ui/settings'
import { registerShortcut, type ShortcutStatus } from './shortcut'

// Browser dev: in-memory store seeded with example data, relative to today's local date.
const q = (v: string) => JSON.stringify(v)
interface SeedTask { id: string; title: string; status: 'todo' | 'today' | 'done'; first?: string; created: string; planned?: string; done?: string; scheduled?: string; time?: string; steps?: [string, boolean][] }
const taskYaml = (t: SeedTask) => [
  `  - id: ${t.id}`,
  `    title: ${q(t.title)}`,
  `    status: ${t.status}`,
  ...(t.first ? [`    first_step: ${q(t.first)}`] : []),
  `    created: ${t.created}`,
  ...(t.planned ? [`    planned: ${t.planned}`] : []),
  ...(t.done ? [`    done: ${t.done}`] : []),
  ...(t.scheduled ? [`    scheduled: ${t.scheduled}`] : []),
  ...(t.time ? [`    time: ${q(t.time)}`] : []),
  ...(t.steps ? ['    steps:', ...t.steps.flatMap(([text, done]) => [`      - text: ${q(text)}`, `        done: ${done}`])] : []),
].join('\n')
const projectFile = (title: string, color: string, goal: string, created: string, tasks: SeedTask[], body: string) =>
  `---\ntitle: ${q(title)}\nstatus: active\ncolor: ${q(color)}\ngoal: ${q(goal)}\ncreated: ${created}\ntasks:\n${tasks.map(taskYaml).join('\n')}\n---\n${body}\n`

function seedFiles(today: string): Record<string, string> {
  const ago = (n: number) => addDays(today, -n)
  const created = ago(30)
  const flowTasks: SeedTask[] = [
    { id: 't1', title: 'Design the data format', status: 'done', first: 'List what a project needs', created, planned: ago(9), done: ago(9) },
    { id: 't2', title: 'Set up Tauri project', status: 'done', created, planned: ago(5), done: ago(5) },
    { id: 't3', title: 'Build the week view', status: 'today', first: 'Draw seven columns on paper', created, planned: today,
      steps: [['Sketch the layout', true], ['Day columns', true], ['Unscheduled tray', false], ['Drag and drop', false]] },
    { id: 't4', title: 'Write the README', status: 'todo', created, scheduled: addDays(today, 1), time: '09:30-11:00' },
    { id: 't5', title: 'Try the weekly review', status: 'todo', first: 'Open it on Sunday', created },
  ]
  const spanishTasks: SeedTask[] = [
    { id: 't1', title: 'Pick a textbook', status: 'done', created, planned: ago(12), done: ago(12) },
    { id: 't2', title: 'Learn the 50 most common verbs', status: 'today', first: 'Make a list of ten', created, planned: today,
      steps: [['Ten verbs', true], ['Next ten', false], ['Next ten', false]] },
    { id: 't3', title: 'Find a language partner', status: 'todo', created },
    { id: 't4', title: 'Listen to one podcast episode', status: 'todo', created, scheduled: addDays(today, 2), time: '08:00-08:45' },
  ]
  const shedTasks: SeedTask[] = [
    { id: 't1', title: 'Measure the corner of the garden', status: 'done', created, planned: ago(2), done: ago(2) },
    { id: 't2', title: 'Order the wood', status: 'todo', first: 'Compare two shops', created },
    { id: 't3', title: 'Paint the fence', status: 'done', created, planned: today, done: today },
  ]
  const files: Record<string, string> = {
    'inbox.md': `---\nitems:\n  - id: i1\n    text: Look into Spanish podcasts\n    created: ${today}\n  - id: i2\n    text: Buy a new notebook\n    created: ${ago(1)}\n---\n`,
    'projects/flow-app.md': projectFile('Flow app', '#4f8cff', 'Build my own ADHD-friendly planner', created, flowTasks,
      `Keep it small and calm.\n\n## Decisions\n- ${ago(20)}: Build with Tauri, data as Markdown files.\n- ${ago(8)}: No streaks.`),
    'projects/learn-spanish.md': projectFile('Learn Spanish', '#3fb68b', 'Hold a 10 minute conversation by spring', created, spanishTasks, 'Twenty minutes a day beats two hours on Sunday.'),
    'projects/garden-shed.md': projectFile('Garden shed', '#f2994a', 'Build a small shed before winter', created, shedTasks, ''),
    'notes.md': `# General notes\n\nIdeas to come back to:\n\n- A calmer morning routine\n- Ask Sam about the allotment\n`,
  }
  // ~4 weeks of history: done entries and focus sessions (deterministic pattern, relative to today).
  const titles: [string, string, string][] = [
    ['flow-app/t1', 'Design the data format', 'Flow app'], ['flow-app/t2', 'Set up Tauri project', 'Flow app'],
    ['learn-spanish/t1', 'Pick a textbook', 'Learn Spanish'], ['garden-shed/t1', 'Measure the corner of the garden', 'Garden shed'],
  ]
  for (let i = 0; i <= 28; i++) {
    const date = ago(i)
    const count = i === 0 ? 1 : [0, 2, 1, 3, 0, 4, 1, 2, 5, 1, 0, 2, 3, 6][(i * 5) % 14]
    const minutes = i === 0 ? [25] : [25, 25, 45, 15, 25].slice(0, (i * 3) % 4)
    const done = Array.from({ length: count }, (_, k) => titles[(i + k) % titles.length])
    if (i === 0) done.splice(0, 1, ['garden-shed/t3', 'Paint the fence', 'Garden shed'])
    if (done.length === 0 && minutes.length === 0) continue
    const lines = ['---', `date: ${date}`]
    if (done.length) lines.push('done:', ...done.flatMap(([ref, title, project]) => [`  - ref: ${ref}`, `    title: ${q(title)}`, `    project: ${q(project)}`]))
    if (minutes.length) lines.push('focus:', ...minutes.flatMap((m, k) => [`  - ref: ${titles[(i + k) % titles.length][0]}`, `    title: ${q(titles[(i + k) % titles.length][1])}`, `    project: ${q(titles[(i + k) % titles.length][2])}`, `    minutes: ${m}`]))
    lines.push('---', i === 1 ? 'Slow start, good finish.' : '')
    files[`days/${date}.md`] = lines.join('\n') + '\n'
  }
  files[`reviews/${isoWeek(ago(7))}.md`] =
    `---\nweek: ${isoWeek(ago(7))}\nfocus_project: learn-spanish\nintention: Twenty minutes of Spanish every day\n---\nGood momentum on the app. Spanish slipped midweek; short sessions work better for me.\n`
  // A few week-only calendar items (Week view only), each in its ISO week's file.
  const items: [string, string, string][] = [
    ['Lunch with Sam', today, '12:30-13:30'], ['Dentist', addDays(today, 1), '14:00-14:45'], ['Swim', addDays(today, 3), '15:30-17:00'],
  ]
  items.forEach(([title, date, time], k) => {
    const path = `calendar/${isoWeek(date)}.md`
    files[path] ??= `---\nweek: ${q(isoWeek(date))}\nitems:\n`
    files[path] += `  - id: c${k + 1}\n    title: ${q(title)}\n    date: ${date}\n    time: ${q(time)}\n`
  })
  for (const path of Object.keys(files)) if (path.startsWith('calendar/')) files[path] += '---\n'
  return files
}

const store = new MemoryFileStore(seedFiles(localDate()))

const rootEl = document.getElementById('root')!

async function renderBrowser() {
  const settings = new MemorySettings()
  // Dev-only `?fakeAi=1`: a canned Claude client (no key, no network) for checking the AI panel by eye.
  let ai: ComponentProps<typeof App>['ai']
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('fakeAi')) {
    const { fakeAiClient } = await import('./ai/fake')
    await settings.set('anthropicApiKey', 'fake')
    ai = () => fakeAiClient
  }
  createRoot(rootEl).render(
    <StrictMode>
      <App store={store} settings={settings} ai={ai} />
    </StrictMode>,
  )
}

// Tauri-only modules are imported dynamically so the browser build/tests never load them.
async function renderTauri() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const { emit, listen } = await import('@tauri-apps/api/event')
  const { invoke } = await import('@tauri-apps/api/core')
  const label = getCurrentWindow().label

  if (label === 'capture') {
    const win = getCurrentWindow()
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') void win.hide() })
    createRoot(rootEl).render(
      <StrictMode>
        <QuickCapture onSubmit={(text) => { void emit('flow:capture', text).then(() => win.hide()) }} />
      </StrictMode>,
    )
    return
  }

  const [{ exists }, { open }, { register, unregister }, { Window }, { TauriSettings }, { TauriFileStore }] = await Promise.all([
    import('@tauri-apps/plugin-fs'),
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-global-shortcut'),
    import('@tauri-apps/api/window'),
    import('./tauriSettings'),
    import('./storage/tauriFileStore'),
  ])
  const settings = new TauriSettings()
  const SHORTCUT = 'CommandOrControl+Shift+Space'
  const SHORTCUT_LABEL = /Mac/i.test(navigator.userAgent) ? 'Cmd+Shift+Space' : 'Ctrl+Shift+Space'

  // Registered once per app run, outside React (StrictMode would register → unregister → register).
  // The global shortcut shows and focuses the capture window; only failures reach the issue log.
  const registerQuickCapture = (store: FileStore) => registerShortcut(
    {
      register: (acc, handler) => register(acc, (ev) => { if (ev.state === 'Pressed') handler() }),
      unregister: (acc) => unregister(acc),
    },
    SHORTCUT,
    () => {
      void Window.getByLabel('capture').then(async (cap) => {
        await cap?.show()
        await cap?.setFocus()
      }).catch(() => {})
    },
    (reason) => { void logIssue(store, 'shortcut', reason) },
  )

  // App's onReady only listens for captured text, which lands in the inbox.
  const onReady = (board: BoardApi) => {
    let un: (() => void) | undefined
    let cancelled = false
    void listen<string>('flow:capture', (ev) => board.apply((d) => addInboxItem(d, ev.payload, board.today()))).then((f) => {
      if (cancelled) f()
      else un = f
    })
    return () => {
      cancelled = true
      un?.()
    }
  }

  // Closing the main window must also close the hidden capture window, or the process lingers.
  // Registered before the folder setup screen so quitting from setup also exits.
  void getCurrentWindow().onCloseRequested(async () => {
    await (await Window.getByLabel('capture'))?.destroy()
  })

  // Mic next to the search box: Windows voice typing only (Rust `start_dictation` presses Win+H).
  const dictate = /Windows/.test(navigator.userAgent) ? () => invoke<void>('start_dictation') : undefined

  const folder = await settings.get<string>('folder')
  const showApp = (dir: string) => {
    const store = new TauriFileStore(dir)
    const root = createRoot(rootEl)
    const renderApp = (shortcut?: ShortcutStatus) => root.render(
      <StrictMode>
        <App store={store} settings={settings} onReady={onReady} shortcut={shortcut} dictate={dictate} />
      </StrictMode>,
    )
    renderApp()
    void registerQuickCapture(store).then((ok) => renderApp({ ok, label: SHORTCUT_LABEL }))
  }

  // An out-of-$HOME folder loses its runtime scope grant on restart; fall back to setup then.
  let valid = false
  try { valid = !!folder && (await exists(folder)) } catch { valid = false }
  if (folder && valid) return showApp(folder)

  const root = createRoot(rootEl)
  root.render(
    <FolderSetup
      onChoose={() => {
        // Open at the previously chosen folder (if any) so re-confirming it is one click.
        void open({ directory: true, recursive: true, ...(folder ? { defaultPath: folder } : {}) }).then(async (picked) => {
          if (typeof picked !== 'string') return
          await settings.set('folder', picked)
          root.unmount()
          showApp(picked)
        }).catch(() => {})
      }}
    />,
  )
}

if ('__TAURI_INTERNALS__' in window) renderTauri().catch(() => {})
else renderBrowser().catch(() => {})
