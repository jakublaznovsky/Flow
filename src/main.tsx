import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { addInboxItem } from './model/inbox'
import FolderSetup from './ui/FolderSetup'
import QuickCapture from './ui/QuickCapture'
import { logIssue } from './storage/flowRepo'
import type { BoardApi } from './ui/Board'
import { MemoryFileStore, type FileStore } from './storage/fileStore'
import { MemorySettings } from './ui/settings'

// Browser dev: in-memory store seeded with the spec's example files.
const store = new MemoryFileStore({
  'inbox.md': `---
items:
  - id: i1
    text: Look into Spanish podcasts
    created: 2026-11-03
---
`,
  'projects/flow-app.md': `---
title: Flow app
status: active
color: "#4f8cff"
goal: Build my own ADHD-friendly planner
created: 2026-11-03
tasks:
  - id: t1
    title: Design the data format
    status: done
    first_step: List what a project needs
    created: 2026-11-03
    planned: 2026-11-03
    done: 2026-11-03
  - id: t2
    title: Set up Tauri project
    status: todo
    created: 2026-11-03
---
Free notes about the project.
`,
})

const rootEl = document.getElementById('root')!

function renderBrowser() {
  createRoot(rootEl).render(
    <StrictMode>
      <App store={store} settings={new MemorySettings()} />
    </StrictMode>,
  )
}

// Tauri-only modules are imported dynamically so the browser build/tests never load them.
async function renderTauri() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const { emit, listen } = await import('@tauri-apps/api/event')
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

  // Registered by App once it is ready: global shortcut shows the capture window, captured text lands in the inbox.
  const makeOnReady = (store: FileStore) => (board: BoardApi) => {
    let un: (() => void) | undefined
    let cancelled = false
    void register(SHORTCUT, async (ev) => {
      if (ev.state !== 'Pressed') return
      const cap = await Window.getByLabel('capture')
      await cap?.show()
      await cap?.setFocus()
    }).catch((e) => { void logIssue(store, 'shortcut', `could not register ${SHORTCUT}: ${e instanceof Error ? e.message : String(e)}`) })
    void listen<string>('flow:capture', (ev) => board.apply((d) => addInboxItem(d, ev.payload, board.today()))).then((f) => {
      if (cancelled) f()
      else un = f
    })
    return () => {
      cancelled = true
      un?.()
      void unregister(SHORTCUT).catch(() => {})
    }
  }

  const folder = await settings.get<string>('folder')
  const showApp = (dir: string) => {
    const store = new TauriFileStore(dir)
    // Closing the main window must also close the hidden capture window, or the process lingers.
    void getCurrentWindow().onCloseRequested(async () => {
      await (await Window.getByLabel('capture'))?.destroy()
    })
    createRoot(rootEl).render(
      <StrictMode>
        <App store={store} settings={settings} onReady={makeOnReady(store)} />
      </StrictMode>,
    )
  }

  // An out-of-$HOME folder loses its runtime scope grant on restart; fall back to setup then.
  let valid = false
  try { valid = !!folder && (await exists(folder)) } catch { valid = false }
  if (folder && valid) return showApp(folder)

  const root = createRoot(rootEl)
  root.render(
    <FolderSetup
      onChoose={() => {
        void open({ directory: true, recursive: true }).then(async (picked) => {
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
else renderBrowser()
