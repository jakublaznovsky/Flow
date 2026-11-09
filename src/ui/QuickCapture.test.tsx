import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import QuickCapture from './QuickCapture'

describe('QuickCapture', () => {
  it('submits trimmed text on Enter and clears the input', async () => {
    const onSubmit = vi.fn()
    render(<QuickCapture onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'Call mom{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('Call mom')
    expect(input).toHaveValue('')
  })

  it('does nothing on Enter with empty input', async () => {
    const onSubmit = vi.fn()
    render(<QuickCapture onSubmit={onSubmit} />)
    await userEvent.type(screen.getByRole('textbox'), '{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
