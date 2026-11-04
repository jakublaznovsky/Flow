import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'
import { planChoices } from './PlanMenu'

const NOW = new Date(2026, 10, 3, 10, 0) // Tuesday 3 Nov 2026
const project = (title: string, tasks: string) =>
  `---\ntitle: ${title}\nstatus: active\ncolor: "#4f8cff"\ncreated: 2026-11-01\ntasks:\n${tasks}---\n`
const t = (id: string, title: string, status: string, more = '') =>
  `  - id: ${id}\n    title: ${title}\n    status: ${status}\n    created: 2026-11-01\n${more}`
const seed = (): Record<string, string> => ({
  'inbox.md': `---\nitems:\n  - id: i1\n    text: Look into podcasts\n    created: 2026-11-01\n---\n`,
  'projects/flow-app.md': project('Flow app',
    t('t1', 'Set up Tauri', 'todo') + t('t2', 'Write spec', 'today') +
    t('t3', 'Ship beta', 'todo', '    scheduled: 2026-11-04\n') + t('t4', 'Old win', 'done', '    done: 2026-11-03\n')),
})
async function setup(files = seed()) {
  const store = new MemoryFileStore(files)
  render(<App store={store} settings={new MemorySettings()} now={() => NOW} />)
  await screen.findByText('Set up Tauri')
  return { store, user: userEvent.setup() }
}
const col = (name: string) => within(screen.getByRole('region', { name }))

afterEach(() => vi.useRealTimers())

describe('Tomorrow column', () => {
  it('sits between To do and Today and holds the tasks planned for tomorrow', async () => {
    await setup()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent))
      .toEqual(['Parking lot', 'To do', 'Tomorrow', 'Today', 'Done'])
    expect(col('Tomorrow').getByText('Ship beta')).toBeInTheDocument()
    expect(col('To do').queryByText('Ship beta')).not.toBeInTheDocument()
  })

  it('shows "Plan tomorrow here" while empty', async () => {
    const files = seed()
    files['projects/flow-app.md'] = files['projects/flow-app.md'].replace('    scheduled: 2026-11-04\n', '')
    await setup(files)
    expect(col('Tomorrow').getByText('Plan tomorrow here')).toBeInTheDocument()
  })

  it('"+" in Tomorrow adds a task planned for tomorrow', async () => {
    const { store, user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Add to Tomorrow' }))
    await user.type(col('Tomorrow').getByRole('textbox', { name: 'New task' }), 'Call bank{Enter}')
    expect(await col('Tomorrow').findByText('Call bank')).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/flow-app.md']).toMatch(/title: Call bank\n\s+status: todo\n[\s\S]*scheduled: 2026-11-04/))
  })

  it('at midnight the Tomorrow card moves to Today', async () => {
    let now = new Date(2026, 10, 3, 23, 59)
    vi.useFakeTimers()
    render(<App store={new MemoryFileStore(seed())} settings={new MemorySettings()} now={() => now} />)
    const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await flush(); await flush()
    expect(col('Tomorrow').getByText('Ship beta')).toBeInTheDocument()
    now = new Date(2026, 10, 4, 0, 1)
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(col('Today').getByText('Ship beta')).toBeInTheDocument()
    expect(col('Tomorrow').queryByText('Ship beta')).not.toBeInTheDocument()
  })
})

describe('Plan menu on task cards', () => {
  it('lists Today, Tomorrow, the next 5 days and Pick a date… (Next week is Mon 9, already listed)', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Plan Set up Tauri' }))
    const menu = screen.getByRole('menu', { name: 'Plan Set up Tauri' })
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(
      ['Today', 'Tomorrow', 'Thu 5', 'Fri 6', 'Sat 7', 'Sun 8', 'Mon 9', 'Pick a date…'])
  })

  it('only on To do, Tomorrow and Today task cards', async () => {
    await setup()
    for (const title of ['Set up Tauri', 'Ship beta', 'Write spec']) {
      expect(screen.getByRole('button', { name: `Plan ${title}` })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Plan Old win' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Plan Look into podcasts' })).not.toBeInTheDocument()
  })

  it('Tomorrow moves the card into Tomorrow; it is then marked and can be removed', async () => {
    const { store, user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Plan Set up Tauri' }))
    await user.click(screen.getByRole('menuitem', { name: 'Tomorrow' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(col('Tomorrow').getByText('Set up Tauri')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Plan Set up Tauri' }))
    expect(screen.getByRole('menuitem', { name: /Tomorrow/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('menuitem', { name: /Today/ })).not.toHaveAttribute('aria-current')
    await user.click(screen.getByRole('menuitem', { name: 'Remove date' }))
    expect(col('To do').getByText('Set up Tauri')).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/flow-app.md']).not.toMatch(/Set up Tauri\n[^-]*scheduled/))
  })

  it('a weekday keeps the card in To do with its day chip; Today moves it to Today', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Plan Set up Tauri' }))
    await user.click(screen.getByRole('menuitem', { name: 'Fri 6' }))
    expect(col('To do').getByLabelText('Planned for Fri 6 Nov')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Plan Set up Tauri' }))
    expect(screen.getByRole('menuitem', { name: /Fri 6/ })).toHaveAttribute('aria-current', 'true')
    await user.click(screen.getByRole('menuitem', { name: /Today/ }))
    expect(col('Today').getByText('Set up Tauri')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Plan Set up Tauri' }))
    expect(screen.getByRole('menuitem', { name: /Today/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByRole('menuitem', { name: 'Remove date' })).not.toBeInTheDocument()
  })

  it('Pick a date… shows a date field that applies with Set', async () => {
    const { store, user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Plan Set up Tauri' }))
    await user.click(screen.getByRole('menuitem', { name: 'Pick a date…' }))
    fireEvent.change(screen.getByLabelText('Pick a date'), { target: { value: '2026-11-20' } })
    await user.click(screen.getByRole('button', { name: 'Set' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(col('To do').getByLabelText('Planned for Fri 20 Nov')).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('scheduled: 2026-11-20'))
  })

  it('Escape closes it and returns focus; arrows move; an outside click closes it', async () => {
    const { user } = await setup()
    const button = screen.getByRole('button', { name: 'Plan Set up Tauri' })
    await user.click(button)
    expect(screen.getByRole('menuitem', { name: 'Today' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Tomorrow' })).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Pick a date…' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
    await user.click(button)
    await user.click(screen.getByRole('heading', { name: 'Done' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(col('To do').getByText('Set up Tauri')).toBeInTheDocument()
  })
})

describe('Plan for when adding a task', () => {
  it('a date puts the new task in Tomorrow, Today or To do with its day', async () => {
    const { store, user } = await setup()
    const add = async (title: string, date: string) => {
      await user.click(screen.getByRole('button', { name: 'Add to To do' }))
      await user.type(col('To do').getByRole('textbox', { name: 'New task' }), title)
      fireEvent.change(col('To do').getByLabelText('Plan for'), { target: { value: date } })
      await user.click(col('To do').getByRole('button', { name: 'Add' }))
    }
    await add('Tomorrow thing', '2026-11-04')
    expect(col('Tomorrow').getByText('Tomorrow thing')).toBeInTheDocument()
    await add('Today thing', '2026-11-03')
    expect(col('Today').getByText('Today thing')).toBeInTheDocument()
    await add('Later thing', '2026-11-12')
    expect(col('To do').getByText('Later thing')).toBeInTheDocument()
    expect(col('To do').getByLabelText('Planned for Thu 12 Nov')).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('scheduled: 2026-11-12'))
    await add('No date', '')
    expect(col('To do').getByText('No date')).toBeInTheDocument()
  })
})

describe('Plan menu edge cases', () => {
  const scheduledLater = () => {
    const files = seed()
    files['projects/flow-app.md'] = files['projects/flow-app.md'].replace(
      "title: Set up Tauri\n    status: todo\n    created: 2026-11-01\n",
      "title: Set up Tauri\n    status: todo\n    created: 2026-11-01\n    scheduled: 2026-11-20\n")
    return files
  }

  it('Pick a date never applies on intermediate changes; only Set or Enter applies', async () => {
    const { store, user } = await setup(scheduledLater())
    await user.click(screen.getByRole('button', { name: 'Plan Set up Tauri' }))
    await user.click(screen.getByRole('menuitem', { name: /Pick a date/ }))
    const input = screen.getByLabelText('Pick a date')
    expect(input).toHaveValue('2026-11-20')
    // One digit typed into the month of a pre-filled value is already a complete (past) date.
    fireEvent.change(input, { target: { value: '2026-01-20' } })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(col('To do').getByText('Set up Tauri')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '2026-11-25' } })
    await user.click(screen.getByRole('button', { name: 'Set' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(col('To do').getByLabelText('Planned for Wed 25 Nov')).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('scheduled: 2026-11-25'))
    await user.click(screen.getByRole('button', { name: 'Plan Set up Tauri' }))
    await user.click(screen.getByRole('menuitem', { name: /Pick a date/ }))
    fireEvent.change(screen.getByLabelText('Pick a date'), { target: { value: '2026-11-27' } })
    fireEvent.keyDown(screen.getByLabelText('Pick a date'), { key: 'Enter' })
    expect(col('To do').getByLabelText('Planned for Fri 27 Nov')).toBeInTheDocument()
  })

  it('closes on scroll, on window resize and when focus leaves the menu', async () => {
    const { user } = await setup()
    const open = () => user.click(screen.getByRole('button', { name: 'Plan Set up Tauri' }))
    await open()
    fireEvent.scroll(col('To do').getByRole('list'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await open()
    fireEvent(window, new Event('resize'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await open()
    act(() => screen.getByRole('searchbox', { name: 'Search' }).focus())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('does not list Next week when that Monday is already in the day list', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Plan Set up Tauri' }))
    // Tue 3 Nov: the days run Thu 5 … Mon 9, and next Monday is Mon 9.
    expect(screen.queryByRole('menuitem', { name: /Next week/ })).not.toBeInTheDocument()
  })
})

describe('planChoices', () => {
  it('adds Next week when next Monday is past the listed days', () => {
    expect(planChoices('2026-11-02').map((c) => c.label)).toEqual(
      ['Today', 'Tomorrow', 'Wed 4', 'Thu 5', 'Fri 6', 'Sat 7', 'Sun 8', 'Next week (Mon 9)'])
    expect(planChoices('2026-11-08').map((c) => c.label)).toEqual(
      ['Today', 'Tomorrow', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13', 'Sat 14'])
  })
})
