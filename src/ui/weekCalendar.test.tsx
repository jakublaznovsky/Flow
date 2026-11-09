import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
import App from '../App'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'
import { HOUR_PX } from './CalendarBlock'

// jsdom has no PointerEvent; a MouseEvent subclass carries clientX/clientY for the grid gestures.
beforeAll(() => {
  if (!('PointerEvent' in window)) {
    class PointerEventShim extends MouseEvent {
      pointerId: number
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1 }
    }
    Object.assign(window, { PointerEvent: PointerEventShim })
  }
})

const NOW = new Date(2026, 10, 4, 14, 20) // Wednesday 2026-11-04, 14:20 (ISO week 2026-W45)
const task = (id: string, title: string, status: string, more = '') =>
  `  - id: ${id}\n    title: ${title}\n    status: ${status}\n    created: 2026-11-01\n${more}`
const project = (title: string, color: string, tasks: string) =>
  `---\ntitle: ${title}\nstatus: active\ncolor: "${color}"\ncreated: 2026-11-01\ntasks:\n${tasks}---\n`
const calendar = (items: string) => `---\nweek: "2026-W45"\nitems:\n${items}---\n`
const calItem = (id: string, title: string, date: string, time: string) =>
  `  - id: ${id}\n    title: ${title}\n    date: ${date}\n    time: "${time}"\n`
const seed = (): Record<string, string> => ({
  'inbox.md': '---\nitems: []\n---\n',
  'projects/flow-app.md': project('Flow app', '#4f8cff',
    task('t1', 'Set up Tauri', 'todo') +
    task('t2', 'Write spec', 'todo', '    scheduled: 2026-11-06\n    time: "09:00-10:30"\n') +
    task('t3', 'Plan release', 'todo', '    scheduled: 2026-11-06\n') +
    task('t4', 'Fix bug', 'today', '    planned: 2026-11-04\n    time: "15:00-16:00"\n')),
  'days/2026-11-04.md': '---\ndate: 2026-11-04\nplanned:\n  - flow-app/t4\ndone: []\n---\n',
  'calendar/2026-W45.md': calendar(calItem('c1', 'Swim', '2026-11-05', '18:00-19:30')),
})

async function open(files = seed()) {
  const store = new MemoryFileStore(files)
  const settings = new MemorySettings()
  const user = userEvent.setup()
  render(<App store={store} settings={settings} now={() => NOW} />)
  await screen.findByText('Set up Tauri')
  await user.keyboard('w')
  const view = within(await screen.findByRole('region', { name: 'Week' }))
  return { store, settings, user, view }
}

const day = (name: string) => screen.getByRole('region', { name })
const grid = (name: string) => day(name).querySelector<HTMLElement>('.cal-day')!
const strip = (name: string) => day(name).querySelector<HTMLElement>('.week-strip')!
const blockOf = (body: HTMLElement) => body.closest<HTMLElement>('.cal-block')!
const px = (n: number) => `${n}px`
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })

/** A pointer gesture on the grid: down at `from` (y in px from 07:00), optional moves, up. */
function gesture(el: HTMLElement, from: number, to: number[] = []) {
  fireEvent.pointerDown(el, { clientX: 10, clientY: from, button: 0, pointerId: 1 })
  for (const y of to) fireEvent.pointerMove(window, { clientX: 10, clientY: y, pointerId: 1 })
  fireEvent.pointerUp(window, { clientX: 10, clientY: to.at(-1) ?? from, pointerId: 1 })
}

describe('Week calendar: layout', () => {
  it('puts timed tasks and items in the grid at their time, untimed ones in the strip', async () => {
    await open()
    const spec = within(grid('Fri 6 Nov')).getByRole('button', { name: 'Write spec, Friday 09:00 to 10:30' })
    expect(blockOf(spec).style.top).toBe(px(2 * HOUR_PX))
    expect(blockOf(spec).style.height).toBe(px(1.5 * HOUR_PX))
    expect(blockOf(spec)).toHaveClass('is-task')
    expect(within(strip('Fri 6 Nov')).getByText('Plan release')).toBeInTheDocument()
    expect(within(grid('Fri 6 Nov')).queryByText('Plan release')).toBeNull()
    expect(within(strip('Fri 6 Nov')).queryByText('Write spec')).toBeNull()

    const swim = within(grid('Thu 5 Nov')).getByRole('button', { name: 'Swim, Thursday 18:00 to 19:30' })
    expect(blockOf(swim)).toHaveClass('is-item')
    expect(blockOf(swim).style.top).toBe(px(11 * HOUR_PX))
    // A timed Today task sits in today's grid.
    expect(within(grid('Wed 4 Nov')).getByRole('button', { name: 'Fix bug, Wednesday 15:00 to 16:00' })).toBeInTheDocument()
    expect(within(strip('Wed 4 Nov')).queryByText('Fix bug')).toBeNull()
  })

  it('shows hour numbers 7…24 on the axis and no time text anywhere outside aria-labels', async () => {
    await open()
    const axis = document.querySelector('.cal-axis')!
    expect([...axis.querySelectorAll('.cal-hour')].map((e) => e.textContent)).toEqual(
      Array.from({ length: 18 }, (_, i) => String(7 + i)))
    const week = screen.getByRole('region', { name: 'Week' })
    expect(week.textContent).not.toMatch(/\d:\d\d/)
    for (const el of week.querySelectorAll('*')) {
      for (const a of el.attributes) if (a.name !== 'aria-label' && a.name !== 'style') expect(a.value).not.toMatch(/\d:\d\d/)
    }
  })

  it('lays overlapping blocks side by side in equal lanes', async () => {
    const files = seed()
    files['calendar/2026-W45.md'] = calendar(
      calItem('c1', 'Swim', '2026-11-05', '18:00-19:30') + calItem('c2', 'Call', '2026-11-05', '19:00-20:00') + calItem('c3', 'Read', '2026-11-05', '21:00-22:00'))
    await open(files)
    const g = within(grid('Thu 5 Nov'))
    const swim = blockOf(g.getByRole('button', { name: /^Swim/ }))
    const call = blockOf(g.getByRole('button', { name: /^Call/ }))
    const read = blockOf(g.getByRole('button', { name: /^Read/ }))
    expect([swim.style.left, swim.style.width]).toEqual(['0%', '50%'])
    expect([call.style.left, call.style.width]).toEqual(['50%', '50%'])
    expect([read.style.left, read.style.width]).toEqual(['0%', '100%'])
  })

  it('scrolls the grid to the current hour this week, to 07:00 on other weeks', async () => {
    await open()
    const scroller = document.querySelector<HTMLElement>('.week-cal')!
    expect(scroller.style.getPropertyValue('--hour-px')).toBe(`${HOUR_PX}px`)
    expect(scroller.scrollTop).toBe((14 - 7 - 1) * HOUR_PX)
  })
})

describe('Week calendar: week-only items', () => {
  it('a click on empty grid opens a 1-hour item with an inline title; Enter saves it', async () => {
    const { store, user } = await open()
    gesture(grid('Thu 5 Nov'), 2 * HOUR_PX + 5)
    const input = await screen.findByRole('textbox', { name: 'New item title' })
    expect(input).toHaveFocus()
    expect(blockOf(input).style.top).toBe(px(2 * HOUR_PX))
    expect(blockOf(input).style.height).toBe(px(HOUR_PX))
    await user.type(input, 'Dentist{Enter}')
    await waitFor(() => expect(store.files['calendar/2026-W45.md']).toContain('title: Dentist'))
    expect(store.files['calendar/2026-W45.md']).toContain('time: "09:00-10:00"')
    expect(within(grid('Thu 5 Nov')).getByRole('button', { name: 'Dentist, Thursday 09:00 to 10:00' })).toBeInTheDocument()
  })

  it('a drag on empty grid spans the drag; Escape cancels and blank saves nothing', async () => {
    const { store, user } = await open()
    const before = store.files['calendar/2026-W45.md']
    gesture(grid('Tue 3 Nov'), 2 * HOUR_PX, [2.5 * HOUR_PX, 3.5 * HOUR_PX])
    const input = await screen.findByRole('textbox', { name: 'New item title' })
    expect(blockOf(input).style.height).toBe(px(1.5 * HOUR_PX))
    await user.type(input, 'Gym{Escape}')
    expect(screen.queryByRole('textbox', { name: 'New item title' })).toBeNull()
    gesture(grid('Tue 3 Nov'), HOUR_PX)
    await user.type(await screen.findByRole('textbox', { name: 'New item title' }), '   {Enter}')
    expect(screen.queryByRole('textbox', { name: 'New item title' })).toBeNull()
    await settle()
    expect(store.files['calendar/2026-W45.md']).toBe(before)
  })

  it('typing in a title input never fires app shortcuts', async () => {
    const { user } = await open()
    gesture(grid('Thu 5 Nov'), HOUR_PX)
    const input = await screen.findByRole('textbox', { name: 'New item title' })
    await user.type(input, 'bwp')
    expect(input).toHaveValue('bwp')
    expect(screen.getByRole('region', { name: 'Week' })).toBeInTheDocument()
    await user.dblClick(within(grid('Thu 5 Nov')).getByRole('button', { name: /^Swim/ }))
    await user.type(screen.getByRole('textbox', { name: 'Rename Swim' }), 'b')
    expect(screen.getByRole('region', { name: 'Week' })).toBeInTheDocument()
  })

  it('a drag-created item is saved with the dragged span', async () => {
    const { store, user } = await open()
    gesture(grid('Sat 7 Nov'), 3.5 * HOUR_PX, [3 * HOUR_PX, 1 * HOUR_PX])
    await user.type(await screen.findByRole('textbox', { name: 'New item title' }), 'Market{Enter}')
    await waitFor(() => expect(store.files['calendar/2026-W45.md']).toContain('title: Market'))
    expect(store.files['calendar/2026-W45.md']).toContain('time: "08:00-10:30"')
  })

  it('double-click renames an item inline; Escape keeps the old title', async () => {
    const { store, user } = await open()
    const swim = within(grid('Thu 5 Nov')).getByRole('button', { name: /^Swim/ })
    await user.dblClick(swim)
    const input = screen.getByRole('textbox', { name: 'Rename Swim' })
    await user.clear(input)
    await user.type(input, 'Swimming{Enter}')
    await waitFor(() => expect(store.files['calendar/2026-W45.md']).toContain('title: Swimming'))
    const renamed = within(grid('Thu 5 Nov')).getByRole('button', { name: 'Swimming, Thursday 18:00 to 19:30' })
    expect(renamed).toHaveFocus()
    await user.dblClick(renamed)
    await user.type(screen.getByRole('textbox', { name: 'Rename Swimming' }), 'x{Escape}')
    expect(within(grid('Thu 5 Nov')).getByRole('button', { name: /^Swimming,/ })).toBeInTheDocument()
  })

  it('the × button and the Delete key remove an item', async () => {
    const files = seed()
    files['calendar/2026-W45.md'] = calendar(calItem('c1', 'Swim', '2026-11-05', '18:00-19:30') + calItem('c2', 'Call', '2026-11-06', '12:00-13:00'))
    const { store, user } = await open(files)
    await user.click(within(grid('Thu 5 Nov')).getByRole('button', { name: 'Delete Swim' }))
    await waitFor(() => expect(store.files['calendar/2026-W45.md']).not.toContain('Swim'))
    within(grid('Fri 6 Nov')).getByRole('button', { name: /^Call/ }).focus()
    await user.keyboard('{Delete}')
    await waitFor(() => expect(store.files['calendar/2026-W45.md']).not.toContain('Call'))
    expect(store.files['calendar/2026-W45.md']).toContain('items: []')
  })

  it('Alt+↑/↓ moves a focused block 15 minutes; with Shift its end changes; shortcuts stay quiet', async () => {
    const { store, user } = await open()
    within(grid('Thu 5 Nov')).getByRole('button', { name: /^Swim/ }).focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await waitFor(() => expect(store.files['calendar/2026-W45.md']).toContain('time: "18:15-19:45"'))
    expect(within(grid('Thu 5 Nov')).getByRole('button', { name: 'Swim, Thursday 18:15 to 19:45' })).toHaveFocus()
    await user.keyboard('{Alt>}{Shift>}{ArrowUp}{ArrowUp}{/Shift}{/Alt}')
    await waitFor(() => expect(store.files['calendar/2026-W45.md']).toContain('time: "18:15-19:15"'))
    expect(screen.getByRole('region', { name: 'Week' })).toBeInTheDocument()
  })

  it('moving and resizing an item with the pointer snaps to 15 minutes', async () => {
    const { store } = await open()
    const swim = within(grid('Thu 5 Nov')).getByRole('button', { name: /^Swim/ })
    gesture(swim, 11 * HOUR_PX + 12, [11.5 * HOUR_PX, 12 * HOUR_PX + 14])
    await waitFor(() => expect(store.files['calendar/2026-W45.md']).toContain('time: "19:00-20:30"'))
    const bottom = blockOf(within(grid('Thu 5 Nov')).getByRole('button', { name: /^Swim/ })).querySelector<HTMLElement>('.cal-block-edge.is-bottom')!
    gesture(bottom, 13.5 * HOUR_PX, [14 * HOUR_PX + 3])
    await waitFor(() => expect(store.files['calendar/2026-W45.md']).toContain('time: "19:00-21:00"'))
    const top = blockOf(within(grid('Thu 5 Nov')).getByRole('button', { name: /^Swim/ })).querySelector<HTMLElement>('.cal-block-edge.is-top')!
    gesture(top, 12 * HOUR_PX, [17 * HOUR_PX])
    await waitFor(() => expect(store.files['calendar/2026-W45.md']).toContain('time: "20:45-21:00"'))
  })

  it('keeps one cursor for the whole gesture (resize: ns-resize, move: grabbing), cleared on release', async () => {
    await open()
    const swim = within(grid('Thu 5 Nov')).getByRole('button', { name: /^Swim/ })
    const bottom = blockOf(swim).querySelector<HTMLElement>('.cal-block-edge.is-bottom')!
    fireEvent.pointerDown(bottom, { clientX: 10, clientY: 12 * HOUR_PX, button: 0, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 13 * HOUR_PX, pointerId: 1 })
    expect(document.documentElement.dataset.calGesture).toBe('resize')
    fireEvent.pointerUp(window, { clientX: 10, clientY: 13 * HOUR_PX, pointerId: 1 })
    expect(document.documentElement.dataset.calGesture).toBeUndefined()
    await settle()
    const body = within(grid('Thu 5 Nov')).getByRole('button', { name: /^Swim/ })
    fireEvent.pointerDown(body, { clientX: 10, clientY: 11 * HOUR_PX + 12, button: 0, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 12 * HOUR_PX, pointerId: 1 })
    expect(document.documentElement.dataset.calGesture).toBe('move')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.documentElement.dataset.calGesture).toBeUndefined()
  })
})

describe('Week calendar: project task blocks', () => {
  it('clicking a task block creates nothing; Delete leaves it alone; it can be moved and resized', async () => {
    const { store, user } = await open()
    const spec = within(grid('Fri 6 Nov')).getByRole('button', { name: /^Write spec/ })
    gesture(spec, 2 * HOUR_PX + 10)
    expect(screen.queryByRole('textbox', { name: 'New item title' })).toBeNull()
    const before = store.files['projects/flow-app.md']
    spec.focus()
    await user.keyboard('{Delete}')
    await settle()
    expect(within(grid('Fri 6 Nov')).getByRole('button', { name: 'Write spec, Friday 09:00 to 10:30' })).toBeInTheDocument()
    expect(store.files['projects/flow-app.md']).toBe(before)
    gesture(spec, 2 * HOUR_PX + 10, [3 * HOUR_PX + 10])
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('time: "10:00-11:30"'))
    expect(store.files['projects/flow-app.md']).toContain('scheduled: 2026-11-06')
    const bottom = blockOf(within(grid('Fri 6 Nov')).getByRole('button', { name: /^Write spec/ })).querySelector<HTMLElement>('.cal-block-edge.is-bottom')!
    gesture(bottom, 4.5 * HOUR_PX, [4 * HOUR_PX])
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('time: "10:00-11:00"'))
  })

  it('Alt+↓ on a task block moves its time', async () => {
    const { store, user } = await open()
    within(grid('Wed 4 Nov')).getByRole('button', { name: /^Fix bug/ }).focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('time: "15:15-16:15"'))
  })
  it('Alt+↓ and a same-day resize only change a task block\'s time (no day rules)', async () => {
    const { store, user } = await open()
    const dayFile = store.files['days/2026-11-04.md']
    const body = within(grid('Wed 4 Nov')).getByRole('button', { name: /^Fix bug/ })
    body.focus()
    await user.keyboard('{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}')
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('time: "15:00-16:15"'))
    expect(store.files['projects/flow-app.md']).toMatch(/title: Fix bug\n\s+status: today/)
    expect(store.files['days/2026-11-04.md']).toBe(dayFile)
  })
})
