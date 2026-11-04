import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'

const NOW = new Date(2026, 10, 3, 10, 0)
const project = (title: string, tasks: string) =>
  `---\ntitle: ${title}\nstatus: active\ncolor: "#4f8cff"\ncreated: 2026-11-01\ntasks:\n${tasks}---\n`
const seed = (): Record<string, string> => ({
  'inbox.md': `---\nitems:\n  - id: i1\n    text: Look into podcasts\n    created: 2026-11-01\n---\n`,
  'projects/flow-app.md': project('Flow app', '  - id: t1\n    title: Set up Tauri\n    status: todo\n    created: 2026-11-01\n'),
  'projects/learn-spanish.md': project('Learn Spanish', '  - id: t1\n    title: Buy a book\n    status: todo\n    created: 2026-11-01\n'),
})
async function setup() {
  const store = new MemoryFileStore(seed())
  render(<App store={store} settings={new MemorySettings()} now={() => NOW} />)
  await screen.findByText('Set up Tauri')
  return { store, user: userEvent.setup() }
}
const col = (name: string) => within(screen.getByRole('region', { name }))

describe('the new-task form can always be closed', () => {
  for (const [column, label] of [['To do', 'New task'], ['Today', 'New task'], ['Tomorrow', 'New task'], ['Parking lot', 'Capture a thought']] as const) {
    it(`${column}: Cancel closes it and clears the text`, async () => {
      const { user } = await setup()
      await user.click(screen.getByRole('button', { name: `Add to ${column}` }))
      await user.type(col(column).getByRole('textbox', { name: label }), 'half a thought')
      await user.click(col(column).getByRole('button', { name: 'Cancel' }))
      expect(col(column).queryByRole('textbox', { name: label })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: `Add to ${column}` }))
      expect(col(column).getByRole('textbox', { name: label })).toHaveValue('')
    })

    it(`${column}: clicking outside closes it when empty, keeps it open with text`, async () => {
      const { user } = await setup()
      await user.click(screen.getByRole('button', { name: `Add to ${column}` }))
      await user.click(screen.getByRole('heading', { name: 'Done' }))
      expect(col(column).queryByRole('textbox', { name: label })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: `Add to ${column}` }))
      await user.type(col(column).getByRole('textbox', { name: label }), 'keep me')
      await user.click(screen.getByRole('heading', { name: 'Done' }))
      expect(col(column).getByRole('textbox', { name: label })).toHaveValue('keep me')
    })
  }

  it('Escape closes it and clears the text, also from the project select', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Add to To do' }))
    await user.type(col('To do').getByRole('textbox', { name: 'New task' }), 'draft')
    await user.keyboard('{Escape}')
    expect(col('To do').queryByRole('textbox', { name: 'New task' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add to To do' }))
    expect(col('To do').getByRole('textbox', { name: 'New task' })).toHaveValue('')
    // The project select is the "menu" inside the form: Escape from there closes the form too.
    await user.selectOptions(col('To do').getByRole('combobox', { name: 'Project for new task' }), 'learn-spanish')
    act(() => col('To do').getByRole('combobox', { name: 'Project for new task' }).focus())
    await user.keyboard('{Escape}')
    expect(col('To do').queryByRole('combobox', { name: 'Project for new task' })).not.toBeInTheDocument()
  })

  it('after "n" opens it, it closes and "n" does not re-open it by itself', async () => {
    const { store, user } = await setup()
    await user.keyboard('n')
    expect(col('To do').getByRole('textbox', { name: 'New task' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(col('To do').queryByRole('textbox', { name: 'New task' })).not.toBeInTheDocument()
    // A later board change (re-render) must not bring it back.
    await user.click(screen.getByRole('checkbox', { name: 'Done: Set up Tauri' }))
    await waitFor(() => expect(store.files['days/2026-11-03.md']).toContain('flow-app/t1'))
    expect(col('To do').queryByRole('textbox', { name: 'New task' })).not.toBeInTheDocument()
    // Opened with n, closed with Cancel, still closed.
    await user.keyboard('n')
    await user.click(col('To do').getByRole('button', { name: 'Cancel' }))
    expect(col('To do').queryByRole('textbox', { name: 'New task' })).not.toBeInTheDocument()
    await user.keyboard('n')
    expect(col('To do').getByRole('textbox', { name: 'New task' })).toHaveFocus()
  })
})

describe('Plan for in the add form', () => {
  it('an outside click keeps the form open when only a date is set', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Add to To do' }))
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(col('To do').getByLabelText('Plan for'), { target: { value: '2026-11-09' } })
    await user.click(screen.getByRole('heading', { name: 'Done' }))
    expect(col('To do').getByLabelText('Plan for')).toHaveValue('2026-11-09')
  })
})
