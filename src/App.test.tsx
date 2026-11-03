import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import App from './App'
import { MemoryFileStore } from './storage/fileStore'
import { MemorySettings } from './ui/settings'

it('renders the Flow heading', () => {
  render(<App store={new MemoryFileStore()} settings={new MemorySettings()} />)
  expect(screen.getByText('Flow')).toBeInTheDocument()
})
