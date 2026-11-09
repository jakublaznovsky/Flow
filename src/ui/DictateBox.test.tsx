import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DictateBox from './DictateBox'

const wait = () => act(async () => { await new Promise((r) => setTimeout(r, 200)) })

describe('DictateBox', () => {
  it('mic button opens a focused field and starts dictation once', async () => {
    const dictate = vi.fn(async () => {})
    const onOpenChange = vi.fn()
    render(<DictateBox dictate={dictate} onSubmit={vi.fn()} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dictate a thought' }))
    const field = screen.getByRole('textbox', { name: 'Speak a thought' })
    expect(field).toHaveFocus()
    await wait()
    expect(dictate).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
  })

  it('Enter saves trimmed text and closes; blank Enter does nothing', async () => {
    const onSubmit = vi.fn()
    const onOpenChange = vi.fn()
    render(<DictateBox dictate={async () => {}} onSubmit={onSubmit} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dictate a thought' }))
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    await userEvent.keyboard('  Call the dentist {Enter}')
    expect(onSubmit).toHaveBeenCalledWith('Call the dentist')
    expect(screen.queryByRole('textbox', { name: 'Speak a thought' })).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dictate a thought' })).toHaveFocus())
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('Escape cancels without saving', async () => {
    const onSubmit = vi.fn()
    render(<DictateBox dictate={async () => {}} onSubmit={onSubmit} onOpenChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dictate a thought' }))
    await userEvent.keyboard('half a thought{Escape}')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'Speak a thought' })).toBeNull()
  })

  it('an outside click closes it only while empty (typed text is kept)', async () => {
    render(<><button>elsewhere</button><DictateBox dictate={async () => {}} onSubmit={vi.fn()} onOpenChange={vi.fn()} /></>)
    await userEvent.click(screen.getByRole('button', { name: 'Dictate a thought' }))
    await userEvent.keyboard('keep me')
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.getByRole('textbox', { name: 'Speak a thought' })).toHaveValue('keep me')
    await userEvent.clear(screen.getByRole('textbox', { name: 'Speak a thought' }))
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('textbox', { name: 'Speak a thought' })).toBeNull()
  })

  it('a failed dictation start keeps the field open for Win+H by hand and reports once', async () => {
    const onError = vi.fn()
    render(<DictateBox dictate={async () => { throw new Error('no SendInput') }} onSubmit={vi.fn()} onOpenChange={vi.fn()} onError={onError} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dictate a thought' }))
    await wait()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('textbox', { name: 'Speak a thought' })).toBeInTheDocument()
  })
})
