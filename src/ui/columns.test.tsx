import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { cleanHiddenColumns } from './Board'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'

const NOW = new Date(2026, 10, 4, 10, 0)
const seed = (): Record<string, string> => ({
  'inbox.md': `---\nitems:\n  - id: i1\n    text: Look into podcasts\n    created: 2026-11-01\n---\n`,
  'projects/flow-app.md': '---\ntitle: Flow app\nstatus: active\ncolor: "#4f8cff"\ncreated: 2026-11-01\ntasks:\n' +
    '  - id: t1\n    title: Set up Tauri\n    status: todo\n    created: 2026-11-01\n' +
    '  - id: t2\n    title: Write spec\n    status: todo\n    created: 2026-11-01\n    scheduled: 2026-11-04\n---\n',
})
const ALL = ['Parking lot', 'To do', 'Today', 'Tomorrow', 'Done']

async function setup(settings = new MemorySettings(), props: Partial<Parameters<typeof App>[0]> = {}) {
  const store = new MemoryFileStore(seed())
  const user = userEvent.setup()
  render(<App store={store} settings={settings} now={() => NOW} {...props} />)
  await screen.findByRole('region', { name: 'Done' })
  return { store, settings, user }
}
/** Board columns and the Done bar, in page order ("Done today (N)" counts as Done). */
const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.startsWith('Done today') ? 'Done' : h.textContent)
  .filter((t) => t && ALL.includes(t))
async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Settings' }))
  return within(await screen.findByRole('group', { name: 'Board columns' }))
}

describe('Board columns setting', () => {
  it('shows five checked boxes labelled with the column titles by default', async () => {
    const { user } = await setup()
    const group = await openSettings(user)
    const boxes = group.getAllByRole('checkbox')
    expect(boxes.map((b) => b.closest('label')?.textContent)).toEqual(ALL)
    for (const b of boxes) expect(b).toBeChecked()
  })

  it('hides columns on the board (order kept) and persists in local settings, not the Flow folder', async () => {
    const { user, settings, store } = await setup()
    const group = await openSettings(user)
    await user.click(group.getByRole('checkbox', { name: 'Tomorrow' }))
    await user.click(group.getByRole('checkbox', { name: 'Parking lot' }))
    await waitFor(async () => expect(await settings.get('hiddenColumns')).toEqual(['inbox', 'tomorrow']))
    expect(Object.values(store.files).some((t) => t.includes('hiddenColumns'))).toBe(false)
    await user.keyboard('b')
    await screen.findByText('Set up Tauri')
    expect(headings()).toEqual(['To do', 'Today', 'Done'])
    expect(screen.queryByText('Look into podcasts')).not.toBeInTheDocument()
  })

  it('restores hidden columns from settings; hidden cards keep their data and promotion still runs', async () => {
    const settings = new MemorySettings()
    await settings.set('hiddenColumns', ['today', 'inbox'])
    const { store } = await setup(settings)
    await waitFor(() => expect(headings()).toEqual(['To do', 'Tomorrow', 'Done']))
    // t2 was scheduled for today: promoted into the (hidden) Today column and saved.
    await waitFor(() => expect(store.files['projects/flow-app.md']).toMatch(/id: t2[\s\S]*status: today/))
    expect(screen.queryByText('Write spec')).not.toBeInTheDocument()
    expect(store.files['inbox.md']).toContain('Look into podcasts')
  })

  it('ignores unknown ids and never hides all four columns (the Done bar does not count)', () => {
    expect(cleanHiddenColumns(['done', 'nope', 'todo'])).toEqual(['todo', 'done'])
    expect(cleanHiddenColumns(['inbox', 'todo', 'tomorrow', 'today', 'done'])).toEqual(['done'])
    expect(cleanHiddenColumns(['inbox', 'todo', 'tomorrow', 'today'])).toEqual([])
    expect(cleanHiddenColumns('todo')).toEqual([])
  })

  it('disables the last checked column box with a calm title; Done stays free', async () => {
    const { user } = await setup()
    const group = await openSettings(user)
    for (const n of ['Parking lot', 'To do', 'Today']) await user.click(group.getByRole('checkbox', { name: n }))
    const tomorrow = group.getByRole('checkbox', { name: 'Tomorrow' })
    const done = group.getByRole('checkbox', { name: 'Done' })
    expect(tomorrow).toBeChecked()
    expect(tomorrow).toBeDisabled()
    expect(tomorrow).toHaveAttribute('title', 'At least one column stays visible')
    expect(done).toBeEnabled()
    await user.click(done)
    expect(done).not.toBeChecked()
    expect(tomorrow).toBeDisabled()
    await user.click(group.getByRole('checkbox', { name: 'Today' }))
    expect(tomorrow).toBeEnabled()
    expect(tomorrow).not.toHaveAttribute('title')
  })

  it('"n" does nothing while To do is hidden, and opens its form once shown again', async () => {
    const settings = new MemorySettings()
    await settings.set('hiddenColumns', ['todo'])
    const { user } = await setup(settings)
    await waitFor(() => expect(headings()).not.toContain('To do'))
    await user.keyboard('n')
    expect(screen.queryByRole('textbox', { name: 'New task' })).not.toBeInTheDocument()
    const group = await openSettings(user)
    await user.click(group.getByRole('checkbox', { name: 'To do' }))
    await user.keyboard('n')
    const input = within(await screen.findByRole('region', { name: 'To do' })).getByRole('textbox', { name: 'New task' })
    expect(input).toHaveFocus()
  })
})

describe('Quick capture status line', () => {
  it('is not shown in the browser (no status)', async () => {
    const { user } = await setup()
    await openSettings(user)
    expect(screen.queryByText(/Quick capture/)).not.toBeInTheDocument()
  })

  it('names the shortcut when it is registered', async () => {
    const { user } = await setup(new MemorySettings(), { shortcut: { ok: true, label: 'Ctrl+Shift+Space' } })
    await openSettings(user)
    expect(screen.getByText('Quick capture: Ctrl+Shift+Space')).toBeInTheDocument()
  })

  it('says calmly when it is unavailable', async () => {
    const { user } = await setup(new MemorySettings(), { shortcut: { ok: false, label: 'Ctrl+Shift+Space' } })
    await openSettings(user)
    expect(screen.getByText("Quick capture shortcut isn't available — another app may be using it.")).toBeInTheDocument()
  })
})
