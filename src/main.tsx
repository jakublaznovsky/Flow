import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { MemoryFileStore } from './storage/fileStore'
import { MemorySettings } from './ui/settings'

// Browser dev: in-memory store seeded with the spec's example files (Tauri shell comes later).
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} settings={new MemorySettings()} />
  </StrictMode>,
)
