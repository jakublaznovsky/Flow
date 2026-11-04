import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'

const NOW = new Date(2026, 10, 4, 10, 0) // Wednesday 2026-11-04
const day = (date: string, done: string, body = '') =>
  `---\ndate: ${date}\nplanned: []\ndone:\n  - ref: flow-app/t1\n    title: ${done}\n    project: flow-app\nfocus:\n  - ref: flow-app/t1\n    title: ${done}\n    project: flow-app\n    minutes: 25\n---\n${body}`
const seed = (): Record<string, string> => ({
  'projects/flow-app.md': '---\ntitle: Flow app\nstatus: active\ncolor: "#4f8cff"\ncreated: 2026-11-01\ntasks:\n' +
    '  - id: t1\n    title: Write spec\n    status: done\n    created: 2026-11-01\n    done: 2026-11-02\n' +
    '  - id: t2\n    title: Build it\n    status: todo\n    created: 2026-11-01\n---\n',
  'days/2026-11-02.md': day('2026-11-02', 'Write spec'),
  'days/2026-11-04.md': day('2026-11-04', 'Ship it', 'earlier note\n'),
})

async function setup(files = seed(), clipboard?: { writeText: (t: string) => Promise<void> } | null) {
  const store = new MemoryFileStore(files)
  const user = userEvent.setup() // installs its own clipboard stub, so override afterwards
  if (clipboard !== undefined) Object.defineProperty(navigator, 'clipboard', { value: clipboard ?? undefined, configurable: true })
  render(<App store={store} settings={new MemorySettings()} now={() => NOW} />)
  await screen.findByRole('heading', { name: 'To do' })
  await user.keyboard('p')
  const view = await screen.findByRole('region', { name: 'Progress' })
  return { store, user, view: within(view) }
}

afterEach(() => { vi.useRealTimers(); Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }) })

describe('ProgressView', () => {
  it('shows no streak text', async () => {
    const { view } = await setup()
    expect(view.queryByText(/streak/i)).not.toBeInTheDocument()
  })

  it('lists done titles and focus minutes on the right day, today marked', async () => {
    const { view } = await setup()
    const week = within(view.getByRole('region', { name: 'This week' }))
    const mon = week.getByRole('group', { name: /Mon.*2026-11-02/ })
    expect(within(mon).getByText('Write spec')).toBeInTheDocument()
    expect(within(mon).getByText('25 min')).toBeInTheDocument()
    const wed = week.getByRole('group', { name: /Wed.*2026-11-04/ })
    expect(wed).toHaveAttribute('aria-current', 'date')
    expect(within(wed).getByText('Ship it')).toBeInTheDocument()
    expect(week.getAllByRole('group')).toHaveLength(7)
  })

  it('draws a 371-cell heatmap with titles and levels', async () => {
    const { view } = await setup()
    const cells = view.getByRole('region', { name: 'Year' }).querySelectorAll('.heat-cell')
    expect(cells).toHaveLength(371)
    const today = view.getByTitle('2026-11-04: 1 done')
    expect(today).toHaveClass('level-1')
    expect(view.getByTitle('2026-11-03: 0 done')).toHaveClass('level-0')
    expect(view.getByTitle('2026-11-05')).toHaveClass('future')
  })

  it('shows project progress', async () => {
    const { view } = await setup()
    const projects = within(view.getByRole('region', { name: 'Projects' }))
    expect(projects.getByText('Flow app')).toBeInTheDocument()
    expect(projects.getByText('1 of 2 done')).toBeInTheDocument()
    expect(projects.getByText('2 done in last 7 days')).toBeInTheDocument()
    expect(projects.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
  })

  it("saves today's note on blur into days/<today>.md", async () => {
    const { store, user, view } = await setup()
    const note = view.getByRole('textbox', { name: "Today's note" })
    expect(note).toHaveValue('earlier note\n')
    await user.clear(note)
    await user.type(note, 'Calm day')
    await user.tab()
    await waitFor(async () => expect(await store.read('days/2026-11-04.md')).toContain('Calm day'))
    const text = (await store.read('days/2026-11-04.md'))!
    expect(text).toContain('Ship it')
  })

  it('does not create a day file for an empty note', async () => {
    const files = seed(); delete files['days/2026-11-04.md']
    const { store, user, view } = await setup(files)
    const note = view.getByRole('textbox', { name: "Today's note" })
    await user.click(note)
    await user.tab()
    expect(await store.read('days/2026-11-04.md')).toBeNull()
  })

  it('copies the review prompt and reverts the label after 2 s', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const { view } = await setup(seed(), { writeText })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const btn = view.getByRole('button', { name: 'Copy AI review' })
    await act(async () => { btn.click() })
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Last 7 days'))
    expect(view.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(2100) })
    expect(view.getByRole('button', { name: 'Copy AI review' })).toBeInTheDocument()
  })

  it('shows a read-only textarea when the clipboard rejects', async () => {
    const { view, user } = await setup(seed(), { writeText: () => Promise.reject(new Error('no')) })
    await user.click(view.getByRole('button', { name: 'Copy AI review' }))
    const ta = await view.findByRole('textbox', { name: 'AI review prompt' })
    expect(ta).toHaveAttribute('readonly')
    expect((ta as HTMLTextAreaElement).value).toContain('Last 7 days')
  })

  it('shows the textarea when there is no clipboard', async () => {
    const { view, user } = await setup(seed(), null)
    await user.click(view.getByRole('button', { name: 'Copy AI review' }))
    expect(await view.findByRole('textbox', { name: 'AI review prompt' })).toBeInTheDocument()
  })
})
