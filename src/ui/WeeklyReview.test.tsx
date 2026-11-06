import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'

const NOW = new Date(2026, 10, 4, 10, 0) // Wednesday 2026-11-04, ISO week 2026-W45
const REVIEW = 'reviews/2026-W45.md'
const projectFile = (title: string, tasks: string) =>
  `---\ntitle: ${title}\nstatus: active\ncolor: "#4f8cff"\ncreated: 2026-11-01\ntasks:\n${tasks}---\n`
const seed = (): Record<string, string> => ({
  'projects/flow-app.md': projectFile('Flow app',
    '  - id: t1\n    title: Write spec\n    status: done\n    created: 2026-11-01\n    done: 2026-11-02\n' +
    '  - id: t2\n    title: In today task\n    status: today\n    created: 2026-11-01\n' +
    '  - id: t3\n    title: Friday task\n    status: todo\n    created: 2026-11-01\n    scheduled: 2026-11-06\n' +
    '  - id: t4\n    title: Unplanned task\n    status: todo\n    created: 2026-11-01\n'),
  'projects/learn-spanish.md': projectFile('Learn Spanish', '  - id: t1\n    title: Verbs\n    status: todo\n    created: 2026-11-01\n'),
  'days/2026-11-02.md': '---\ndate: 2026-11-02\nplanned: []\ndone:\n  - ref: flow-app/t1\n    title: Write spec\n    project: Flow app\nfocus:\n  - ref: flow-app/t1\n    title: Write spec\n    project: Flow app\n    minutes: 25\n---\n',
})

async function setup(files = seed(), settings = new MemorySettings()) {
  const store = new MemoryFileStore(files)
  const user = userEvent.setup()
  render(<App store={store} settings={settings} now={() => NOW} />)
  await screen.findByRole('heading', { name: 'To do' })
  return { store, user }
}
const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.keyboard('r')
  return await screen.findByRole('region', { name: 'Weekly review' })
}
const next = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Next' }))
const row = (title: string) => within(screen.getByRole('list', { name: 'Unfinished tasks' })).getByRole('listitem', { name: title })

afterEach(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }) })

describe('WeeklyReview', () => {
  it('"r" and the sidebar item open it at step 1 (the next start opens on the Board); opening writes nothing', async () => {
    const settings = new MemorySettings()
    const { store, user } = await setup(seed(), settings)
    await user.click(screen.getByRole('button', { name: /Weekly review/ }))
    const view = within(await screen.findByRole('region', { name: 'Weekly review' }))
    expect(view.getByRole('listitem', { current: 'step' })).toHaveTextContent('1 Your week')
    expect(view.getAllByRole('listitem').slice(0, 4).map((l) => l.textContent)).toEqual(['1 Your week', '2 Unfinished', '3 Next week', '4 Reflect'])
    expect(store.files[REVIEW]).toBeUndefined()
    await waitFor(async () => expect(await settings.get('view')).toBe('board'))
    await user.keyboard('b')
    await open(user)
  })

  it('step 1 shows the week: done per day and total focus minutes', async () => {
    const { user } = await setup()
    const view = within(await open(user))
    const mon = view.getByRole('group', { name: /Mon.*2026-11-02/ })
    expect(within(mon).getByText('Write spec')).toBeInTheDocument()
    expect(view.getAllByRole('group')).toHaveLength(7)
    expect(view.getByText('25 min focused')).toBeInTheDocument()
  })

  it('Back and Next sit together at the end of the card, after the step content', async () => {
    const { user } = await setup()
    const region = await open(user)
    const navOf = (name: string) => screen.getByRole('button', { name }).parentElement!
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    expect(region.querySelector('.review-card')!.lastElementChild).toBe(navOf('Next'))
    await next(user)
    const nav = navOf('Next')
    expect(navOf('Back')).toBe(nav)
    expect([...nav.children].map((b) => b.textContent)).toEqual(['Back', 'Next'])
    expect(region.querySelector('.review-card')!.lastElementChild).toBe(nav)
  })

  it('step 2 lists Today and this week\'s scheduled tasks only; Back returns to step 1', async () => {
    const { user } = await setup()
    await open(user)
    await next(user)
    const list = within(screen.getByRole('list', { name: 'Unfinished tasks' }))
    expect(list.getAllByRole('listitem').map((l) => l.getAttribute('aria-label')).sort()).toEqual(['Friday task', 'In today task'])
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('1 Your week')
  })

  it('Keep in Today moves a To do task to Today and shows it as kept; a Today task stays', async () => {
    const { store, user } = await setup()
    await open(user); await next(user)
    await user.click(within(row('Friday task')).getByRole('button', { name: 'Keep in Today' }))
    expect(within(row('Friday task')).getByText('Kept in Today')).toBeInTheDocument()
    await user.click(within(row('In today task')).getByRole('button', { name: 'Keep in Today' }))
    expect(within(row('In today task')).getByText('Kept in Today')).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/flow-app.md']).toMatch(/title: Friday task\n\s+status: today/))
    expect(store.files['projects/flow-app.md']).not.toContain('scheduled')
  })

  it('Next week schedules next Monday (2026-11-09) and leaves Today', async () => {
    const { store, user } = await setup()
    await open(user); await next(user)
    await user.click(within(row('In today task')).getByRole('button', { name: 'Next week' }))
    expect(within(row('In today task')).getByText('Next week: Mon 9 Nov')).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/flow-app.md']).toMatch(/title: In today task\n\s+status: todo[\s\S]*?scheduled: 2026-11-09/))
  })

  it('Back to To do clears the planned day', async () => {
    const { store, user } = await setup()
    await open(user); await next(user)
    await user.click(within(row('Friday task')).getByRole('button', { name: 'Back to To do' }))
    expect(within(row('Friday task')).getByText('Back in To do')).toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/flow-app.md']).not.toContain('scheduled'))
    expect(store.files['projects/flow-app.md']).toMatch(/title: Friday task\n\s+status: todo/)
  })

  it('Today task Back to To do moves it to To do', async () => {
    const { store, user } = await setup()
    await open(user); await next(user)
    await user.click(within(row('In today task')).getByRole('button', { name: 'Back to To do' }))
    await waitFor(() => expect(store.files['projects/flow-app.md']).toMatch(/title: In today task\n\s+status: todo/))
  })

  it('Delete removes the task at once, no confirmation', async () => {
    const { store, user } = await setup()
    await open(user); await next(user)
    await user.click(within(row('Friday task')).getByRole('button', { name: 'Delete' }))
    expect(screen.queryByRole('listitem', { name: 'Friday task' })).not.toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/flow-app.md']).not.toContain('Friday task'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says so calmly when nothing is unfinished', async () => {
    const { user } = await setup({ 'projects/a.md': projectFile('A', '  - id: t1\n    title: x\n    status: todo\n    created: 2026-11-01\n') })
    await open(user); await next(user)
    expect(screen.getByText('Nothing unfinished this week.')).toBeInTheDocument()
  })

  it('step 3 saves the focus project and intention, and the sidebar shows a star', async () => {
    const { store, user } = await setup()
    await open(user); await next(user); await next(user)
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).labels?.[0].textContent)).toEqual(['No focus', 'Flow app', 'Learn Spanish'])
    expect(screen.getByRole('radio', { name: 'No focus' })).toBeChecked()
    expect(screen.getByText(/shown with a ★ next week/)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Learn Spanish' }))
    await user.type(screen.getByRole('textbox', { name: 'Intention' }), 'Speak a little')
    await user.tab()
    await waitFor(() => expect(store.files[REVIEW]).toContain('focus_project: learn-spanish'))
    expect(store.files[REVIEW]).toContain('intention: Speak a little')
    const sidebar = within(screen.getByRole('navigation', { name: 'Sidebar' }))
    const star = sidebar.getByLabelText("This week's focus")
    expect(star.closest('li')).toHaveTextContent('Learn Spanish')
    expect(sidebar.getAllByLabelText("This week's focus")).toHaveLength(1)
    await user.click(screen.getByRole('radio', { name: 'No focus' }))
    await waitFor(() => expect(store.files[REVIEW]).not.toContain('focus_project'))
    expect(sidebar.queryByLabelText("This week's focus")).not.toBeInTheDocument()
  })

  it('step 4 saves the reflection on blur; reopening edits the same file; Finish returns to the Board', async () => {
    const { store, user } = await setup()
    await open(user); await next(user); await next(user); await next(user)
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('4 Reflect')
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Reflection' }), 'A good week')
    await user.tab()
    await waitFor(() => expect(store.files[REVIEW]).toContain('A good week'))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByRole('heading', { name: 'To do' })).toBeInTheDocument()

    await open(user); await next(user); await next(user); await next(user)
    const box = screen.getByRole('textbox', { name: 'Reflection' })
    expect(box).toHaveValue('A good week')
    await user.type(box, ' indeed')
    await user.tab()
    await waitFor(() => expect(store.files[REVIEW]).toContain('A good week indeed'))
    expect(Object.keys(store.files).filter((p) => p.startsWith('reviews/'))).toEqual([REVIEW])
  })

  it('Copy AI review copies the prompt to the clipboard', async () => {
    const { user } = await setup()
    await open(user); await next(user); await next(user); await next(user)
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await user.click(screen.getByRole('button', { name: 'Copy AI review' }))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('## Last 7 days'))
  })

  it('Copy AI review shows the prompt when the clipboard is unavailable', async () => {
    const { user } = await setup()
    await open(user); await next(user); await next(user); await next(user)
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    await user.click(screen.getByRole('button', { name: 'Copy AI review' }))
    const ta = await screen.findByRole('textbox', { name: 'AI review prompt' })
    expect((ta as HTMLTextAreaElement).value).toContain('## Last 7 days')
  })

  it('an existing review is shown in the steps', async () => {
    const { user } = await setup({ ...seed(), [REVIEW]: '---\nweek: 2026-W45\nfocus_project: flow-app\nintention: Ship\n---\nNotes so far\n' })
    await open(user); await next(user); await next(user)
    expect(screen.getByRole('radio', { name: 'Flow app' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Intention' })).toHaveValue('Ship')
    await next(user)
    expect(screen.getByRole('textbox', { name: 'Reflection' })).toHaveValue('Notes so far\n')
  })
  it('blur without typing keeps an outside change to the reflection and intention', async () => {
    const before = '---\nweek: 2026-W45\nintention: Ship\n---\nNotes so far\n'
    const after = '---\nweek: 2026-W45\nintention: Rest\n---\nEdited elsewhere\n'
    const { store, user } = await setup({ ...seed(), [REVIEW]: before })
    await open(user); await next(user); await next(user)
    const intention = screen.getByRole('textbox', { name: 'Intention' })
    await user.click(intention)
    await act(async () => { store.externalWrite(REVIEW, after); await new Promise((r) => setTimeout(r, 50)) })
    await user.tab()
    await waitFor(() => expect(intention).toHaveValue('Rest'))
    await next(user)
    const box = screen.getByRole('textbox', { name: 'Reflection' })
    await user.click(box)
    await act(async () => { store.externalWrite(REVIEW, before); await new Promise((r) => setTimeout(r, 50)) })
    await user.tab()
    await waitFor(() => expect(box).toHaveValue('Notes so far\n'))
    expect(store.files[REVIEW]).toBe(before)
  })
})
