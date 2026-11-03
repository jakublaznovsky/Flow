import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { addInboxItem } from '../model/inbox'
import { addTask } from '../model/tasks'
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
