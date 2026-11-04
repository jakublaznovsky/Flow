import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  it('shows the five columns', async () => {
    setup()
    await screen.findByText('Set up Tauri')
    for (const n of ['Parking lot', 'To do', 'Tomorrow', 'Today', 'Done']) {
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

  it('edits a Parking lot item inline', async () => {
    const { store, user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Look into podcasts' }))
    await user.clear(screen.getByRole('textbox', { name: 'Text' }))
    await user.type(screen.getByRole('textbox', { name: 'Text' }), 'Look into Spanish podcasts')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(col('Parking lot').getByText('Look into Spanish podcasts')).toBeInTheDocument()
    await waitFor(() => expect(store.files['inbox.md']).toContain('Look into Spanish podcasts'))
  })

  it('saving a card with a new title and project writes both in one change', async () => {
    const { store, user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Set up Tauri' }))
    await user.clear(screen.getByRole('textbox', { name: 'Title' }))
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Set up Rust')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Project' }), 'learn-spanish')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(col('To do').getByText('Set up Rust')).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/learn-spanish.md']).toContain('Set up Rust'))
    expect(store.files['projects/flow-app.md']).not.toContain('Set up')
  })

  it('offers no project select in the Parking lot add form', async () => {
    const { user } = setup()
    await screen.findByText('Buy a book')
    await user.click(screen.getByRole('button', { name: 'Add to Parking lot' }))
    expect(screen.queryByRole('combobox', { name: 'Project for new task' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add to To do' }))
    expect(screen.getByRole('combobox', { name: 'Project for new task' })).toBeInTheDocument()
  })

  it('search filters cards by title, first step or project; Escape clears it', async () => {
    const { user } = setup()
    await screen.findByText('Buy a book')
    const search = screen.getByRole('searchbox', { name: 'Search' })
    await user.type(search, 'BOOK')
    expect(screen.getByText('Buy a book')).toBeInTheDocument()
    expect(screen.queryByText('Set up Tauri')).not.toBeInTheDocument()
    expect(screen.queryByText('Look into podcasts')).not.toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'flow app')
    expect(screen.getByText('Set up Tauri')).toBeInTheDocument()
    expect(screen.getByText('Write spec')).toBeInTheDocument()
    expect(screen.queryByText('Buy a book')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(search).toHaveValue('')
    expect(screen.getByText('Buy a book')).toBeInTheDocument()
    expect(screen.getByText('Look into podcasts')).toBeInTheDocument()
  })

  it('"/" focuses the search box without typing into it', async () => {
    const { user } = setup()
    await screen.findByText('Buy a book')
    await user.keyboard('/')
    const search = screen.getByRole('searchbox', { name: 'Search' })
    expect(search).toHaveFocus()
    expect(search).toHaveValue('')
  })

  it('"n" opens the New task input in To do', async () => {
    const { store, user } = setup()
    await screen.findByText('Buy a book')
    await user.keyboard('n')
    const input = col('To do').getByRole('textbox', { name: 'New task' })
    expect(input).toHaveFocus()
    expect(input).toHaveValue('')
    await user.keyboard('Plan sprint{Enter}')
    expect(await col('To do').findByText('Plan sprint')).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('Plan sprint'))
  })

  it('"p" and "b" switch between the Progress and Board views', async () => {
    const { user } = setup()
    await screen.findByText('Buy a book')
    await user.keyboard('p')
    expect(screen.getByRole('region', { name: 'Progress' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'To do' })).not.toBeInTheDocument()
    await user.keyboard('b')
    expect(screen.getByRole('region', { name: 'To do' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Progress' })).not.toBeInTheDocument()
  })

  it('shortcut keys typed inside a text field do nothing', async () => {
    const { user } = setup()
    await screen.findByText('Buy a book')
    await user.click(screen.getByRole('button', { name: 'Add to Parking lot' }))
    const thought = screen.getByRole('textbox', { name: 'Capture a thought' })
    await user.type(thought, 'nbp/')
    expect(thought).toHaveValue('nbp/')
    expect(thought).toHaveFocus()
    expect(screen.queryByRole('textbox', { name: 'New task' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Progress' })).not.toBeInTheDocument()
    const search = screen.getByRole('searchbox', { name: 'Search' })
    await user.type(search, 'n')
    expect(search).toHaveValue('n')
    expect(screen.queryByRole('textbox', { name: 'New task' })).not.toBeInTheDocument()
  })

  it('shortcuts still work while a card checkbox has focus', async () => {
    const { user } = setup()
    await screen.findByText('Write spec')
    const box = screen.getByRole('checkbox', { name: 'Done: Write spec' })
    act(() => box.focus())
    expect(box).toHaveFocus()
    await user.keyboard('p')
    expect(screen.getByRole('region', { name: 'Progress' })).toBeInTheDocument()
  })

  it('persists the view in settings and restores it', async () => {
    const settings = new MemorySettings()
    const store = new MemoryFileStore(seed())
    const user = userEvent.setup()
    const view = render(<App store={store} settings={settings} now={() => NOW} />)
    await screen.findByText('Buy a book')
    await user.keyboard('p')
    await waitFor(async () => expect(await settings.get('view')).toBe('progress'))
    view.unmount()
    render(<App store={store} settings={settings} now={() => NOW} />)
    expect(await screen.findByRole('region', { name: 'Progress' })).toBeInTheDocument()
  })

  it('does not restore Settings or Weekly review: the app opens on the Board', async () => {
    for (const key of ['s', 'r']) {
      const settings = new MemorySettings()
      await settings.set('view', 'week')
      const store = new MemoryFileStore(seed())
      const user = userEvent.setup()
      const view = render(<App store={store} settings={settings} now={() => NOW} />)
      await screen.findByRole('region', { name: 'Week' })
      if (key === 's') await user.click(screen.getByRole('button', { name: 'Settings' }))
      else await user.keyboard('r')
      await screen.findByRole('region', { name: key === 's' ? 'Settings' : 'Weekly review' })
      await waitFor(async () => expect(await settings.get('view')).toBe('board'))
      view.unmount()
      render(<App store={store} settings={settings} now={() => NOW} />)
      await screen.findByText('Buy a book')
      await new Promise((r) => setTimeout(r, 20))
      expect(screen.getByRole('heading', { name: 'To do' })).toBeInTheDocument()
      cleanup()
    }
  })

  it('an older stored "settings" or "review" view opens on the Board', async () => {
    for (const stored of ['settings', 'review']) {
      const settings = new MemorySettings()
      await settings.set('view', stored)
      render(<App store={new MemoryFileStore(seed())} settings={settings} now={() => NOW} />)
      await screen.findByText('Buy a book')
      await new Promise((r) => setTimeout(r, 20))
      expect(screen.getByRole('heading', { name: 'To do' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: stored === 'settings' ? 'Settings' : 'Weekly review' })).not.toBeInTheDocument()
      cleanup()
    }
  })

  it('column headers show the card count', async () => {
    setup()
    await screen.findByText('Buy a book')
    expect(col('To do').getByText('2', { selector: '.count' })).toBeInTheDocument()
    expect(col('Today').getByText('1', { selector: '.count' })).toBeInTheDocument()
  })
})
