import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'

const NOW = new Date(2026, 10, 3, 10, 0)
const project = (title: string, color: string, tasks: string) =>
  `---\ntitle: ${title}\nstatus: active\ncolor: "${color}"\ncreated: 2026-11-01\ntasks:\n${tasks}---\n`
const seed = (): Record<string, string> => ({
  'inbox.md': `---\nitems:\n  - id: i1\n    text: Look into podcasts\n    created: 2026-11-01\n---\n`,
  'projects/flow-app.md': project('Flow app', '#4f8cff',
    '  - id: t1\n    title: Set up Tauri\n    status: todo\n    created: 2026-11-01\n' +
    '  - id: t2\n    title: Write spec\n    status: today\n    created: 2026-11-01\n' +
    '  - id: t3\n    title: Pick a name\n    status: done\n    created: 2026-11-01\n    done: 2026-11-02\n'),
  'projects/learn-spanish.md': project('Learn Spanish', '#30a46c',
    '  - id: t1\n    title: Buy a book\n    status: todo\n    created: 2026-11-01\n'),
})

function setup(files: Record<string, string> = seed()) {
  const store = new MemoryFileStore(files)
  render(<App store={store} settings={new MemorySettings()} now={() => NOW} />)
  return { store, user: userEvent.setup() }
}
const sidebar = () => within(screen.getByRole('navigation', { name: 'Sidebar' }))

describe('Sidebar', () => {
  it('focusing a project filters the board and "All projects" clears it', async () => {
    const { user } = setup()
    await screen.findByText('Buy a book')
    const all = sidebar().getByRole('button', { name: 'All projects' })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    await user.click(sidebar().getByRole('button', { name: 'Flow app' }))
    expect(sidebar().getByRole('button', { name: 'Flow app' })).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('Buy a book')).not.toBeInTheDocument()
    expect(screen.getByText('Set up Tauri')).toBeInTheDocument()
    await user.click(all)
    expect(screen.getByText('Buy a book')).toBeInTheDocument()
    expect(all).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a progress bar per project (done of total)', async () => {
    setup()
    await screen.findByText('Buy a book')
    const bar = sidebar().getByRole('progressbar', { name: 'Flow app progress' })
    expect(bar).toHaveAttribute('aria-valuenow', '1')
    expect(bar).toHaveAttribute('aria-valuemax', '3')
    expect(sidebar().getByRole('progressbar', { name: 'Learn Spanish progress' })).toHaveAttribute('aria-valuenow', '0')
  })

  it('switches views with the view buttons', async () => {
    const { user } = setup()
    await screen.findByText('Buy a book')
    expect(sidebar().getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(sidebar().getByRole('button', { name: 'Progress' }))
    expect(sidebar().getByRole('button', { name: 'Progress' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: 'Progress' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'To do' })).not.toBeInTheDocument()
    await user.click(sidebar().getByRole('button', { name: 'Board' }))
    expect(screen.getByRole('region', { name: 'To do' })).toBeInTheDocument()
  })

  it('the ⋯ menu archives a project and removes its cards', async () => {
    const { store, user } = setup()
    await screen.findByText('Buy a book')
    await user.click(sidebar().getByRole('button', { name: 'Project menu for Learn Spanish' }))
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryByText('Buy a book')).not.toBeInTheDocument()
    expect(sidebar().queryByRole('button', { name: 'Learn Spanish' })).not.toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/learn-spanish.md']).toContain('status: archived'))
  })

  it('right-click opens the menu; Escape and an outside click close it', async () => {
    const { user } = setup()
    await screen.findByText('Buy a book')
    fireEvent.contextMenu(sidebar().getByRole('button', { name: 'Learn Spanish' }))
    expect(screen.getByRole('menu', { name: 'Learn Spanish menu' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await user.click(sidebar().getByRole('button', { name: 'Project menu for Learn Spanish' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.click(screen.getByRole('heading', { name: 'To do' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renames a project from the menu (slug unchanged)', async () => {
    const { store, user } = setup()
    await screen.findByText('Buy a book')
    await user.click(sidebar().getByRole('button', { name: 'Project menu for Learn Spanish' }))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'New name' })
    await user.clear(input)
    await user.type(input, 'Spanish{Enter}')
    expect(sidebar().getByRole('button', { name: 'Spanish' })).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/learn-spanish.md']).toContain('title: Spanish'))
  })

  it('changes a project color from the menu', async () => {
    const { store, user } = setup()
    await screen.findByText('Buy a book')
    await user.click(sidebar().getByRole('button', { name: 'Project menu for Learn Spanish' }))
    const colors = within(screen.getByRole('group', { name: 'Color' })).getAllByRole('button')
    const name = colors[0].getAttribute('aria-label')!
    await user.click(colors[0])
    await waitFor(() => expect(store.files['projects/learn-spanish.md']).toContain(name.replace('Color ', '')))
  })

  it('pausing hides a project; Hidden (N) lists it with Make active', async () => {
    const { store, user } = setup()
    await screen.findByText('Buy a book')
    expect(sidebar().queryByRole('button', { name: /^Hidden/ })).not.toBeInTheDocument()
    await user.click(sidebar().getByRole('button', { name: 'Project menu for Learn Spanish' }))
    await user.click(screen.getByRole('menuitem', { name: 'Pause' }))
    expect(screen.queryByText('Buy a book')).not.toBeInTheDocument()
    await user.click(sidebar().getByRole('button', { name: 'Hidden (1)' }))
    const list = within(screen.getByRole('list', { name: 'Hidden projects' }))
    expect(list.getByText('Learn Spanish')).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/learn-spanish.md']).toContain('status: paused'))
    await user.click(list.getByRole('button', { name: 'Make active' }))
    expect(await screen.findByText('Buy a book')).toBeInTheDocument()
    expect(sidebar().queryByRole('button', { name: /^Hidden/ })).not.toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/learn-spanish.md']).toContain('status: active'))
  })

  it('marking the focused project done hides it and clears the focus', async () => {
    const { store, user } = setup()
    await screen.findByText('Buy a book')
    await user.click(sidebar().getByRole('button', { name: 'Flow app' }))
    await user.click(sidebar().getByRole('button', { name: 'Project menu for Flow app' }))
    await user.click(screen.getByRole('menuitem', { name: 'Mark done' }))
    expect(sidebar().getByRole('button', { name: 'All projects' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Buy a book')).toBeInTheDocument()
    expect(screen.queryByText('Set up Tauri')).not.toBeInTheDocument()
    expect(sidebar().getByRole('button', { name: 'Hidden (1)' })).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('status: done'))
  })

  it('creates a project with + New project', async () => {
    const { store, user } = setup()
    await screen.findByText('Set up Tauri')
    await user.click(sidebar().getByRole('button', { name: '+ New project' }))
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), 'Garden{Enter}')
    expect(sidebar().getByRole('button', { name: 'Garden' })).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/garden.md']).toBeDefined())
  })

  it('Escape cancels the new project input without creating anything', async () => {
    const { store, user } = setup()
    await screen.findByText('Set up Tauri')
    await user.click(sidebar().getByRole('button', { name: '+ New project' }))
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), 'Garden{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Project name' })).not.toBeInTheDocument()
    expect(store.files['projects/garden.md']).toBeUndefined()
  })
})
