import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import App from './App'

it('renders the Flow heading', () => {
  render(<App />)
  expect(screen.getByText('Flow')).toBeInTheDocument()
})
