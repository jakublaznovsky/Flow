import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MemoryFileStore } from '../storage/fileStore'
import { handleDrop, usePromotion } from './Board'
import { MemorySettings } from './settings'
import { useFlow } from './useFlow'

const NOW = new Date(2026, 10, 3, 10, 0)
const project = (title: string, tasks: string) =>
  `---\ntitle: ${title}\nstatus: active\ncolor: "#4f8cff"\ncreated: 2026-11-01\ntasks:\n${tasks}---\n`
const t = (id: string, title: string, status: string) =>
  `  - id: ${id}\n    title: ${title}\n    status: ${status}\n    created: 2026-11-01\n`
const seed = (): Record<string, string> => ({
  'inbox.md': `---\nitems:\n  - id: i1\n    text: Look into podcasts\n    created: 2026-11-01\n---\n`,
  'projects/flow-app.md': project('Flow app', t('t1', 'Set up Tauri', 'todo') + t('t2', 'Write spec', 'today') + t('t3', 'Third', 'todo')),
  'projects/learn-spanish.md': project('Learn Spanish', t('t1', 'Buy a book', 'todo')),
})

async function harness(files: Record<string, string> = seed()) {
  const store = new MemoryFileStore(files)
  const settings = new MemorySettings()
  const hook = renderHook(() => {
    const flow = useFlow(store, settings, () => NOW)
    return { flow, promotion: usePromotion(flow) }
  })
  await waitFor(() => expect(hook.result.current.flow.data).not.toBeNull())
  const ctx = () => ({ flow: hook.result.current.flow, openPicker: hook.result.current.promotion.openPicker })
  return { store, settings, hook, ctx }
}

describe('handleDrop', () => {
  it('todo -> today sets planned', async () => {
    const { store, ctx } = await harness()
    act(() => handleDrop({ cardKey: 'flow-app/t1', from: 'todo', to: 'today', index: 0 }, ctx()))
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain(`planned: 2026-11-03`))
  })

  it('today -> done logs to the day file', async () => {
    const { store, ctx } = await harness()
    act(() => handleDrop({ cardKey: 'flow-app/t2', from: 'today', to: 'done', index: 0 }, ctx()))
    await waitFor(() => expect(store.files['days/2026-11-03.md']).toContain('flow-app/t2'))
  })

  it('rejects an inbox item dropped on Done', async () => {
    const { store, ctx, hook } = await harness()
    const before = { ...store.files }
    act(() => handleDrop({ cardKey: 'inbox/i1', from: 'inbox', to: 'done', index: 0 }, ctx()))
    expect(store.files).toEqual(before)
    expect(hook.result.current.flow.order).toEqual({})
    expect(hook.result.current.promotion.picker).toBeFalsy()
  })

  it('a task dropped on the Parking lot is parked there at the drop index', async () => {
    const { store, ctx, hook } = await harness()
    act(() => handleDrop({ cardKey: 'flow-app/t1', from: 'todo', to: 'inbox', index: 0 }, ctx()))
    await waitFor(() => expect(store.files['inbox.md']).toContain('Set up Tauri'))
    expect(store.files['projects/flow-app.md']).not.toContain('Set up Tauri')
    expect(hook.result.current.flow.order.inbox).toEqual(['inbox/i2', 'inbox/i1'])
    expect(hook.result.current.flow.order.todo).toEqual(['flow-app/t3', 'learn-spanish/t1'])
  })

  it('a Today task can be parked too; its day file is left alone', async () => {
    const files = seed()
    files['days/2026-11-03.md'] = '---\ndate: 2026-11-03\nplanned:\n  - flow-app/t2\n---\n'
    const { store, ctx, hook } = await harness(files)
    act(() => handleDrop({ cardKey: 'flow-app/t2', from: 'today', to: 'inbox', index: 5 }, ctx()))
    await waitFor(() => expect(store.files['inbox.md']).toContain('Write spec'))
    expect(store.files['days/2026-11-03.md']).toContain('flow-app/t2')
    expect(hook.result.current.flow.order.inbox).toEqual(['inbox/i1', 'inbox/i2'])
  })

  it('reordering within To do persists columnOrder', async () => {
    const { settings, ctx } = await harness()
    act(() => handleDrop({ cardKey: 'flow-app/t3', from: 'todo', to: 'todo', index: 0 }, ctx()))
    await waitFor(async () =>
      expect((await settings.get<Record<string, string[]>>('columnOrder'))?.todo?.[0]).toBe('flow-app/t3'))
    const order = await settings.get<Record<string, string[]>>('columnOrder')
    expect(order?.todo).toEqual(['flow-app/t3', 'flow-app/t1', 'learn-spanish/t1'])
  })

  it('reordering with a project filter keeps hidden cards in place', async () => {
    const { settings, ctx, hook } = await harness()
    act(() => hook.result.current.flow.setFilter('flow-app'))
    act(() => handleDrop({ cardKey: 'flow-app/t1', from: 'todo', to: 'todo', index: 1 }, ctx()))
    expect(hook.result.current.flow.order.todo).toEqual(['flow-app/t3', 'flow-app/t1', 'learn-spanish/t1'])
    act(() => handleDrop({ cardKey: 'flow-app/t1', from: 'todo', to: 'todo', index: 0 }, ctx()))
    expect(hook.result.current.flow.order.todo).toEqual(['flow-app/t1', 'flow-app/t3', 'learn-spanish/t1'])
    act(() => handleDrop({ cardKey: 'flow-app/t1', from: 'todo', to: 'today', index: 0 }, ctx()))
    expect(hook.result.current.flow.order.todo).toEqual(['flow-app/t3', 'learn-spanish/t1'])
    expect(hook.result.current.flow.order.today).toEqual(['flow-app/t1', 'flow-app/t2'])
    await waitFor(async () =>
      expect((await settings.get<Record<string, string[]>>('columnOrder'))?.todo).toEqual(['flow-app/t3', 'learn-spanish/t1']))
  })

  it('reordering under a search keeps cards the search hides in place', async () => {
    const { ctx, hook } = await harness()
    // 'h' matches "Third" and "Learn Spanish" (project title) but not "Set up Tauri".
    act(() => handleDrop({ cardKey: 'learn-spanish/t1', from: 'todo', to: 'todo', index: 0 }, { ...ctx(), query: 'h' }))
    expect(hook.result.current.flow.order.todo).toEqual(['flow-app/t1', 'learn-spanish/t1', 'flow-app/t3'])
  })

  it('rejects an inbox drop on To do when there is no active project', async () => {
    const files = seed()
    files['projects/flow-app.md'] = files['projects/flow-app.md'].replace('status: active', 'status: paused')
    files['projects/learn-spanish.md'] = files['projects/learn-spanish.md'].replace('status: active', 'status: archived')
    const { ctx, hook } = await harness(files)
    act(() => handleDrop({ cardKey: 'inbox/i1', from: 'inbox', to: 'today', index: 0 }, ctx()))
    expect(hook.result.current.promotion.picker).toBeFalsy()
  })

  const tomorrowSeed = () => {
    const files = seed()
    files['projects/flow-app.md'] = project('Flow app',
      t('t1', 'Set up Tauri', 'todo') + t('t2', 'Write spec', 'today') + t('t3', 'Third', 'todo') +
      t('t4', 'Planned tomorrow', 'todo') + '    scheduled: 2026-11-04\n' +
      t('t5', 'Finished', 'done') + '    done: 2026-11-03\n')
    return files
  }

  it('To do, Today and Done tasks dropped on Tomorrow are planned for tomorrow', async () => {
    const { store, ctx, hook } = await harness(tomorrowSeed())
    act(() => handleDrop({ cardKey: 'flow-app/t1', from: 'todo', to: 'tomorrow', index: 0 }, ctx()))
    act(() => handleDrop({ cardKey: 'flow-app/t2', from: 'today', to: 'tomorrow', index: 0 }, ctx()))
    act(() => handleDrop({ cardKey: 'flow-app/t5', from: 'done', to: 'tomorrow', index: 9 }, ctx()))
    await waitFor(() => expect((store.files['projects/flow-app.md'].match(/scheduled: 2026-11-04/g) ?? []).length).toBe(4))
    const tasks = hook.result.current.flow.data!.projects['flow-app'].tasks
    for (const id of ['t1', 't2', 't5']) expect(tasks.find((x) => x.id === id)).toMatchObject({ status: 'todo', scheduled: '2026-11-04' })
    expect(tasks.find((x) => x.id === 't5')!.done).toBeUndefined()
    expect(hook.result.current.flow.order.tomorrow).toEqual(['flow-app/t2', 'flow-app/t1', 'flow-app/t4', 'flow-app/t5'])
    expect(hook.result.current.flow.order.done).toEqual([])
  })

  it('Tomorrow -> To do clears the date; Tomorrow -> Today moves it to Today', async () => {
    const files = tomorrowSeed()
    files['projects/learn-spanish.md'] = project('Learn Spanish', t('t1', 'Buy a book', 'todo') + '    scheduled: 2026-11-04\n')
    const { ctx, hook } = await harness(files)
    act(() => handleDrop({ cardKey: 'flow-app/t4', from: 'tomorrow', to: 'todo', index: 0 }, ctx()))
    act(() => handleDrop({ cardKey: 'learn-spanish/t1', from: 'tomorrow', to: 'today', index: 0 }, ctx()))
    const d = hook.result.current.flow.data!
    expect(d.projects['flow-app'].tasks.find((x) => x.id === 't4')).toMatchObject({ status: 'todo' })
    expect(d.projects['flow-app'].tasks.find((x) => x.id === 't4')!.scheduled).toBeUndefined()
    expect(d.projects['learn-spanish'].tasks[0]).toMatchObject({ status: 'today', planned: '2026-11-03' })
    expect(d.projects['learn-spanish'].tasks[0].scheduled).toBeUndefined()
    expect(hook.result.current.flow.order.todo?.[0]).toBe('flow-app/t4')
    expect(hook.result.current.flow.order.tomorrow).toEqual([])
  })

  it('inbox -> Tomorrow asks for a project, then adds the task planned for tomorrow', async () => {
    const h = await harness()
    const Picker = () => <>{h.hook.result.current.promotion.picker}</>
    const view = render(<Picker />)
    act(() => handleDrop({ cardKey: 'inbox/i1', from: 'inbox', to: 'tomorrow', index: 0 }, h.ctx()))
    view.rerender(<Picker />)
    await userEvent.setup().click(screen.getByRole('option', { name: 'Learn Spanish' }))
    await waitFor(() => expect(h.store.files['projects/learn-spanish.md']).toContain('Look into podcasts'))
    expect(h.hook.result.current.flow.data!.projects['learn-spanish'].tasks.at(-1))
      .toMatchObject({ title: 'Look into podcasts', status: 'todo', scheduled: '2026-11-04' })
    expect(h.store.files['inbox.md']).not.toContain('Look into podcasts')
    expect(h.hook.result.current.flow.order.tomorrow).toEqual(['learn-spanish/t2'])
  })

  async function dragInbox() {
    const h = await harness()
    const Picker = () => <>{h.hook.result.current.promotion.picker}</>
    const view = render(<Picker />)
    act(() => handleDrop({ cardKey: 'inbox/i1', from: 'inbox', to: 'todo', index: 1 }, h.ctx()))
    view.rerender(<Picker />)
    return { ...h, view, Picker }
  }

  it('inbox -> todo shows picker; choosing a project promotes the item', async () => {
    const { store, settings, hook } = await dragInbox()
    const user = userEvent.setup()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Flow app' }))
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('Look into podcasts'))
    expect(store.files['inbox.md']).not.toContain('Look into podcasts')
    await waitFor(async () =>
      expect((await settings.get<Record<string, string[]>>('columnOrder'))?.todo).toEqual(
        ['flow-app/t1', 'flow-app/t4', 'flow-app/t3', 'learn-spanish/t1']))
    expect(hook.result.current.promotion.picker).toBeFalsy()
  })

  it('keyboard: arrows and Enter choose', async () => {
    const { store } = await dragInbox()
    const user = userEvent.setup()
    expect(screen.getByRole('listbox')).toHaveFocus()
    await user.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(store.files['projects/learn-spanish.md']).toContain('Look into podcasts'))
  })

  it('Escape leaves everything unchanged', async () => {
    const { store, hook, view, Picker } = await dragInbox()
    const before = { ...store.files }
    await userEvent.setup().keyboard('{Escape}')
    view.rerender(<Picker />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(store.files).toEqual(before)
    expect(hook.result.current.flow.order).toEqual({})
  })
})
