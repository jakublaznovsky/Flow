import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'
import { updateProject } from '../model/projects'
import { useFlow } from './useFlow'
import { handleWeekDrop } from './WeekView'

const NOW = new Date(2026, 10, 4, 10, 0) // Wednesday 2026-11-04
const T = '2026-11-04'
const task = (id: string, title: string, status: string, more = '') =>
  `  - id: ${id}\n    title: ${title}\n    status: ${status}\n    created: 2026-11-01\n${more}`
const project = (title: string, color: string, tasks: string) =>
  `---\ntitle: ${title}\nstatus: active\ncolor: "${color}"\ncreated: 2026-11-01\ntasks:\n${tasks}---\n`
const seed = (): Record<string, string> => ({
  'inbox.md': '---\nitems: []\n---\n',
  'projects/flow-app.md': project('Flow app', '#4f8cff',
    task('t1', 'Set up Tauri', 'todo') +
    task('t2', 'Write spec', 'todo', '    scheduled: 2026-11-06\n') +
    task('t3', 'Pick a name', 'done', '    done: 2026-11-02\n')),
  'projects/learn-spanish.md': project('Learn Spanish', '#30a46c', task('t1', 'Buy a book', 'todo')),
  'days/2026-11-02.md': '---\ndate: 2026-11-02\nplanned: []\ndone:\n  - ref: flow-app/t3\n    title: Pick a name\n    project: Flow app\n---\n',
})

/** Count writes per data path (the README that ensureFolder writes is left out). */
function counting(store: MemoryFileStore) {
  const writes: Record<string, number> = {}
  const real = store.write.bind(store)
  store.write = async (p, t) => { if (p !== 'README.md') writes[p] = (writes[p] ?? 0) + 1; return real(p, t) }
  return writes
}

async function harness(files = seed(), now: () => Date = () => NOW) {
  const store = new MemoryFileStore(files)
  const writes = counting(store)
  const settings = new MemorySettings()
  const hook = renderHook(() => useFlow(store, settings, now))
  await waitFor(() => expect(hook.result.current.data).not.toBeNull())
  const ctx = () => ({ flow: hook.result.current, today: hook.result.current.today })
  return { store, writes, hook, ctx }
}

const taskOf = (store: MemoryFileStore, path: string, id: string) => {
  const text = store.files[path]
  const start = text.indexOf(`- id: ${id}\n`)
  const next = text.indexOf('\n  - id: ', start + 1)
  return text.slice(start, next === -1 ? text.indexOf('\n---', start) : next)
}

afterEach(() => vi.useRealTimers())

/** The week header (title + ‹ This week ›), which sits in the shell's top bar. */
const head = () => within(screen.getByRole('group', { name: 'Week navigation' }))

describe('promotion of scheduled tasks', () => {
  it('on load moves a task scheduled yesterday into Today, clears the date and writes once', async () => {
    const files = seed()
    files['projects/learn-spanish.md'] = project('Learn Spanish', '#30a46c', task('t1', 'Buy a book', 'todo', '    scheduled: 2026-11-03\n'))
    const { store, writes, hook } = await harness(files)
    await waitFor(() => expect(taskOf(store, 'projects/learn-spanish.md', 't1')).toContain('status: today'))
    const t1 = taskOf(store, 'projects/learn-spanish.md', 't1')
    expect(t1).toContain(`planned: ${T}`)
    expect(t1).not.toContain('scheduled')
    expect(store.files[`days/${T}.md`]).toContain('learn-spanish/t1')
    expect(hook.result.current.data!.projects['learn-spanish'].tasks[0].status).toBe('today')
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(writes['projects/learn-spanish.md']).toBe(1)
    expect(writes['projects/flow-app.md']).toBeUndefined()
  })

  it('writes nothing on load when nothing is due', async () => {
    const { writes } = await harness()
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(writes).toEqual({})
  })

  it('leaves a past-due task of a paused project alone on load', async () => {
    const files = seed()
    files['projects/paused.md'] = project('Paused', '#999', task('t1', 'Later', 'todo', '    scheduled: 2026-11-03\n'))
      .replace('status: active', 'status: paused')
    const { store, writes } = await harness(files)
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(writes).toEqual({})
    expect(store.files['projects/paused.md']).toContain('scheduled: 2026-11-03')
  })

  it('promotes a past-due task brought in by an external edit, written once', async () => {
    const { store, writes, hook } = await harness()
    const external = project('Learn Spanish', '#30a46c', task('t1', 'Buy a book', 'todo', '    scheduled: 2026-11-02\n'))
    act(() => store.externalWrite('projects/learn-spanish.md', external))
    await waitFor(() => expect(taskOf(store, 'projects/learn-spanish.md', 't1')).toContain('status: today'))
    expect(taskOf(store, 'projects/learn-spanish.md', 't1')).not.toContain('scheduled')
    expect(hook.result.current.data!.projects['learn-spanish'].tasks[0].status).toBe('today')
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(writes['projects/learn-spanish.md']).toBe(1)
  })

  it('promotes past-due tasks when a paused project is made active again', async () => {
    const files = seed()
    files['projects/paused.md'] = project('Paused', '#999', task('t1', 'Later', 'todo', '    scheduled: 2026-11-03\n'))
      .replace('status: active', 'status: paused')
    const { store, hook } = await harness(files)
    act(() => hook.result.current.apply((d) => updateProject(d, 'paused', { status: 'active' })))
    await waitFor(() => expect(taskOf(store, 'projects/paused.md', 't1')).toContain('status: today'))
    expect(taskOf(store, 'projects/paused.md', 't1')).not.toContain('scheduled')
    expect(store.files['projects/paused.md']).toContain('status: active')
    expect(store.files[`days/${T}.md`]).toContain('paused/t1')
  })

  it('promotes when the date changes at midnight', async () => {
    let t = new Date(2026, 10, 5, 23, 59) // Thursday
    vi.useFakeTimers()
    const store = new MemoryFileStore(seed())
    render(<App store={store} settings={new MemorySettings()} now={() => t} />)
    const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await flush(); await flush()
    // Planned for tomorrow: it waits in the Tomorrow column until midnight.
    expect(within(screen.getByRole('region', { name: 'Tomorrow' })).getByText('Write spec')).toBeInTheDocument()
    t = new Date(2026, 10, 6, 0, 1)
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(within(screen.getByRole('region', { name: 'Today' })).getByText('Write spec')).toBeInTheDocument()
    await flush()
    const t2 = taskOf(store, 'projects/flow-app.md', 't2')
    expect(t2).toContain('status: today')
    expect(t2).toContain('planned: 2026-11-06')
    expect(t2).not.toContain('scheduled')
  })
})

describe('handleWeekDrop', () => {
  it('a future day schedules the task and keeps it in To do', async () => {
    const { store, ctx } = await harness()
    act(() => handleWeekDrop({ cardKey: 'learn-spanish/t1', target: 'day-2026-11-07' }, ctx()))
    await waitFor(() => expect(taskOf(store, 'projects/learn-spanish.md', 't1')).toContain('scheduled: 2026-11-07'))
    expect(taskOf(store, 'projects/learn-spanish.md', 't1')).toContain('status: todo')
  })

  it("today's column moves the task straight to Today", async () => {
    const { store, ctx } = await harness()
    act(() => handleWeekDrop({ cardKey: 'flow-app/t2', target: `day-${T}` }, ctx()))
    await waitFor(() => expect(taskOf(store, 'projects/flow-app.md', 't2')).toContain('status: today'))
    expect(taskOf(store, 'projects/flow-app.md', 't2')).not.toContain('scheduled')
    expect(store.files[`days/${T}.md`]).toContain('flow-app/t2')
  })

  it('Unscheduled clears the date', async () => {
    const { store, ctx } = await harness()
    act(() => handleWeekDrop({ cardKey: 'flow-app/t2', target: 'unscheduled' }, ctx()))
    await waitFor(() => expect(taskOf(store, 'projects/flow-app.md', 't2')).not.toContain('scheduled'))
    expect(taskOf(store, 'projects/flow-app.md', 't2')).toContain('status: todo')
  })

  it('ignores unknown targets and unknown cards', async () => {
    const { store, writes, ctx } = await harness()
    const before = { ...store.files }
    act(() => handleWeekDrop({ cardKey: 'learn-spanish/t1', target: 'somewhere' }, ctx()))
    act(() => handleWeekDrop({ cardKey: 'learn-spanish/t9', target: 'day-2026-11-03' }, ctx()))
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(store.files).toEqual(before)
    expect(writes).toEqual({})
  })

  const withToday = () => {
    const files = seed()
    files['projects/learn-spanish.md'] = project('Learn Spanish', '#30a46c',
      task('t1', 'Buy a book', 'todo') + task('t2', 'Practise verbs', 'today', `    planned: ${T}\n`))
    files[`days/${T}.md`] = `---\ndate: ${T}\nplanned:\n  - learn-spanish/t2\ndone: []\n---\n`
    return files
  }

  it('a Today task dropped on a future day leaves Today and is planned for that day', async () => {
    const { store, hook, ctx } = await harness(withToday())
    act(() => handleWeekDrop({ cardKey: 'learn-spanish/t2', target: 'day-2026-11-06' }, ctx()))
    await waitFor(() => expect(taskOf(store, 'projects/learn-spanish.md', 't2')).toContain('scheduled: 2026-11-06'))
    expect(taskOf(store, 'projects/learn-spanish.md', 't2')).toContain('status: todo')
    expect(hook.result.current.data!.projects['learn-spanish'].tasks[1].status).toBe('todo')
  })

  it('a Today task dropped on a past day is done that day', async () => {
    const { store, ctx } = await harness(withToday())
    act(() => handleWeekDrop({ cardKey: 'learn-spanish/t2', target: 'day-2026-11-03' }, ctx()))
    await waitFor(() => expect(taskOf(store, 'projects/learn-spanish.md', 't2')).toContain('status: done'))
    expect(taskOf(store, 'projects/learn-spanish.md', 't2')).toContain('done: 2026-11-03')
    expect(store.files['days/2026-11-03.md']).toContain('ref: learn-spanish/t2')
    expect(store.files[`days/${T}.md`]).toContain('learn-spanish/t2') // planned history kept
  })

  it('a done entry dropped on today reopens the task in Today', async () => {
    const { store, ctx } = await harness()
    act(() => handleWeekDrop({ cardKey: 'flow-app/t3', target: `day-${T}` }, ctx()))
    await waitFor(() => expect(taskOf(store, 'projects/flow-app.md', 't3')).toContain('status: today'))
    expect(taskOf(store, 'projects/flow-app.md', 't3')).not.toContain('done:')
    expect(store.files['days/2026-11-02.md']).not.toContain('flow-app/t3')
  })

  it('a done entry dropped on a future day reopens it and plans it', async () => {
    const { store, ctx } = await harness()
    act(() => handleWeekDrop({ cardKey: 'flow-app/t3', target: 'day-2026-11-07' }, ctx()))
    await waitFor(() => expect(taskOf(store, 'projects/flow-app.md', 't3')).toContain('scheduled: 2026-11-07'))
    expect(taskOf(store, 'projects/flow-app.md', 't3')).toContain('status: todo')
    expect(store.files['days/2026-11-02.md']).not.toContain('flow-app/t3')
  })

  it('a done entry dropped on another past day is re-dated', async () => {
    const { store, ctx } = await harness()
    act(() => handleWeekDrop({ cardKey: 'flow-app/t3', target: 'day-2026-11-03' }, ctx()))
    await waitFor(() => expect(taskOf(store, 'projects/flow-app.md', 't3')).toContain('done: 2026-11-03'))
    expect(store.files['days/2026-11-03.md']).toContain('ref: flow-app/t3')
    expect(store.files['days/2026-11-02.md']).not.toContain('flow-app/t3')
  })

  it('an unscheduled task dropped on a past day is done that day', async () => {
    const { store, ctx } = await harness()
    act(() => handleWeekDrop({ cardKey: 'learn-spanish/t1', target: 'day-2026-11-02' }, ctx()))
    await waitFor(() => expect(taskOf(store, 'projects/learn-spanish.md', 't1')).toContain('status: done'))
    expect(taskOf(store, 'projects/learn-spanish.md', 't1')).toContain('done: 2026-11-02')
    expect(store.files['days/2026-11-02.md']).toContain('ref: learn-spanish/t1')
    expect(store.files['days/2026-11-02.md']).toContain('ref: flow-app/t3')
  })

  it('Unscheduled turns a done or Today task back into an undated To do task', async () => {
    const { store, ctx } = await harness(withToday())
    act(() => handleWeekDrop({ cardKey: 'flow-app/t3', target: 'unscheduled' }, ctx()))
    act(() => handleWeekDrop({ cardKey: 'learn-spanish/t2', target: 'unscheduled' }, ctx()))
    await waitFor(() => expect(taskOf(store, 'projects/flow-app.md', 't3')).toContain('status: todo'))
    await waitFor(() => expect(taskOf(store, 'projects/learn-spanish.md', 't2')).toContain('status: todo'))
    expect(taskOf(store, 'projects/flow-app.md', 't3')).not.toContain('done:')
    expect(taskOf(store, 'projects/learn-spanish.md', 't2')).not.toContain('scheduled')
    expect(store.files['days/2026-11-02.md']).not.toContain('flow-app/t3')
  })
})

describe('Week view', () => {
  async function open(files = seed()) {
    const store = new MemoryFileStore(files)
    const settings = new MemorySettings()
    const user = userEvent.setup()
    render(<App store={store} settings={settings} now={() => NOW} />)
    await screen.findByText('Buy a book')
    await user.keyboard('w')
    const view = within(await screen.findByRole('region', { name: 'Week' }))
    return { store, settings, user, view }
  }

  it('opens with "w" and from the sidebar, and the view is remembered', async () => {
    const { user, settings } = await open()
    const nav = within(screen.getByRole('navigation', { name: 'Sidebar' }))
    expect(nav.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(async () => expect(await settings.get('view')).toBe('week'))
    await user.click(nav.getByRole('button', { name: 'Board' }))
    expect(screen.queryByRole('region', { name: 'Week' })).not.toBeInTheDocument()
    await user.click(nav.getByRole('button', { name: 'Week' }))
    expect(screen.getByRole('region', { name: 'Week' })).toBeInTheDocument()
  })

  it('shows the week, today marked, scheduled and done tasks, and the Unscheduled tray', async () => {
    const { view } = await open()
    expect(head().getByRole('heading', { name: 'Week of 2 Nov – 8 Nov 2026' })).toBeInTheDocument()
    const days = ['Mon 2 Nov', 'Tue 3 Nov', 'Wed 4 Nov', 'Thu 5 Nov', 'Fri 6 Nov', 'Sat 7 Nov', 'Sun 8 Nov']
    for (const d of days) expect(view.getByRole('region', { name: d })).toBeInTheDocument()
    const wed = view.getByRole('region', { name: 'Wed 4 Nov' })
    expect(wed).toHaveAttribute('aria-current', 'date')
    expect(view.getByRole('region', { name: 'Thu 5 Nov' })).not.toHaveAttribute('aria-current')
    expect(within(wed).getByText('Wed 4')).toBeInTheDocument()
    expect(within(view.getByRole('region', { name: 'Fri 6 Nov' })).getByText('Write spec')).toBeInTheDocument()
    const mon = within(view.getByRole('region', { name: 'Mon 2 Nov' }))
    expect(mon.getByText('Pick a name').closest('.is-done')).not.toBeNull()
    expect(view.getByRole('region', { name: 'Mon 2 Nov' })).toHaveClass('is-past')
    const tray = within(view.getByRole('region', { name: 'Unscheduled' }))
    expect(tray.getByText('Set up Tauri')).toBeInTheDocument()
    expect(tray.getByText('Buy a book')).toBeInTheDocument()
    expect(tray.queryByText('Write spec')).not.toBeInTheDocument()
  })

  it('navigates to previous and next weeks and back to this week', async () => {
    const { user, view } = await open()
    await user.click(head().getByRole('button', { name: 'Next week' }))
    expect(head().getByRole('heading', { name: 'Week of 9 Nov – 15 Nov 2026' })).toBeInTheDocument()
    expect(view.queryByRole('region', { name: 'Wed 4 Nov' })).not.toBeInTheDocument()
    await user.click(head().getByRole('button', { name: 'Previous week' }))
    await user.click(head().getByRole('button', { name: 'Previous week' }))
    expect(head().getByRole('heading', { name: 'Week of 26 Oct – 1 Nov 2026' })).toBeInTheDocument()
    await user.click(head().getByRole('button', { name: 'This week' }))
    expect(head().getByRole('heading', { name: 'Week of 2 Nov – 8 Nov 2026' })).toBeInTheDocument()
  })

  it('puts the week header in the top bar, on the search box\'s line, outside the Week region', async () => {
    const { view } = await open()
    const group = screen.getByRole('group', { name: 'Week navigation' })
    expect(view.queryByRole('group', { name: 'Week navigation' })).toBeNull()
    const bar = group.closest('.topbar') as HTMLElement
    expect(bar).not.toBeNull()
    expect(within(bar).getByRole('searchbox')).toBeInTheDocument()
    expect(group.compareDocumentPosition(within(bar).getByRole('searchbox')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(group).getByRole('heading', { level: 2, name: 'Week of 2 Nov – 8 Nov 2026' })).toBeInTheDocument()
    const nav = within(screen.getByRole('navigation', { name: 'Sidebar' }))
    const userEv = userEvent.setup()
    await userEv.click(nav.getByRole('button', { name: 'Board' }))
    expect(screen.queryByRole('group', { name: 'Week navigation' })).toBeNull()
  })

  it("today's column also shows what is in Today, muted and labelled", async () => {
    const files = seed()
    files['projects/learn-spanish.md'] = project('Learn Spanish', '#30a46c', task('t1', 'Buy a book', 'todo') + task('t2', 'Practise verbs', 'today', '    planned: 2026-11-04\n'))
    const { user, view } = await open(files)
    const wed = within(view.getByRole('region', { name: 'Wed 4 Nov' }))
    const item = wed.getByText('Practise verbs').closest('li')!
    expect(item).toHaveClass('week-in-today')
    expect(within(item).getByText('In Today')).toBeInTheDocument()
    expect(within(view.getByRole('region', { name: 'Thu 5 Nov' })).queryByText('Practise verbs')).not.toBeInTheDocument()
    expect(within(view.getByRole('region', { name: 'Unscheduled' })).queryByText('Practise verbs')).not.toBeInTheDocument()
    await user.click(within(screen.getByRole('navigation', { name: 'Sidebar' })).getByRole('button', { name: 'Flow app' }))
    expect(view.queryByText('Practise verbs')).not.toBeInTheDocument()
  })

  it('In Today items and done entries of existing tasks are draggable; deleted tasks\' entries are not', async () => {
    const files = seed()
    files['projects/learn-spanish.md'] = project('Learn Spanish', '#30a46c', task('t1', 'Buy a book', 'todo') + task('t2', 'Practise verbs', 'today', '    planned: 2026-11-04\n'))
    files['days/2026-11-03.md'] = '---\ndate: 2026-11-03\nplanned: []\ndone:\n  - ref: flow-app/t9\n    title: Long gone\n    project: Flow app\n---\n'
    const { view } = await open(files)
    const draggable = (el: HTMLElement) => el.getAttribute('aria-roledescription') === 'draggable'
    const inToday = within(view.getByRole('region', { name: 'Wed 4 Nov' })).getByText('Practise verbs').closest('li')!
    expect(inToday).toHaveClass('week-in-today')
    expect(draggable(inToday)).toBe(true)
    expect(inToday).toHaveAttribute('role', 'button')
    const done = within(view.getByRole('region', { name: 'Mon 2 Nov' })).getByText('Pick a name').closest('li')!
    expect(done).toHaveClass('is-done')
    expect(draggable(done)).toBe(true)
    const gone = within(view.getByRole('region', { name: 'Tue 3 Nov' })).getByText('Long gone').closest('li')!
    expect(draggable(gone)).toBe(false)
    expect(gone).not.toHaveAttribute('role')
  })

  it('a done entry whose task is no longer done that day is not draggable', async () => {
    const files = seed()
    // External edit: t3 reopened, its snapshot left behind on Monday.
    files['projects/flow-app.md'] = files['projects/flow-app.md'].replace('status: done\n    created: 2026-11-01\n    done: 2026-11-02', 'status: todo\n    created: 2026-11-01')
    files['projects/learn-spanish.md'] = project('Learn Spanish', '#30a46c', task('t1', 'Buy a book', 'todo') + task('t2', 'Read', 'done', '    done: 2026-11-02\n'))
    files['days/2026-11-03.md'] = '---\ndate: 2026-11-03\nplanned: []\ndone:\n  - ref: learn-spanish/t2\n    title: Read\n    project: Learn Spanish\n---\n'
    const { view } = await open(files)
    const stale = within(view.getByRole('region', { name: 'Mon 2 Nov' })).getByText('Pick a name').closest('li')!
    expect(stale).not.toHaveAttribute('aria-roledescription')
    const otherDay = within(view.getByRole('region', { name: 'Tue 3 Nov' })).getByText('Read').closest('li')!
    expect(otherDay).not.toHaveAttribute('aria-roledescription')
  })

  it('puts the Unscheduled drawer above the days; it collapses and is remembered in local settings', async () => {
    const { user, view, settings, store } = await open()
    const tray = view.getByRole('region', { name: 'Unscheduled' })
    const mon = view.getByRole('region', { name: 'Mon 2 Nov' })
    expect(tray.compareDocumentPosition(mon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tray.contains(mon)).toBe(false)
    const toggle = within(tray).getByRole('button', { name: /^Unscheduled/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(tray).getByText('Buy a book')).toBeInTheDocument()
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toHaveClass('week-tray-cards')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).not.toHaveAttribute('aria-controls')
    expect(within(tray).queryByText('Buy a book')).not.toBeInTheDocument()
    expect(view.getByRole('region', { name: 'Unscheduled' })).toBeInTheDocument()
    await waitFor(async () => expect(await settings.get('weekTrayOpen')).toBe(false))
    expect(Object.values(store.files).some((t) => t.includes('weekTrayOpen'))).toBe(false)
    await user.click(toggle)
    expect(within(tray).getByText('Buy a book')).toBeInTheDocument()
    await waitFor(async () => expect(await settings.get('weekTrayOpen')).toBe(true))
  })

  it('opens with the drawer collapsed when weekTrayOpen is false', async () => {
    const store = new MemoryFileStore(seed())
    const settings = new MemorySettings()
    await settings.set('weekTrayOpen', false)
    await settings.set('view', 'week')
    render(<App store={store} settings={settings} now={() => NOW} />)
    const tray = within(await screen.findByRole('region', { name: 'Unscheduled' }))
    await waitFor(() => expect(tray.getByRole('button', { name: /^Unscheduled/ })).toHaveAttribute('aria-expanded', 'false'))
    expect(tray.queryByText('Buy a book')).not.toBeInTheDocument()
  })

  it('respects the project filter', async () => {
    const { user, view } = await open()
    await user.click(within(screen.getByRole('navigation', { name: 'Sidebar' })).getByRole('button', { name: 'Learn Spanish' }))
    const tray = within(view.getByRole('region', { name: 'Unscheduled' }))
    expect(tray.getByText('Buy a book')).toBeInTheDocument()
    expect(tray.queryByText('Set up Tauri')).not.toBeInTheDocument()
    expect(view.queryByText('Write spec')).not.toBeInTheDocument()
    expect(view.queryByText('Pick a name')).not.toBeInTheDocument()
  })
})

describe('Board card planning', () => {
  async function board(files = seed()) {
    const store = new MemoryFileStore(files)
    const user = userEvent.setup()
    render(<App store={store} settings={new MemorySettings()} now={() => NOW} />)
    await screen.findByText('Buy a book')
    return { store, user, todo: within(screen.getByRole('region', { name: 'To do' })) }
  }

  it('shows a day chip on scheduled cards only', async () => {
    const { todo } = await board()
    const chip = todo.getByLabelText('Planned for Fri 6 Nov')
    expect(chip).toHaveTextContent('Fri 6')
    expect(todo.getAllByLabelText(/^Planned for/)).toHaveLength(1)
  })

  it('"Plan for" in the edit form schedules and clears the day', async () => {
    const { store, user, todo } = await board()
    await user.click(todo.getByRole('button', { name: 'Buy a book' }))
    const date = screen.getByLabelText('Plan for')
    expect(date).toHaveValue('')
    await user.type(date, '2026-11-07')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(taskOf(store, 'projects/learn-spanish.md', 't1')).toContain('scheduled: 2026-11-07'))
    expect(todo.getByLabelText('Planned for Sat 7 Nov')).toBeInTheDocument()

    await user.click(todo.getByRole('button', { name: 'Write spec' }))
    expect(screen.getByLabelText('Plan for')).toHaveValue('2026-11-06')
    await user.clear(screen.getByLabelText('Plan for'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(taskOf(store, 'projects/flow-app.md', 't2')).not.toContain('scheduled'))
  })

  it('"Plan for" today moves the card to Today in the same save', async () => {
    const { store, user, todo } = await board()
    await user.click(todo.getByRole('button', { name: 'Buy a book' }))
    await user.clear(screen.getByRole('textbox', { name: 'Title' }))
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Buy two books')
    await user.type(screen.getByLabelText('Plan for'), T)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(within(screen.getByRole('region', { name: 'Today' })).getByText('Buy two books')).toBeInTheDocument()
    await waitFor(() => expect(taskOf(store, 'projects/learn-spanish.md', 't1')).toContain('status: today'))
    expect(taskOf(store, 'projects/learn-spanish.md', 't1')).toContain('title: Buy two books')
  })
})

describe('Week month picker', () => {
  async function open() {
    const store = new MemoryFileStore(seed())
    const settings = new MemorySettings()
    const user = userEvent.setup()
    render(<App store={store} settings={settings} now={() => NOW} />)
    await screen.findByText('Buy a book')
    await user.keyboard('w')
    const view = within(await screen.findByRole('region', { name: 'Week' }))
    const title = head().getByRole('button', { name: 'Week of 2 Nov – 8 Nov 2026' })
    return { user, view, title }
  }
  const picker = () => screen.queryByRole('dialog', { name: 'Choose month' })

  it('the week title is a button that opens and closes the picker', async () => {
    const { user, title } = await open()
    expect(head().getByRole('heading', { name: 'Week of 2 Nov – 8 Nov 2026' })).toContainElement(title)
    expect(title).toHaveAttribute('aria-haspopup', 'dialog')
    expect(title).toHaveAttribute('aria-expanded', 'false')
    expect(picker()).toBeNull()
    await user.click(title)
    expect(title).toHaveAttribute('aria-expanded', 'true')
    const dlg = within(picker()!)
    expect(dlg.getByText('2026')).toBeInTheDocument()
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    expect(dlg.getAllByRole('button').filter((b) => months.includes(b.textContent ?? '')).map((b) => b.textContent)).toEqual(months)
    expect(dlg.getByRole('button', { name: 'March 2026' })).toBeInTheDocument()
    await user.click(title)
    expect(picker()).toBeNull()
    expect(title).toHaveAttribute('aria-expanded', 'false')
  })

  it('highlights the shown week\'s month and marks today\'s month; focus starts on the shown month', async () => {
    const { user, title } = await open()
    await user.click(head().getByRole('button', { name: 'Next week' }))
    await user.click(head().getByRole('button', { name: 'Next week' }))
    await user.click(head().getByRole('button', { name: 'Next week' }))
    await user.click(head().getByRole('button', { name: 'Next week' })) // 30 Nov – 6 Dec: contains 1 Dec
    await user.click(head().getByRole('button', { name: 'Week of 30 Nov – 6 Dec 2026' }))
    const dlg = within(picker()!)
    const dec = dlg.getByRole('button', { name: 'December 2026' })
    expect(dec).toHaveAttribute('aria-current', 'true')
    expect(dec).toHaveFocus()
    const nov = dlg.getByRole('button', { name: 'November 2026' })
    expect(nov).not.toHaveAttribute('aria-current')
    expect(nov).toHaveClass('is-today')
    expect(dec).not.toHaveClass('is-today')
    void title
  })

  it('year arrows change the year (up = previous, down = next); highlight only in the shown year', async () => {
    const { user, title } = await open()
    await user.click(title)
    const dlg = within(picker()!)
    await user.click(dlg.getByRole('button', { name: 'Next year' }))
    expect(dlg.getByText('2027')).toBeInTheDocument()
    expect(dlg.getByRole('button', { name: 'November 2027' })).not.toHaveAttribute('aria-current')
    expect(dlg.getByRole('button', { name: 'November 2027' })).not.toHaveClass('is-today')
    await user.click(dlg.getByRole('button', { name: 'Previous year' }))
    await user.click(dlg.getByRole('button', { name: 'Previous year' }))
    expect(dlg.getByText('2025')).toBeInTheDocument()
  })

  it('choosing a month shows the week containing its 1st, closes and refocuses the title', async () => {
    const { user, view, title } = await open()
    await user.click(title)
    await user.click(within(picker()!).getByRole('button', { name: 'Next year' }))
    await user.click(within(picker()!).getByRole('button', { name: 'March 2027' }))
    expect(picker()).toBeNull()
    const t = head().getByRole('button', { name: 'Week of 1 Mar – 7 Mar 2027' })
    expect(t).toHaveFocus()
    expect(view.getByRole('region', { name: 'Mon 1 Mar' })).toBeInTheDocument()
    // Prev/next and This week still work from there.
    await user.click(head().getByRole('button', { name: 'Previous week' }))
    expect(head().getByRole('heading', { name: 'Week of 22 Feb – 28 Feb 2027' })).toBeInTheDocument()
    await user.click(head().getByRole('button', { name: 'This week' }))
    expect(head().getByRole('heading', { name: 'Week of 2 Nov – 8 Nov 2026' })).toBeInTheDocument()
  })

  it('a month whose 1st is a Sunday shows the week ending on it', async () => {
    const { user, title } = await open()
    await user.click(title)
    await user.click(within(picker()!).getByRole('button', { name: 'Previous year' })) // 2025
    await user.click(within(picker()!).getByRole('button', { name: 'June 2025' })) // Sun 1 Jun 2025
    expect(head().getByRole('heading', { name: 'Week of 26 May – 1 Jun 2025' })).toBeInTheDocument()
    await user.click(head().getByRole('button', { name: 'Week of 26 May – 1 Jun 2025' }))
    expect(within(picker()!).getByRole('button', { name: 'June 2025' })).toHaveAttribute('aria-current', 'true')
  })

  it('Escape closes without changing the week and refocuses the title; an outside click closes', async () => {
    const { user, view, title } = await open()
    await user.click(title)
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{Escape}')
    expect(picker()).toBeNull()
    expect(title).toHaveFocus()
    expect(head().getByRole('heading', { name: 'Week of 2 Nov – 8 Nov 2026' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Week' })).toBeInTheDocument()
    await user.click(title)
    await user.click(view.getByRole('region', { name: 'Mon 2 Nov' }))
    expect(picker()).toBeNull()
    expect(head().getByRole('heading', { name: 'Week of 2 Nov – 8 Nov 2026' })).toBeInTheDocument()
  })

  it('keyboard: arrows move between months (across years), Enter and Space choose', async () => {
    const { user, title } = await open()
    await user.click(title)
    const dlg = within(picker()!)
    expect(dlg.getByRole('button', { name: 'November 2026' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(dlg.getByRole('button', { name: 'December 2026' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(dlg.getByRole('button', { name: 'August 2026' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(dlg.getByRole('button', { name: 'July 2026' })).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(dlg.getByRole('button', { name: 'March 2027' })).toHaveFocus()
    expect(dlg.getByText('2027')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(head().getByRole('heading', { name: 'Week of 1 Mar – 7 Mar 2027' })).toBeInTheDocument()
    const t2 = head().getByRole('button', { name: 'Week of 1 Mar – 7 Mar 2027' })
    expect(t2).toHaveFocus()
    await user.keyboard('{Enter}') // reopens from the title
    expect(within(picker()!).getByRole('button', { name: 'March 2027' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    expect(within(picker()!).getByRole('button', { name: 'December 2026' })).toHaveFocus()
    await user.keyboard(' ')
    expect(head().getByRole('heading', { name: 'Week of 30 Nov – 6 Dec 2026' })).toBeInTheDocument()
  })

  it('Tab cycles inside the picker', async () => {
    const { user, title } = await open()
    await user.click(title)
    const dlg = within(picker()!)
    const nov = dlg.getByRole('button', { name: 'November 2026' })
    expect(nov).toHaveFocus()
    await user.tab()
    expect(dlg.getByRole('button', { name: 'Previous year' })).toHaveFocus()
    await user.tab()
    expect(dlg.getByRole('button', { name: 'Next year' })).toHaveFocus()
    await user.tab()
    expect(nov).toHaveFocus()
    await user.tab({ shift: true })
    expect(dlg.getByRole('button', { name: 'Next year' })).toHaveFocus()
    expect(picker()).not.toBeNull()
  })

  it('app shortcuts do not fire while the picker is open', async () => {
    const { user, title } = await open()
    await user.click(title)
    await user.keyboard('b')
    await user.keyboard('p')
    expect(screen.getByRole('region', { name: 'Week' })).toBeInTheDocument()
    expect(picker()).not.toBeNull()
    await user.click(within(picker()!).getByRole('button', { name: 'Next year' }))
    await user.keyboard('b')
    expect(screen.getByRole('region', { name: 'Week' })).toBeInTheDocument()
  })
})
