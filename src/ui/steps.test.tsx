import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'
import { handleStepDrop, stepIds } from './stepDrop'
import { emptyFlow, type Change, type FlowData } from '../model/types'
import { findTask } from '../model/tasks'

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
  it('always shows the checklist with a progress pill; no chevron and no "Next:" line', async () => {
    const { card } = await setup()
    const c = within(card('Set up Tauri'))
    expect(c.getByLabelText('1 of 3 steps done')).toHaveTextContent('1/3')
    expect(within(c.getByRole('list')).getAllByRole('listitem')).toHaveLength(3)
    expect(c.getByRole('checkbox', { name: 'Install Rust' })).toBeChecked()
    expect(c.getByRole('checkbox', { name: 'Run init' })).not.toBeChecked()
    expect(c.getByRole('textbox', { name: 'Add step' })).toHaveAttribute('placeholder', 'Add step')
    expect(c.queryByText(/^Next:/)).not.toBeInTheDocument()
    expect(c.queryByRole('button', { name: /^(Show|Hide) steps$/ })).not.toBeInTheDocument()
    // The only toggle left on the card is the calendar (plan) menu.
    expect([...card('Set up Tauri').querySelectorAll('[aria-expanded]')].map((el) => el.getAttribute('aria-label'))).toEqual(['Plan Set up Tauri'])
  })

  it('puts the pill in the title row, the checklist under it and the project tag in the footer', async () => {
    const { card } = await setup()
    const li = card('Set up Tauri')
    const head = li.querySelector('.card-body > .card-head') as HTMLElement
    expect(head).not.toBeNull()
    expect(within(head).getByRole('button', { name: 'Set up Tauri' })).toBeInTheDocument()
    expect(within(head).getByLabelText('1 of 3 steps done')).toBeInTheDocument()
    expect(li.querySelector(':scope > .steps-ctl')).toBeNull()
    const body = li.querySelector('.card-body') as HTMLElement
    const parts = [...body.children].map((el) => el.className.split(' ')[0])
    expect(parts.indexOf('card-head')).toBeLessThan(parts.indexOf('checklist'))
    expect(parts.indexOf('checklist')).toBeLessThan(parts.indexOf('card-meta'))
    expect(within(li).getByText('Flow app')).toHaveClass('tag-text')
  })

  it('shows no pill on a task without steps; the Add step input is its only step row', async () => {
    const { card } = await setup()
    const c = within(card('Write spec'))
    expect(c.queryByText(/steps? done/)).not.toBeInTheDocument()
    expect(c.queryByRole('list')).not.toBeInTheDocument()
    expect(c.getByRole('textbox', { name: 'Add step' })).toBeInTheDocument()
  })

  it('ticks steps and persists without changing task status (ticking the last never completes it)', async () => {
    const { card, file, user } = await setup()
    const c = within(card('Set up Tauri'))
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
    await user.click(within(card('Set up Tauri')).getByRole('button', { name: 'Delete step Install Rust' }))
    await vi.waitFor(() => expect(file()).not.toContain('Install Rust'))
    expect(file()).toContain('Run init')
  })

  /** Press at `el`, move 40px; returns whether the card started a drag (then lets the drag end). */
  async function pressAndMove(el: Element, li: () => HTMLElement) {
    const cardEl = li() // the drag overlay repeats the title while dragging, so keep the element
    fireEvent.pointerDown(el, { button: 0, clientX: 0, clientY: 0, isPrimary: true })
    fireEvent.pointerMove(document, { clientX: 0, clientY: 40 })
    await act(async () => {})
    const dragging = cardEl.classList.contains('is-dragging')
    fireEvent.pointerUp(document)
    await act(async () => {})
    // dnd-kit swallows clicks for 50 ms after a drag; let that guard expire.
    await act(() => new Promise((r) => setTimeout(r, 80)))
    return dragging
  }

  it('the checklist controls never start a card drag or open the editor', async () => {
    const { card } = await setup()
    const li = () => card('Set up Tauri')
    const c = () => within(li())
    const controls = [
      () => c().getByRole('checkbox', { name: 'Run init' }),
      () => c().getByText('Run init'),
      () => c().getByRole('button', { name: 'Delete step Run init' }),
      () => c().getByRole('textbox', { name: 'Add step' }),
      () => c().getByRole('button', { name: 'Reorder step Run init' }),
    ]
    for (const control of controls) expect(await pressAndMove(control(), li)).toBe(false)
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument()
  })

  it('empty space in a step row and between rows drags the card', async () => {
    const { card } = await setup()
    const li = () => card('Set up Tauri')
    const row = () => within(li()).getByText('Run init').closest('li') as HTMLElement
    expect(await pressAndMove(row(), li)).toBe(true)
    expect(await pressAndMove(li().querySelector('.checklist') as HTMLElement, li)).toBe(true)
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument()
  })
})

describe('first step (legacy field)', () => {
  const withFirst = (): Record<string, string> => ({
    'projects/flow-app.md': project(
      '  - id: t1\n    title: Set up Tauri\n    status: todo\n    first_step: review\n    created: 2026-11-01\n' +
      '  - id: t2\n    title: Write spec\n    status: today\n    created: 2026-11-01\n'),
  })
  async function open(files: Record<string, string>) {
    const store = new MemoryFileStore(files)
    render(<App store={store} settings={new MemorySettings()} now={() => NOW} />)
    await screen.findByText('Set up Tauri')
    return { store, user: userEvent.setup() }
  }

  it('is not shown on the card, and stays in the file', async () => {
    const { store } = await open(withFirst())
    expect(screen.queryByText('review')).not.toBeInTheDocument()
    expect(store.files['projects/flow-app.md']).toContain('first_step: review')
  })

  it('the edit form offers "First step" only for a task that has one, so it can be cleared', async () => {
    const { store, user } = await open(withFirst())
    await user.click(screen.getByRole('button', { name: 'Write spec' }))
    expect(screen.queryByRole('textbox', { name: 'First step' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Set up Tauri' }))
    const field = screen.getByRole('textbox', { name: 'First step' })
    expect(field).toHaveValue('review')
    await user.clear(field)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(store.files['projects/flow-app.md']).not.toContain('first_step'))
    await user.click(screen.getByRole('button', { name: 'Set up Tauri' }))
    expect(screen.queryByRole('textbox', { name: 'First step' })).not.toBeInTheDocument()
  })

  it('saving a task without the field leaves its file free of first_step', async () => {
    const { store, user } = await open(withFirst())
    await user.click(screen.getByRole('button', { name: 'Write spec' }))
    await user.clear(screen.getByRole('textbox', { name: 'Title' }))
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Write the spec{Enter}')
    await vi.waitFor(() => expect(store.files['projects/flow-app.md']).toContain('title: Write the spec'))
    expect(store.files['projects/flow-app.md'].match(/first_step/g)).toHaveLength(1)
  })
})

describe('reordering steps', () => {
  const texts = (li: HTMLElement) => within(li).getAllByRole('button', { name: /^Reorder step / }).map((b) => b.getAttribute('aria-label'))

  it('gives each step a drag handle; the handle is the only drag start', async () => {
    const { card, user } = await setup()
    await within(card('Set up Tauri')).findByRole('button', { name: 'Reorder step Install Rust' })
    expect(texts(card('Set up Tauri'))).toEqual(['Reorder step Install Rust', 'Reorder step Run init', 'Reorder step Commit'])
    // The step text still opens the inline editor; the checkbox still toggles.
    await user.click(within(card('Set up Tauri')).getByText('Run init'))
    expect(within(card('Set up Tauri')).getByRole('textbox', { name: 'Edit step' })).toHaveValue('Run init')
    await user.keyboard('{Escape}')
    await user.click(within(card('Set up Tauri')).getByRole('checkbox', { name: 'Commit' }))
    expect(within(card('Set up Tauri')).getByRole('checkbox', { name: 'Commit' })).toBeChecked()
    // Dragging the handle never drags the card.
    const handle = within(card('Set up Tauri')).getByRole('button', { name: 'Reorder step Run init' })
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 0, isPrimary: true })
    fireEvent.pointerMove(document, { clientX: 0, clientY: 40 })
    await act(async () => {})
    expect(card('Set up Tauri')).not.toHaveClass('is-dragging')
    fireEvent.pointerUp(document)
    await act(async () => {})
    // dnd-kit swallows clicks for 50 ms after a drag (setTimeout in its pointer sensor); let that
    // guard expire so it cannot eat the first click of the next test on a slow machine.
    await act(() => new Promise((r) => setTimeout(r, 80)))
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument()
  })

  it('Alt+ArrowDown / Alt+ArrowUp move the step, persist, and keep focus on its handle', async () => {
    const { card, file, user } = await setup()
    // Wait for the checklist to render (slower machines, e.g. the CI Windows runner).
    ;(await within(card('Set up Tauri')).findByRole('button', { name: 'Reorder step Install Rust' })).focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(texts(card('Set up Tauri'))).toEqual(['Reorder step Run init', 'Reorder step Install Rust', 'Reorder step Commit'])
    await vi.waitFor(() => expect(file()).toMatch(/text: Run init\n\s+done: false\n\s+- text: Install Rust\n\s+done: true/))
    expect(document.activeElement).toHaveAttribute('aria-label', 'Reorder step Install Rust')
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(texts(card('Set up Tauri'))).toEqual(['Reorder step Run init', 'Reorder step Commit', 'Reorder step Install Rust'])
    expect(document.activeElement).toHaveAttribute('aria-label', 'Reorder step Install Rust')
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}') // already last: no change
    expect(texts(card('Set up Tauri'))).toEqual(['Reorder step Run init', 'Reorder step Commit', 'Reorder step Install Rust'])
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(texts(card('Set up Tauri'))).toEqual(['Reorder step Run init', 'Reorder step Install Rust', 'Reorder step Commit'])
    expect(document.activeElement).toHaveAttribute('aria-label', 'Reorder step Install Rust')
    expect(file()).toMatch(/title: Set up Tauri\n\s+status: todo/)
    // Plain arrows (no Alt) do nothing.
    await user.keyboard('{ArrowDown}')
    expect(texts(card('Set up Tauri'))).toEqual(['Reorder step Run init', 'Reorder step Install Rust', 'Reorder step Commit'])
  })
})

describe('handleStepDrop', () => {
  const data = (): FlowData => {
    const d = emptyFlow()
    d.projects.p = {
      slug: 'p', title: 'P', status: 'active', color: '#000', created: '2026-11-01', body: '', extra: {},
      tasks: [{ id: 't1', title: 'T', status: 'todo', created: '2026-11-01', extra: {},
        steps: [{ text: 'a', done: true, extra: {} }, { text: 'b', done: false, extra: {} }, { text: 'c', done: false, extra: {} }] }],
    }
    return d
  }
  const run = (activeIndex: number, overIndex: number) => {
    const calls: Change[] = []
    const ok = handleStepDrop({ ref: 'p/t1', activeIndex, overIndex }, (fn) => { calls.push(fn(data())) })
    return { ok, calls }
  }
  it('moves the dragged step to the index it was dropped on', () => {
    const { ok, calls } = run(0, 2)
    expect(ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(findTask(calls[0].data, 'p/t1')!.task.steps!.map((s) => s.text)).toEqual(['b', 'c', 'a'])
    expect(calls[0].changed).toEqual(['projects/p.md'])
  })
  it('does nothing for a drop on itself or outside the list', () => {
    for (const [a, o] of [[1, 1], [0, -1], [-1, 0]]) expect(run(a, o)).toEqual({ ok: false, calls: [] })
  })
  it('stepIds are stable across reorder and unique for duplicate text', () => {
    expect(stepIds([{ text: 'a' }, { text: 'b' }, { text: 'a' }])).toEqual(['a#0', 'b#0', 'a#1'])
    expect(stepIds([{ text: 'b' }, { text: 'a' }])).toEqual(['b#0', 'a#0'])
  })
})

describe('focus bar next step', () => {
  it('shows the next unchecked step under the title', async () => {
    const { card, user } = await setup()
    await user.type(within(card('Write spec')).getByRole('textbox', { name: 'Add step' }), 'Outline{Enter}')
    await user.click(screen.getByRole('button', { name: 'Focus on Write spec' }))
    const today = within(screen.getByRole('region', { name: 'Today' }))
    const bar = screen.getByRole('timer', { name: 'Focus timer' })
    expect(within(bar).getByText('Next: Outline')).toBeInTheDocument()
    await user.click(today.getByRole('checkbox', { name: 'Outline' }))
    expect(within(bar).queryByText(/^Next:/)).not.toBeInTheDocument()
  })
})
