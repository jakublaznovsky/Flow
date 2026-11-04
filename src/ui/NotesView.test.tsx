import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'

const NOW = new Date(2026, 10, 4, 10, 0)
const project = (title: string, status: string, body = '') =>
  `---\ntitle: ${title}\nstatus: ${status}\ncolor: "#4f8cff"\ncreated: 2026-11-01\ntasks:\n  - id: t1\n    title: Task\n    status: todo\n    created: 2026-11-01\n---\n${body}`
const seed = (): Record<string, string> => ({
  'projects/flow-app.md': project('Flow app', 'active', 'Flow body\n'),
  'projects/learn-spanish.md': project('Learn Spanish', 'active'),
  'projects/old.md': project('Old one', 'paused'),
})

async function setup(files = seed(), settings = new MemorySettings()) {
  const store = new MemoryFileStore(files)
  const user = userEvent.setup()
  render(<App store={store} settings={settings} now={() => NOW} />)
  await screen.findByRole('heading', { name: 'To do' })
  return { store, user }
}
const openNotes = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.keyboard('o')
  return await screen.findByRole('region', { name: 'Notes' })
}

describe('NotesView', () => {
  it('"o" opens Notes with General notes first, then active projects only', async () => {
    const { user } = await setup()
    const view = within(await openNotes(user))
    const items = view.getAllByRole('button').map((b) => b.textContent)
    expect(items).toEqual(['General notes', 'Flow app', 'Learn Spanish'])
    expect(view.getByRole('button', { name: 'General notes' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('heading', { name: 'To do' })).not.toBeInTheDocument()
  })

  it('the sidebar item opens Notes and persists the view', async () => {
    const settings = new MemorySettings()
    const { user } = await setup(seed(), settings)
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    expect(await screen.findByRole('region', { name: 'Notes' })).toBeInTheDocument()
    await waitFor(async () => expect(await settings.get('view')).toBe('notes'))
  })

  it('shows the storage path and a calm placeholder', async () => {
    const { user } = await setup()
    const view = within(await openNotes(user))
    expect(view.getByText('notes.md')).toBeInTheDocument()
    expect(view.getByPlaceholderText('Write anything…')).toBeInTheDocument()
    await user.click(view.getByRole('button', { name: 'Flow app' }))
    expect(view.getByText('projects/flow-app.md')).toBeInTheDocument()
  })

  it('editing General notes writes notes.md on blur', async () => {
    const { store, user } = await setup()
    const view = within(await openNotes(user))
    expect(store.files['notes.md']).toBeUndefined()
    await user.type(view.getByRole('textbox', { name: 'Notes text' }), 'Remember milk')
    expect(store.files['notes.md']).toBeUndefined()
    await user.tab()
    await waitFor(() => expect(store.files['notes.md']).toBe('Remember milk'))
  })

  it('selecting a project and editing writes its body', async () => {
    const { store, user } = await setup()
    const view = within(await openNotes(user))
    await user.click(view.getByRole('button', { name: 'Flow app' }))
    const area = view.getByRole('textbox', { name: 'Notes text' })
    expect(area).toHaveValue('Flow body\n')
    await user.type(area, 'more')
    await user.tab()
    await waitFor(() => expect(store.files['projects/flow-app.md']).toContain('Flow body\nmore'))
    expect(store.files['projects/flow-app.md']).toContain('title: Flow app')
  })

  it('switching items saves the current draft first', async () => {
    const { store, user } = await setup()
    const view = within(await openNotes(user))
    await user.type(view.getByRole('textbox', { name: 'Notes text' }), 'draft one')
    await user.click(view.getByRole('button', { name: 'Learn Spanish' }))
    await waitFor(() => expect(store.files['notes.md']).toBe('draft one'))
    expect(view.getByRole('textbox', { name: 'Notes text' })).toHaveValue('')
    await user.click(view.getByRole('button', { name: 'General notes' }))
    expect(view.getByRole('textbox', { name: 'Notes text' })).toHaveValue('draft one')
  })

  it('preselects the focused project', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Flow app' }))
    const view = within(await openNotes(user))
    expect(view.getByRole('button', { name: 'Flow app' })).toHaveAttribute('aria-pressed', 'true')
    expect(view.getByRole('textbox', { name: 'Notes text' })).toHaveValue('Flow body\n')
  })

  it('an unreadable notes.md is read-only with a calm line and is never written', async () => {
    const bad = '---\ntags: [oops\n---\nmy words'
    const { store, user } = await setup({ ...seed(), 'notes.md': bad })
    const view = within(await openNotes(user))
    expect(view.getByText("notes.md couldn't be read — fix it in a text editor")).toBeInTheDocument()
    const area = view.getByRole('textbox', { name: 'Notes text' })
    expect(area).toHaveAttribute('readonly')
    await user.type(area, 'zzz')
    await user.tab()
    expect(store.files['notes.md']).toBe(bad)
    // projects stay editable
    await user.click(view.getByRole('button', { name: 'Flow app' }))
    expect(view.queryByText(/couldn't be read/)).not.toBeInTheDocument()
    expect(view.getByRole('textbox', { name: 'Notes text' })).not.toHaveAttribute('readonly')
  })

  it('follows an outside change to notes.md while not typing', async () => {
    const { store, user } = await setup({ ...seed(), 'notes.md': 'first' })
    const view = within(await openNotes(user))
    expect(view.getByRole('textbox', { name: 'Notes text' })).toHaveValue('first')
    act(() => store.externalWrite('notes.md', 'second'))
    await waitFor(() => expect(view.getByRole('textbox', { name: 'Notes text' })).toHaveValue('second'))
  })
  it('blur without typing keeps an outside change that arrived while focused', async () => {
    const { store, user } = await setup({ ...seed(), 'notes.md': 'first' })
    const view = within(await openNotes(user))
    const area = view.getByRole('textbox', { name: 'Notes text' })
    await user.click(area)
    await act(async () => { store.externalWrite('notes.md', 'second'); await new Promise((r) => setTimeout(r, 50)) })
    expect(area).toHaveValue('first') // never overwrite the editor while it has focus
    await user.tab()
    await waitFor(() => expect(area).toHaveValue('second'))
    expect(store.files['notes.md']).toBe('second')
  })
})
