import Anthropic from '@anthropic-ai/sdk'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { AiClient, AiModel, Plan } from '../ai/claude'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'

const NOW = new Date(2026, 10, 4, 10, 0) // Wednesday 2026-11-04
const seed = (): Record<string, string> => ({
  'projects/flow-app.md': '---\ntitle: Flow app\nstatus: active\ncolor: "#4f8cff"\ncreated: 2026-11-01\ntasks:\n' +
    '  - id: t1\n    title: Write spec\n    status: todo\n    created: 2026-11-01\n' +
    '  - id: t2\n    title: Build it\n    status: today\n    created: 2026-11-01\n    planned: 2026-11-04\n---\n',
  'projects/home.md': '---\ntitle: Home\nstatus: active\ncolor: "#22aa66"\ncreated: 2026-11-01\ntasks: []\n---\n',
  'notes.md': 'My notes\n',
})

/** A controllable fake: review text is pushed by the test, then finished or failed. */
function fakeAi() {
  let push: (t: string) => void = () => {}
  let finish: (full: string) => void = () => {}
  let fail: (e: unknown) => void = () => {}
  let plan: Plan | Error = { summary: '', tasks: [] }
  const calls: { kind: 'review' | 'plan'; prompt: string; model: AiModel; signal?: AbortSignal }[] = []
  const keys: string[] = []
  const client: AiClient = {
    reviewWeek(prompt, model, onText, signal) {
      calls.push({ kind: 'review', prompt, model, signal })
      return new Promise<string>((resolve, reject) => {
        push = onText
        finish = resolve
        fail = reject
        signal?.addEventListener('abort', () => reject(new Anthropic.APIUserAbortError()))
      })
    },
    async planTomorrow(prompt, model, signal) {
      calls.push({ kind: 'plan', prompt, model, signal })
      if (plan instanceof Error) throw plan
      return plan
    },
  }
  return {
    factory: (key: string) => { keys.push(key); return client },
    calls, keys,
    push: (t: string) => act(() => push(t)),
    finish: async (full: string) => { await act(async () => finish(full)) },
    fail: async (e: unknown) => { await act(async () => fail(e)) },
    setPlan: (p: Plan | Error) => { plan = p },
  }
}

async function setup({ key = 'sk-ant-test' as string | null, files = seed() } = {}) {
  const store = new MemoryFileStore(files)
  const settings = new MemorySettings()
  if (key) await settings.set('anthropicApiKey', key)
  const ai = fakeAi()
  const user = userEvent.setup()
  render(<App store={store} settings={settings} now={() => NOW} ai={ai.factory} />)
  await screen.findByRole('heading', { name: 'To do' })
  await user.keyboard('p')
  await screen.findByRole('region', { name: 'Progress' })
  return { store, settings, ai, user }
}
const aiCard = () => within(screen.getByRole('region', { name: 'AI review' }))
const panel = (name: string) => within(screen.getByRole('complementary', { name }))

afterEach(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }) })

describe('AI buttons without a key', () => {
  it('read "Set up Claude in Settings" and open Settings', async () => {
    const { user, ai } = await setup({ key: null })
    expect(aiCard().queryByRole('button', { name: 'Review my week' })).not.toBeInTheDocument()
    await user.click(await aiCard().findByRole('button', { name: 'Set up Claude in Settings' }))
    expect(await screen.findByRole('region', { name: 'Settings' })).toBeInTheDocument()
    expect(ai.calls).toEqual([])
  })
})

describe('Review my week', () => {
  it('streams the answer into the panel, then offers Copy and Save to notes', async () => {
    const { user, ai } = await setup()
    await user.click(await aiCard().findByRole('button', { name: 'Review my week' }))
    const p = panel('Review of your week')
    expect(p.getByRole('heading', { name: 'Review of your week' })).toBeInTheDocument()
    expect(p.getByText('Claude is thinking…')).toBeInTheDocument()
    expect(p.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(ai.keys).toEqual(['sk-ant-test'])
    expect(ai.calls[0].kind).toBe('review')
    expect(ai.calls[0].model).toBe('claude-opus-5-5')
    expect(ai.calls[0].prompt).toContain('## Last 7 days')

    ai.push('# Went well\n\n- You **shipped**')
    expect(await p.findByRole('heading', { name: 'Went well' })).toBeInTheDocument()
    expect(p.queryByText('Claude is thinking…')).not.toBeInTheDocument()
    expect(p.getByText('shipped').tagName).toBe('STRONG')
    expect(p.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument()

    await ai.finish('# Went well\n\n- You **shipped**\n- Rest')
    expect(p.getByText('Rest')).toBeInTheDocument()
    expect(p.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
    expect(p.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(p.getByRole('button', { name: 'Save to notes' })).toBeInTheDocument()
  })

  it('uses the model chosen in Settings', async () => {
    const store = new MemoryFileStore(seed())
    const settings = new MemorySettings()
    await settings.set('anthropicApiKey', 'k')
    await settings.set('aiModel', 'claude-haiku-5-5')
    const ai = fakeAi()
    const user = userEvent.setup()
    render(<App store={store} settings={settings} now={() => NOW} ai={ai.factory} />)
    await screen.findByRole('heading', { name: 'To do' })
    await user.keyboard('p')
    await user.click(await aiCard().findByRole('button', { name: 'Review my week' }))
    expect(ai.calls[0].model).toBe('claude-haiku-5-5')
  })

  it('Copy puts the answer on the clipboard', async () => {
    const { user, ai } = await setup()
    const writeText = vi.fn(async (_t: string) => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await user.click(await aiCard().findByRole('button', { name: 'Review my week' }))
    await ai.finish('All good.')
    await user.click(panel('Review of your week').getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('All good.')
    expect(panel('Review of your week').getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('Save to notes appends the review to notes.md', async () => {
    const { user, ai, store } = await setup()
    await user.click(await aiCard().findByRole('button', { name: 'Review my week' }))
    await ai.finish('## Went well\n\nLots.')
    await user.click(panel('Review of your week').getByRole('button', { name: 'Save to notes' }))
    await waitFor(() => expect(store.files['notes.md']).toBe('My notes\n\n## Claude review 2026-11-04\n\n## Went well\n\nLots.\n'))
    expect(panel('Review of your week').getByText('Saved to notes')).toBeInTheDocument()
  })

  it("does not touch an unreadable notes.md and says so calmly", async () => {
    const bad = '---\ntags: [oops\n---\nmy words'
    const { user, ai, store } = await setup({ files: { ...seed(), 'notes.md': bad } })
    await user.click(await aiCard().findByRole('button', { name: 'Review my week' }))
    await ai.finish('Text')
    await user.click(panel('Review of your week').getByRole('button', { name: 'Save to notes' }))
    expect(panel('Review of your week').getByText("Couldn't save — notes.md can't be read")).toBeInTheDocument()
    expect(store.files['notes.md']).toBe(bad)
  })

  it('shows one calm line for a bad API key', async () => {
    const { user, ai } = await setup()
    await user.click(await aiCard().findByRole('button', { name: 'Review my week' }))
    await ai.fail(new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', new Headers()))
    const p = panel('Review of your week')
    expect(p.getByText("Claude didn't accept the API key — check it in Settings.")).toBeInTheDocument()
    expect(p.queryByText('Claude is thinking…')).not.toBeInTheDocument()
    expect(p.queryByText(/invalid x-api-key/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('Stop aborts the request and keeps what arrived', async () => {
    const { user, ai } = await setup()
    await user.click(await aiCard().findByRole('button', { name: 'Review my week' }))
    ai.push('Half an answer')
    const p = panel('Review of your week')
    await user.click(p.getByRole('button', { name: 'Stop' }))
    expect(ai.calls[0].signal?.aborted).toBe(true)
    expect(await p.findByText('Stopped.')).toBeInTheDocument()
    expect(p.getByText('Half an answer')).toBeInTheDocument()
    expect(p.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
  })

  it('closes with the Close button or Escape, aborting a running request', async () => {
    const { user, ai } = await setup()
    await user.click(await aiCard().findByRole('button', { name: 'Review my week' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('complementary', { name: 'Review of your week' })).not.toBeInTheDocument()
    expect(ai.calls[0].signal?.aborted).toBe(true)
    await user.click(aiCard().getByRole('button', { name: 'Review my week' }))
    await user.click(panel('Review of your week').getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('complementary', { name: 'Review of your week' })).not.toBeInTheDocument()
  })

  it('closes when another view is opened', async () => {
    const { user, ai } = await setup()
    await user.click(await aiCard().findByRole('button', { name: 'Review my week' }))
    await user.keyboard('b')
    expect(screen.queryByRole('complementary', { name: 'Review of your week' })).not.toBeInTheDocument()
    expect(ai.calls[0].signal?.aborted).toBe(true)
  })

  it('is offered in step 4 of the weekly review', async () => {
    const { user, ai } = await setup()
    await user.keyboard('r')
    await screen.findByRole('region', { name: 'Weekly review' })
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Review my week' }))
    expect(screen.getByRole('complementary', { name: 'Review of your week' })).toBeInTheDocument()
    expect(ai.calls[0].kind).toBe('review')
  })
})

describe('Plan tomorrow', () => {
  const PLAN: Plan = { summary: 'A gentle day with two small wins.', tasks: [
    { ref: 'flow-app/t1', title: 'Write spec', project: 'Flow app', first_step: 'Open the doc' },
    { title: 'Buy stamps', project: 'home', first_step: 'Find the wallet' },
  ] }

  it('lists suggestions; Plan for tomorrow schedules an existing task', async () => {
    const { user, ai, store } = await setup()
    ai.setPlan(PLAN)
    await user.click(await aiCard().findByRole('button', { name: 'Plan tomorrow' }))
    const p = panel('Plan for tomorrow')
    expect(await p.findByText('A gentle day with two small wins.')).toBeInTheDocument()
    expect(ai.calls[0].kind).toBe('plan')
    expect(ai.calls[0].prompt).toContain('- [todo] flow-app/t1 — Write spec (project: Flow app)')
    const row = within(p.getByRole('listitem', { name: 'Write spec' }))
    expect(row.getByText('Open the doc')).toBeInTheDocument()
    await user.click(row.getByRole('button', { name: 'Plan for tomorrow' }))
    expect(row.getByText('Added')).toBeInTheDocument()
    expect(row.queryByRole('button', { name: 'Plan for tomorrow' })).not.toBeInTheDocument()
    await waitFor(() => expect(store.files['projects/flow-app.md']).toMatch(/id: t1\n\s+title: Write spec\n\s+status: todo\n\s+created: 2026-11-01\n\s+scheduled: 2026-11-05/))
  })

  it('Add all creates the new task with its first step in the matched project', async () => {
    const { user, ai, store } = await setup()
    ai.setPlan(PLAN)
    await user.click(await aiCard().findByRole('button', { name: 'Plan tomorrow' }))
    const p = panel('Plan for tomorrow')
    await user.click(await p.findByRole('button', { name: 'Add all' }))
    expect(p.getAllByText('Added')).toHaveLength(2)
    expect(p.queryByRole('button', { name: 'Add all' })).not.toBeInTheDocument()
    await waitFor(() => {
      const home = store.files['projects/home.md']
      expect(home).toContain('title: Buy stamps')
      expect(home).toContain('first_step: Find the wallet')
      expect(home).toContain('scheduled: 2026-11-05')
    })
    expect(store.files['projects/flow-app.md']).toContain('scheduled: 2026-11-05')
  })

  it('shows one calm line when planning fails', async () => {
    const { user, ai } = await setup()
    ai.setPlan(new Error('boom'))
    await user.click(await aiCard().findByRole('button', { name: 'Plan tomorrow' }))
    expect(await panel('Plan for tomorrow').findByText('Something went wrong talking to Claude — try again.')).toBeInTheDocument()
  })
})
