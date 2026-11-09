import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { addInboxItem } from '../model/inbox'
import { addCalendarItem } from '../model/calendar'
import { addTask, editTask } from '../model/tasks'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'
import { useFlow } from './useFlow'

const NOW = new Date(2026, 10, 3, 10, 0)
const T = '2026-11-03'
const seed = () => ({
  'inbox.md': '---\nitems: []\n---\n',
  'projects/a.md': '---\ntitle: A\nstatus: active\ncolor: "#000"\ncreated: 2026-11-01\ntasks: []\n---\n',
})

async function harness(store: MemoryFileStore) {
  const settings = new MemorySettings()
  const hook = renderHook(() => useFlow(store, settings, () => NOW))
  await waitFor(() => expect(hook.result.current.data).not.toBeNull())
  return hook
}

describe('useFlow saving', () => {
  it('keeps a failed write pending and writes it with the next save', async () => {
    const store = new MemoryFileStore(seed())
    const hook = await harness(store)
    const realWrite = store.write.bind(store)
    store.write = async (p, t) => { if (p === 'projects/a.md') throw new Error('locked'); return realWrite(p, t) }
    act(() => hook.result.current.apply((d) => addTask(d, 'a', 'First', 'todo', T)))
    await waitFor(() => expect(store.files['flow-issues.log']).toContain('locked'))
    expect(store.files['projects/a.md']).not.toContain('First')
    store.write = realWrite
    act(() => hook.result.current.apply((d) => addInboxItem(d, 'Thought', T)))
    await waitFor(() => expect(store.files['inbox.md']).toContain('Thought'))
    await waitFor(() => expect(store.files['projects/a.md']).toContain('First'))
  })

  it('never runs two writes at once and ends with the latest state', async () => {
    const store = new MemoryFileStore(seed())
    const hook = await harness(store)
    const realWrite = store.write.bind(store)
    let inFlight = 0
    let maxInFlight = 0
    store.write = async (p, t) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      await realWrite(p, t)
      inFlight--
    }
    act(() => hook.result.current.apply((d) => addTask(d, 'a', 'One', 'todo', T)))
    act(() => hook.result.current.apply((d) => addTask(d, 'a', 'Two', 'todo', T)))
    act(() => hook.result.current.apply((d) => addTask(d, 'a', 'Three', 'todo', T)))
    await waitFor(() => expect(store.files['projects/a.md']).toContain('Three'))
    await waitFor(() => expect(inFlight).toBe(0))
    expect(maxInFlight).toBe(1)
    expect(store.files['projects/a.md']).toContain('One')
    expect(store.files['projects/a.md']).toContain('Two')
  })
})

describe('useFlow removeProject', () => {
  it('a write for the project queued during the delete does not recreate its file', async () => {
    const store = new MemoryFileStore(seed())
    const hook = await harness(store)
    act(() => hook.result.current.apply((d) => addTask(d, 'a', 'First', 'todo', T)))
    // While the file is being moved, the project is edited: that write is queued behind the delete.
    const remove = store.remove.bind(store)
    store.remove = async (p) => {
      act(() => hook.result.current.apply((d) => editTask(d, 'a/t1', { title: 'Renamed' }, T)))
      await remove(p)
    }
    let done: Promise<boolean> = Promise.resolve(false)
    act(() => { done = hook.result.current.removeProject('a') })
    expect(await done).toBe(true)
    act(() => hook.result.current.apply((d) => addInboxItem(d, 'Later', T)))
    await waitFor(() => expect(store.files['inbox.md']).toContain('Later'))
    expect(store.files['projects/a.md']).toBeUndefined()
    expect(store.files[`deleted/a-${T}.md`]).toContain('First')
    expect(hook.result.current.data!.projects.a).toBeUndefined()
  })

  it('a settings failure after a successful move still reports success', async () => {
    const store = new MemoryFileStore(seed())
    const settings = new MemorySettings()
    const hook = renderHook(() => useFlow(store, settings, () => NOW))
    await waitFor(() => expect(hook.result.current.data).not.toBeNull())
    act(() => hook.result.current.remember('a'))
    settings.get = async () => { throw new Error('store broken') }
    let done: Promise<boolean> = Promise.resolve(false)
    act(() => { done = hook.result.current.removeProject('a') })
    expect(await done).toBe(true)
    await waitFor(() => expect(hook.result.current.data!.projects.a).toBeUndefined())
    expect(hook.result.current.lastProject).toBeNull()
  })
})

describe('useFlow external calendar changes', () => {
  it('merges an edited, added or removed calendar week file', async () => {
    const CAL = (title: string) => `---\nweek: "2026-W45"\nitems:\n  - id: c1\n    title: ${title}\n    date: 2026-11-05\n    time: "18:00-19:00"\n---\n`
    const store = new MemoryFileStore({ ...seed(), 'calendar/2026-W45.md': CAL('Swim') })
    const hook = await harness(store)
    expect(hook.result.current.data!.calendar['2026-W45'].items[0].title).toBe('Swim')
    act(() => store.externalWrite('calendar/2026-W45.md', CAL('Run')))
    await waitFor(() => expect(hook.result.current.data!.calendar['2026-W45'].items[0].title).toBe('Run'))
    act(() => store.externalWrite('calendar/2026-W46.md', CAL('Yoga').replace('2026-W45', '2026-W46').replace('c1', 'c7')))
    await waitFor(() => expect(hook.result.current.data!.calendar['2026-W46']?.items[0].id).toBe('c7'))
    // A null entry reads as a missing file (the file was deleted outside Flow).
    act(() => store.externalWrite('calendar/2026-W45.md', null as unknown as string))
    await waitFor(() => expect(hook.result.current.data!.calendar['2026-W45']).toBeUndefined())
  })
})

describe('useFlow calendar ids after a reload in flight', () => {
  it('an id added locally during a reload never collides with the reloaded file', async () => {
    const store = new MemoryFileStore(seed())
    const hook = await harness(store)
    const realRead = store.read.bind(store)
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    store.read = async (p) => { if (p === 'calendar/2026-W47.md') await gate; return realRead(p) }
    act(() => store.externalWrite('calendar/2026-W47.md', '---\nweek: "2026-W47"\nitems:\n  - id: c1\n    title: Run\n    date: 2026-11-16\n    time: "07:00-08:00"\n---\n'))
    act(() => hook.result.current.apply((d) => addCalendarItem(d, { title: 'Swim', date: '2026-11-05', time: '18:00-19:00' })))
    expect(hook.result.current.data!.calendar['2026-W45'].items[0].id).toBe('c1')
    await act(async () => { release() })
    await waitFor(() => expect(hook.result.current.data!.calendar['2026-W47']).toBeDefined())
    const d = hook.result.current.data!
    expect(d.calendar['2026-W45'].items[0].id).toBe('c1')
    expect(d.calendar['2026-W47'].items[0].id).not.toBe('c1')
  })
})
