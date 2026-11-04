import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'
import type { AiClient } from '../ai/claude'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'

const NOW = new Date(2026, 10, 4, 10, 0)
const seed = (): Record<string, string> => ({
  'projects/flow-app.md': '---\ntitle: Flow app\nstatus: active\ncolor: "#4f8cff"\ncreated: 2026-11-01\ntasks: []\n---\n',
})
const never: AiClient = { reviewWeek: () => new Promise(() => {}), planTomorrow: () => new Promise(() => {}) }

async function setup(settings = new MemorySettings()) {
  const store = new MemoryFileStore(seed())
  const user = userEvent.setup()
  render(<App store={store} settings={settings} now={() => NOW} ai={() => never} />)
  await screen.findByRole('heading', { name: 'To do' })
  await user.click(screen.getByRole('button', { name: 'Settings' }))
  const view = within(await screen.findByRole('region', { name: 'Settings' }))
  return { store, settings, user, view }
}

describe('Settings', () => {
  it('opens from the gear at the bottom of the sidebar; the next start opens on the Board', async () => {
    const { settings } = await setup()
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(async () => expect(await settings.get('view')).toBe('board'))
  })

  it('saves the API key in local settings (never in the Flow folder) and enables the AI buttons', async () => {
    const { settings, store, user, view } = await setup()
    const input = view.getByLabelText('Claude API key')
    expect(input).toHaveAttribute('type', 'password')
    expect(view.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    await user.type(input, 'sk-ant-secret')
    await user.click(view.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect(await settings.get('anthropicApiKey')).toBe('sk-ant-secret'))
    expect(view.getByText('A key is saved on this computer.')).toBeInTheDocument()
    expect(input).toHaveValue('')
    expect(Object.values(store.files).some((t) => t.includes('sk-ant-secret'))).toBe(false)
    await user.keyboard('p')
    const ai = within(await screen.findByRole('region', { name: 'AI review' }))
    expect(ai.getByRole('button', { name: 'Review my week' })).toBeInTheDocument()
    expect(ai.getByRole('button', { name: 'Plan tomorrow' })).toBeInTheDocument()
  })

  it('removes a saved key', async () => {
    const settings = new MemorySettings()
    await settings.set('anthropicApiKey', 'sk-old')
    const { user, view } = await setup(settings)
    expect(await view.findByText('A key is saved on this computer.')).toBeInTheDocument()
    await user.click(view.getByRole('button', { name: 'Remove' }))
    await waitFor(async () => expect(await settings.get('anthropicApiKey')).toBeNull())
    expect(view.queryByText('A key is saved on this computer.')).not.toBeInTheDocument()
    await user.keyboard('p')
    const ai = within(await screen.findByRole('region', { name: 'AI review' }))
    expect(ai.getByRole('button', { name: 'Set up Claude in Settings' })).toBeInTheDocument()
  })

  it('chooses the model, Opus 5.5 by default', async () => {
    const { settings, user, view } = await setup()
    const select = view.getByLabelText('Model')
    expect(select).toHaveValue('claude-opus-5-5')
    expect(within(select).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Claude Opus 5.5 (default)', 'Claude Sonnet 5.5', 'Claude Haiku 5.5'])
    await user.selectOptions(select, 'claude-sonnet-5-5')
    await waitFor(async () => expect(await settings.get('aiModel')).toBe('claude-sonnet-5-5'))
  })

  it('explains that the key stays local and what gets sent', async () => {
    const { view } = await setup()
    expect(view.getByText(/key stays on this computer/i)).toHaveTextContent(/sends .* to Anthropic/i)
  })
})
