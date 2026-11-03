import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    '  - id: t2\n    title: Write spec\n    status: today\n    created: 2026-11-01\n'),
  'projects/learn-spanish.md': project('Learn Spanish', '#30a46c',
    '  - id: t1\n    title: Buy a book\n    status: todo\n    created: 2026-11-01\n'),
})

function setup(files: Record<string, string> = seed()) {
  const store = new MemoryFileStore(files)
  render(<App store={store} settings={new MemorySettings()} now={() => NOW} />)
  return { store, user: userEvent.setup() }
}
const col = (name: string) => within(screen.getByRole('region', { name }))

afterEach(() => vi.useRealTimers())

describe('Board', () => {
  it('shows the four columns', async () => {
    setup()
    await screen.findByText('Set up Tauri')
    for (const n of ['Parking lot', 'To do', 'Today', 'Done']) {
      expect(screen.getByRole('heading', { name: n })).toBeInTheDocument()
    }
  })

  it('shows "pick up to 3" only while Today is empty', async () => {
    const { user } = setup()
    await screen.findByText('Write spec')
    expect(screen.queryByText('pick up to 3')).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Done: Write spec' }))
    expect(screen.getByText('pick up to 3')).toBeInTheDocument()
  })

  it('adds a task in To do and writes the project file', async () => {
    const { store, user } = setup()
    await screen.findByText('Set up Tauri')
    await user.click(screen.getByRole('button', { name: 'Add to To do' }))
    await user.type(screen.getByRole('textbox', { name: 'New task' }), 'Plan sprint{Enter}')
    expect(await col('To do').findByText('Plan sprint')).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('Plan sprint'))
  })

  it('ticking a Today card moves it to Done and logs the day', async () => {
    const { store, user } = setup()
    await screen.findByText('Write spec')
    await user.click(screen.getByRole('checkbox', { name: 'Done: Write spec' }))
    expect(col('Done').getByText('Write spec')).toBeInTheDocument()
    await waitFor(() => expect(store.files['days/2026-11-03.md']).toContain('flow-app/t2'))
    await user.click(screen.getByRole('checkbox', { name: 'Done: Write spec' }))
    expect(col('Today').getByText('Write spec')).toBeInTheDocument()
  })

  it('filters by project chip', async () => {
    const { user } = setup()
    await screen.findByText('Buy a book')
    await user.click(screen.getByRole('button', { name: 'Flow app' }))
    expect(screen.queryByText('Buy a book')).not.toBeInTheDocument()
    expect(screen.getByText('Set up Tauri')).toBeInTheDocument()
  })

  it('archiving a project via the chip menu removes its cards', async () => {
    const { store, user } = setup()
    await screen.findByText('Buy a book')
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Learn Spanish' }))
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(screen.queryByText('Buy a book')).not.toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/learn-spanish.md']).toContain('archived'))
  })

  it('edits a card inline and deletes it', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Set up Tauri' }))
    await user.clear(screen.getByRole('textbox', { name: 'Title' }))
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Set up Rust')
    await user.type(screen.getByRole('textbox', { name: 'First step' }), 'Install rustup')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Install rustup')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Set up Rust' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.queryByText('Set up Rust')).not.toBeInTheDocument()
  })

  it('captures a thought in the Parking lot and deletes it', async () => {
    const { store, user } = setup()
    await screen.findByText('Look into podcasts')
    await user.click(screen.getByRole('button', { name: 'Add to Parking lot' }))
    await user.type(screen.getByRole('textbox', { name: 'Capture a thought' }), 'Call mum{Enter}')
    expect(await col('Parking lot').findByText('Call mum')).toBeInTheDocument()
    await waitFor(() => expect(store.files['inbox.md']).toContain('Call mum'))
    await user.click(screen.getByRole('button', { name: 'Call mum' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.queryByText('Call mum')).not.toBeInTheDocument()
  })

  it('asks for a project title first when there are no projects', async () => {
    const { store, user } = setup({})
    await screen.findByRole('button', { name: 'Add to To do' })
    await user.click(screen.getByRole('button', { name: 'Add to To do' }))
    await user.type(screen.getByRole('textbox', { name: 'Project title' }), 'Home{Enter}')
    await user.type(screen.getByRole('textbox', { name: 'New task' }), 'Tidy desk{Enter}')
    expect(await col('To do').findByText('Tidy desk')).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/home.md']).toContain('Tidy desk'))
  })

  it('creates a project with + Project', async () => {
    const { store, user } = setup()
    await screen.findByText('Set up Tauri')
    await user.click(screen.getByRole('button', { name: '+ Project' }))
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), 'Garden{Enter}')
    expect(screen.getByRole('button', { name: 'Garden' })).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/garden.md']).toBeDefined())
  })

  it('Done empties after midnight and the 60s tick', async () => {
    let t = new Date(2026, 10, 4, 23, 59)
    vi.useFakeTimers()
    const store = new MemoryFileStore(seed())
    render(<App store={store} settings={new MemorySettings()} now={() => t} />)
    const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await flush(); await flush()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Write spec' }))
    expect(col('Done').getByText('Write spec')).toBeInTheDocument()
    t = new Date(2026, 10, 5, 0, 1)
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(col('Done').queryByText('Write spec')).not.toBeInTheDocument()
  })

  it('keeps a local change made while an external reload is in flight', async () => {
    const { store, user } = setup()
    await screen.findByText('Buy a book')
    const realRead = store.read.bind(store)
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    store.read = async (path: string) => { await gate; return realRead(path) }
    const external = seed()['projects/flow-app.md'].replace('Set up Tauri', 'Set up Tauri (edited)')
    act(() => store.externalWrite('projects/flow-app.md', external))
    store.read = async (path: string) => { await gate; return realRead(path) }
    await user.click(screen.getByRole('button', { name: 'Add to To do' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Project for new task' }), 'learn-spanish')
    await user.type(screen.getByRole('textbox', { name: 'New task' }), 'Local task{Enter}')
    await act(async () => { release(); await gate })
    expect(await screen.findByText('Set up Tauri (edited)')).toBeInTheDocument()
    expect(screen.getByText('Local task')).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/learn-spanish.md']).toContain('Local task'))
    expect(store.files['projects/flow-app.md']).toContain('(edited)')
  })

  it('offers no project select in the Parking lot add form', async () => {
    const { user } = setup()
    await screen.findByText('Buy a book')
    await user.click(screen.getByRole('button', { name: 'Add to Parking lot' }))
    expect(screen.queryByRole('combobox', { name: 'Project for new task' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add to To do' }))
    expect(screen.getByRole('combobox', { name: 'Project for new task' })).toBeInTheDocument()
  })
})
