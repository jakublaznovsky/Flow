import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'

const NOW = new Date(2026, 10, 3, 10, 0)
const seed = (): Record<string, string> => ({
  'projects/flow-app.md': '---\ntitle: Flow app\nstatus: active\ncolor: "#4f8cff"\ncreated: 2026-11-01\ntasks:\n' +
    '  - id: t1\n    title: Set up Tauri\n    status: todo\n    created: 2026-11-01\n' +
    '    steps:\n      - text: Install Rust\n        done: true\n      - text: Run init\n        done: false\n' +
    '  - id: t2\n    title: Write spec\n    status: today\n    created: 2026-11-01\n' +
    '  - id: t3\n    title: Old win\n    status: done\n    created: 2026-11-01\n    done: 2026-11-03\n---\n',
})

async function setup(settings = new MemorySettings()) {
  const store = new MemoryFileStore(seed())
  const user = userEvent.setup()
  render(<App store={store} settings={settings} now={() => NOW} />)
  await screen.findByText('Set up Tauri')
  const bar = () => within(screen.getByRole('region', { name: 'Done' }))
  const toggle = () => screen.getByRole('button', { name: /^Done today \(\d+\)$/ })
  return { store, settings, user, bar, toggle }
}

describe('Done bar', () => {
  it('sits under the columns, is open by default and lists today\'s done cards', async () => {
    const { bar, toggle } = await setup()
    const region = screen.getByRole('region', { name: 'Done' })
    expect(region.closest('.columns')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Done today (1)' })).toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(bar().getByText('Old win')).toBeInTheDocument()
    expect(bar().getByRole('checkbox', { name: 'Done: Old win' })).toBeChecked()
  })

  it('ticking a card adds it (count updates); its checkbox there reopens it into Today', async () => {
    const { bar, user } = await setup()
    await user.click(screen.getByRole('checkbox', { name: 'Done: Write spec' }))
    expect(bar().getByText('Write spec')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Done today (2)' })).toBeInTheDocument()
    await user.click(bar().getByRole('checkbox', { name: 'Done: Write spec' }))
    expect(bar().queryByText('Write spec')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Today' })).getByText('Write spec')).toBeInTheDocument()
  })

  it('done cards are compact: title, pill and tag, no checklist', async () => {
    const { bar, user } = await setup()
    await user.click(screen.getByRole('checkbox', { name: 'Done: Set up Tauri' }))
    const card = bar().getByText('Set up Tauri').closest('li') as HTMLElement
    expect(card).toHaveClass('is-compact')
    expect(within(card).getByLabelText('1 of 2 steps done')).toBeInTheDocument()
    expect(within(card).getByText('Flow app')).toHaveClass('tag-text')
    expect(within(card).queryByRole('textbox', { name: 'Add step' })).not.toBeInTheDocument()
    expect(within(card).queryByRole('checkbox', { name: 'Run init' })).not.toBeInTheDocument()
  })

  it('collapses to its header (still the Done region) and remembers that in local settings', async () => {
    const { bar, toggle, user, settings, store } = await setup()
    await user.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(bar().queryByText('Old win')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Done today (1)' })).toBeInTheDocument()
    await waitFor(async () => expect(await settings.get('doneBarOpen')).toBe(false))
    expect(Object.values(store.files).some((t) => t.includes('doneBarOpen'))).toBe(false)
    // Ticking while collapsed still completes the task and updates the count.
    await user.click(screen.getByRole('checkbox', { name: 'Done: Write spec' }))
    expect(screen.getByRole('heading', { name: 'Done today (2)' })).toBeInTheDocument()
    await user.click(toggle())
    expect(bar().getByText('Write spec')).toBeInTheDocument()
    await waitFor(async () => expect(await settings.get('doneBarOpen')).toBe(true))
  })

  it('opens collapsed when doneBarOpen is false in settings', async () => {
    const settings = new MemorySettings()
    await settings.set('doneBarOpen', false)
    const { bar, toggle } = await setup(settings)
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-expanded', 'false'))
    expect(bar().queryByText('Old win')).not.toBeInTheDocument()
  })

  it('the "Done" column setting hides the whole bar', async () => {
    const settings = new MemorySettings()
    await settings.set('hiddenColumns', ['done'])
    await setup(settings)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Done' })).not.toBeInTheDocument())
    expect(screen.getByRole('region', { name: 'Today' })).toBeInTheDocument()
    // Hidden, not gone: ticking still completes the task.
    act(() => screen.getByRole('checkbox', { name: 'Done: Write spec' }).click())
    expect(screen.queryByText('Write spec')).not.toBeInTheDocument()
  })
})
