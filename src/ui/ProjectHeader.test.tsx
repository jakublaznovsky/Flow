import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'
import type { BoardApi } from './Board'
import { updateProject } from '../model/projects'

const NOW = new Date(2026, 10, 4, 10, 0) // Wednesday
const project = (extra: string, tasks: string, body = '') =>
  `---\ntitle: Flow app\nstatus: active\ncolor: "#4f8cff"\ncreated: 2026-11-01\n${extra}tasks:\n${tasks}---\n${body}`
const seed = (): Record<string, string> => ({
  'projects/flow-app.md': project('',
    '  - id: t1\n    title: Set up Tauri\n    status: todo\n    created: 2026-11-01\n' +
    '  - id: t2\n    title: Write spec\n    status: done\n    created: 2026-11-01\n', 'Old notes\n'),
  'projects/other.md': project('', '  - id: t1\n    title: Other task\n    status: todo\n    created: 2026-11-01\n')
    .replace('Flow app', 'Other'),
  'days/2026-11-02.md': `---\ndone:\n  - ref: flow-app/t2\n    title: Write spec\n---\n`,
  'days/2026-11-01.md': `---\ndone:\n  - ref: flow-app/t9\n    title: Last week\n---\n`,
})

async function setup(files = seed()) {
  const store = new MemoryFileStore(files)
  let api!: BoardApi
  render(<App store={store} settings={new MemorySettings()} now={() => NOW} onReady={(a) => { api = a }} />)
  const user = userEvent.setup()
  await screen.findByText('Set up Tauri')
  return { store, user, api: () => api }
}
const focusProject = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(screen.getByRole('button', { name }))

describe('Project header', () => {
  it('appears only when a project is focused', async () => {
    const { user } = await setup()
    expect(screen.queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument()
    await focusProject(user, 'Flow app')
    expect(screen.getByRole('heading', { name: 'Flow app' })).toBeInTheDocument()
    expect(screen.getByText('1 of 2 done')).toBeInTheDocument()
    expect(screen.getByText('Done this week: 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All projects' }))
    expect(screen.queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument()
  })

  it('edits the goal and writes it to the project file; Escape cancels', async () => {
    const { store, user } = await setup()
    await focusProject(user, 'Flow app')
    await user.click(screen.getByRole('button', { name: 'Add a goal' }))
    await user.type(screen.getByRole('textbox', { name: 'Goal' }), 'Ship v0.2{Escape}')
    expect(store.files['projects/flow-app.md']).not.toContain('goal:')
    await user.click(screen.getByRole('button', { name: 'Add a goal' }))
    await user.type(screen.getByRole('textbox', { name: 'Goal' }), 'Ship v0.2{Enter}')
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('goal: Ship v0.2'))
    expect(screen.getByRole('button', { name: 'Ship v0.2' })).toBeInTheDocument()
  })

  it('opens the notes panel, saves the body on blur and closes with Escape', async () => {
    const { store, user } = await setup()
    await focusProject(user, 'Flow app')
    const toggle = screen.getByRole('button', { name: 'Notes' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const area = screen.getByRole('textbox', { name: 'Project notes' })
    expect(area).toHaveValue('Old notes\n')
    await user.clear(area)
    await user.type(area, 'New notes')
    await user.tab()
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('New notes'))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('complementary', { name: 'Project notes' })).not.toBeInTheDocument()
  })

  it('adds a decision under ## Decisions', async () => {
    const { store, user } = await setup()
    await focusProject(user, 'Flow app')
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    await user.type(screen.getByRole('textbox', { name: 'Add decision' }), 'Use Tauri{Enter}')
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('## Decisions\n- 2026-11-04: Use Tauri'))
    expect(screen.getByRole('textbox', { name: 'Add decision' })).toHaveValue('')
  })

  it('reflects external body changes only while the textarea is not being edited', async () => {
    const { user, api } = await setup()
    await focusProject(user, 'Flow app')
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    const area = screen.getByRole('textbox', { name: 'Project notes' })
    act(() => api().apply((d) => updateProject(d, 'flow-app', { body: 'From outside' })))
    await waitFor(() => expect(area).toHaveValue('From outside'))
    await user.click(area)
    await user.type(area, ' typing')
    act(() => api().apply((d) => updateProject(d, 'flow-app', { body: 'Second outside' })))
    expect(area).toHaveValue('From outside typing')
  })

  it('stays open when switching project and closes when focus clears', async () => {
    const { user } = await setup()
    await focusProject(user, 'Flow app')
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    await focusProject(user, 'Other')
    expect(screen.getByRole('complementary', { name: 'Project notes' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Project notes' })).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'All projects' }))
    expect(screen.queryByRole('complementary', { name: 'Project notes' })).not.toBeInTheDocument()
  })
})
