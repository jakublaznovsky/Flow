import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'

const NOW = new Date(2026, 10, 3, 10, 0)
const project = (tasks: string) =>
  `---\ntitle: Flow app\nstatus: active\ncolor: "#4f8cff"\ncreated: 2026-11-01\ntasks:\n${tasks}---\n`
const seed = (): Record<string, string> => ({
  'projects/flow-app.md': project(
    '  - id: t1\n    title: Set up Tauri\n    status: todo\n    created: 2026-11-01\n' +
    '    steps:\n      - text: Install Rust\n        done: true\n      - text: Run init\n        done: false\n      - text: Commit\n        done: false\n' +
    '  - id: t2\n    title: Write spec\n    status: today\n    created: 2026-11-01\n'),
})

async function setup() {
  const store = new MemoryFileStore(seed())
  render(<App store={store} settings={new MemorySettings()} now={() => NOW} />)
  await screen.findByText('Set up Tauri')
  const file = () => store.files['projects/flow-app.md']
  const card = (title: string) => screen.getByText(title).closest('li') as HTMLElement
  return { store, file, card, user: userEvent.setup() }
}
afterEach(() => vi.useRealTimers())

describe('card checklist', () => {
  it('shows a progress pill and the next step when collapsed', async () => {
    const { card } = await setup()
    const c = within(card('Set up Tauri'))
    expect(c.getByLabelText('1 of 3 steps done')).toHaveTextContent('1/3')
    expect(c.getByText('Next: Run init')).toBeInTheDocument()
    expect(c.queryByRole('list')).not.toBeInTheDocument()
    expect(c.getByRole('button', { name: 'Show steps' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows no pill on a task without steps but offers the chevron', async () => {
    const { card } = await setup()
    const c = within(card('Write spec'))
    expect(c.queryByText(/steps? done/)).not.toBeInTheDocument()
    expect(c.getByRole('button', { name: 'Show steps' })).toBeInTheDocument()
  })

  it('expands, ticks a step, and persists without changing task status', async () => {
    const { card, file, user } = await setup()
    await user.click(within(card('Set up Tauri')).getByRole('button', { name: 'Show steps' }))
    const c = within(card('Set up Tauri'))
    expect(c.getByRole('button', { name: 'Hide steps' })).toHaveAttribute('aria-expanded', 'true')
    expect(c.getAllByRole('listitem')).toHaveLength(3)
    await user.click(c.getByRole('checkbox', { name: 'Run init' }))
    await user.click(c.getByRole('checkbox', { name: 'Commit' }))
    await vi.waitFor(() => expect(file()).toMatch(/text: Commit\n\s+done: true/))
    expect(file()).toMatch(/text: Run init\n\s+done: true/)
    expect(file()).toMatch(/title: Set up Tauri\n\s+status: todo/)
    expect(c.getByLabelText('3 of 3 steps done')).toBeInTheDocument()
    expect(c.queryByText(/^Next:/)).not.toBeInTheDocument()
  })

  it('adds steps with Enter and keeps focus for the next', async () => {
    const { card, file, user } = await setup()
    await user.click(within(card('Write spec')).getByRole('button', { name: 'Show steps' }))
    const input = within(card('Write spec')).getByRole('textbox', { name: 'Add step' })
    await user.type(input, 'Outline{Enter}Draft{Enter}')
    await vi.waitFor(() => expect(file()).toMatch(/text: Draft/))
    expect(file()).toMatch(/text: Outline\n\s+done: false/)
    expect(input).toHaveFocus()
    expect(input).toHaveValue('')
    expect(within(card('Write spec')).getByLabelText('0 of 2 steps done')).toBeInTheDocument()
  })

  it('edits a step inline: Enter saves, Escape cancels, empty deletes', async () => {
    const { card, file, user } = await setup()
    await user.click(within(card('Set up Tauri')).getByRole('button', { name: 'Show steps' }))
    const c = () => within(card('Set up Tauri'))
    await user.click(c().getByText('Run init'))
    await user.clear(c().getByRole('textbox', { name: 'Edit step' }))
    await user.type(c().getByRole('textbox', { name: 'Edit step' }), 'Run tauri init{Enter}')
    await vi.waitFor(() => expect(file()).toContain('text: Run tauri init'))
    await user.click(c().getByText('Commit'))
    await user.type(c().getByRole('textbox', { name: 'Edit step' }), ' now{Escape}')
    expect(c().getByText('Commit')).toBeInTheDocument()
    expect(file()).not.toContain('Commit now')
    await user.click(c().getByText('Commit'))
    await user.clear(c().getByRole('textbox', { name: 'Edit step' }))
    await user.keyboard('{Enter}')
    await vi.waitFor(() => expect(file()).not.toContain('Commit'))
  })

  it('deletes a step with the × button', async () => {
    const { card, file, user } = await setup()
    await user.click(within(card('Set up Tauri')).getByRole('button', { name: 'Show steps' }))
    await user.click(within(card('Set up Tauri')).getByRole('button', { name: 'Delete step Install Rust' }))
    await vi.waitFor(() => expect(file()).not.toContain('Install Rust'))
    expect(file()).toContain('Run init')
  })

  it('interacting with the checklist does not start a drag or open the editor', async () => {
    const { card, user } = await setup()
    await user.click(within(card('Set up Tauri')).getByRole('button', { name: 'Show steps' }))
    const box = within(card('Set up Tauri')).getByRole('checkbox', { name: 'Run init' })
    fireEvent.pointerDown(box, { button: 0, clientX: 0, clientY: 0, isPrimary: true })
    fireEvent.pointerMove(document, { clientX: 40, clientY: 40 })
    await act(async () => {})
    expect(card('Set up Tauri')).not.toHaveClass('is-dragging')
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument()
  })
})

describe('focus bar next step', () => {
  it('shows the next unchecked step under the title', async () => {
    const { card, user } = await setup()
    await user.click(within(card('Write spec')).getByRole('button', { name: 'Show steps' }))
    await user.type(within(card('Write spec')).getByRole('textbox', { name: 'Add step' }), 'Outline{Enter}')
    await user.click(screen.getByRole('button', { name: 'Focus on Write spec' }))
    const today = within(screen.getByRole('region', { name: 'Today' }))
    const bar = screen.getByRole('timer', { name: 'Focus timer' })
    expect(within(bar).getByText('Next: Outline')).toBeInTheDocument()
    await user.click(today.getByRole('checkbox', { name: 'Outline' }))
    expect(within(bar).queryByText(/^Next:/)).not.toBeInTheDocument()
  })
})
