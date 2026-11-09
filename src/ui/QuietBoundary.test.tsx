import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import QuietBoundary from './QuietBoundary'

function Boom(): never { throw new Error('chunk failed') }

describe('QuietBoundary', () => {
  it('renders nothing and reports the error when a child fails', () => {
    const onError = vi.fn()
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(<div><QuietBoundary onError={onError}><Boom /></QuietBoundary></div>)
    quiet.mockRestore()
    expect(container.firstElementChild!.childElementCount).toBe(0)
    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0][0] as Error).message).toBe('chunk failed')
  })

  it('renders its children otherwise', () => {
    const { getByText } = render(<QuietBoundary onError={() => {}}><span>fine</span></QuietBoundary>)
    expect(getByText('fine')).toBeInTheDocument()
  })
})
