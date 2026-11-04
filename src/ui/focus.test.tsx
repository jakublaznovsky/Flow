import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { MemoryFileStore } from '../storage/fileStore'
import { MemorySettings } from './settings'

const START = new Date(2026, 10, 3, 10, 0)
const project = (title: string, tasks: string) =>
  `---\ntitle: ${title}\nstatus: active\ncolor: "#4f8cff"\ncreated: 2026-11-01\ntasks:\n${tasks}---\n`
const seed = (): Record<string, string> => ({
  'projects/flow-app.md': project('Flow app',
    '  - id: t1\n    title: Set up Tauri\n    status: todo\n    created: 2026-11-01\n' +
    '  - id: t2\n    title: Write spec\n    status: today\n    created: 2026-11-01\n' +
    '  - id: t3\n    title: Draw icons\n    status: today\n    created: 2026-11-01\n'),
})

afterEach(() => vi.useRealTimers())

async function setup() {
  let t = START
  vi.useFakeTimers()
  const store = new MemoryFileStore(seed())
  render(<App store={store} settings={new MemorySettings()} now={() => t} />)
  const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
  await flush(); await flush()
  const advance = async (ms: number) => {
    const step = ms >= 60_000 && ms % 60_000 === 0 ? 60_000 : 1000
    for (let left = ms; left > 0; left -= step) {
      t = new Date(t.getTime() + Math.min(step, left))
      await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(step, left)) })
    }
  }
  const dayFile = () => store.files['days/2026-11-03.md'] ?? ''
  return { store, advance, flush, dayFile }
}
const timer = () => screen.getByRole('timer', { name: 'Focus timer' })
const focus = (title: string) => fireEvent.click(screen.getByRole('button', { name: `Focus on ${title}` }))

describe('focus timer', () => {
  it('offers Focus on Today cards only', async () => {
    await setup()
    expect(screen.getByRole('button', { name: 'Focus on Write spec' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Focus on Set up Tauri' })).not.toBeInTheDocument()
  })

  it('starts at 25:00 and counts down', async () => {
    const { advance } = await setup()
    focus('Write spec')
    expect(timer()).toHaveTextContent('25:00')
    expect(screen.getByRole('button', { name: '25' })).toHaveAttribute('aria-pressed', 'true')
    await advance(1000)
    expect(timer()).toHaveTextContent('24:59')
  })

  it('pauses, freezes, and resumes', async () => {
    const { advance } = await setup()
    focus('Write spec')
    await advance(5000)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    await advance(60_000)
    expect(timer()).toHaveTextContent('24:55')
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    await advance(1000)
    expect(timer()).toHaveTextContent('24:54')
  })

  it('stopping at 30 s logs nothing', async () => {
    const { advance, dayFile } = await setup()
    focus('Write spec')
    await advance(30_000)
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(dayFile()).not.toContain('focus')
  })

  it('stopping at 10 min logs 10 minutes', async () => {
    const { advance, flush, dayFile } = await setup()
    focus('Write spec')
    await advance(10 * 60_000)
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await flush(); await flush()
    expect(dayFile()).toContain('focus:')
    expect(dayFile()).toContain('ref: flow-app/t2')
    expect(dayFile()).toMatch(/minutes: 10\b/)
  })

  it('finishing logs the session once and shows Session done', async () => {
    const { advance, flush, dayFile } = await setup()
    focus('Write spec')
    await advance(25 * 60_000)
    expect(screen.getByText(/Session done/)).toHaveTextContent('25 min')
    await advance(5000)
    await flush(); await flush()
    expect(dayFile().match(/minutes: 25\b/g)).toHaveLength(1)
  })

  it('Mark done moves the task to Done and closes the bar', async () => {
    const { advance } = await setup()
    focus('Write spec')
    await advance(25 * 60_000)
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }))
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Done' })).getByText('Write spec')).toBeInTheDocument()
  })

  it('Another round restarts, Close clears', async () => {
    const { advance } = await setup()
    focus('Write spec')
    await advance(25 * 60_000)
    fireEvent.click(screen.getByRole('button', { name: 'Another round' }))
    expect(timer()).toHaveTextContent('25:00')
    await advance(25 * 60_000)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.queryByText(/Session done/)).not.toBeInTheDocument()
  })

  it('starting another task logs the first', async () => {
    const { advance, flush, dayFile } = await setup()
    focus('Write spec')
    await advance(3 * 60_000)
    focus('Draw icons')
    await flush(); await flush()
    expect(dayFile()).toContain('ref: flow-app/t2')
    expect(dayFile()).toMatch(/minutes: 3\b/)
    expect(screen.getByRole('timer')).toHaveTextContent('Draw icons')
    expect(timer()).toHaveTextContent('25:00')
  })

  it('changing the preset while running changes the length', async () => {
    const { advance } = await setup()
    focus('Write spec')
    await advance(60_000)
    fireEvent.click(screen.getByRole('button', { name: '45' }))
    expect(timer()).toHaveTextContent('44:00')
    fireEvent.click(screen.getByRole('button', { name: '15' }))
    expect(timer()).toHaveTextContent('14:00')
  })

  it('a preset shorter than elapsed finishes the session', async () => {
    const { advance } = await setup()
    focus('Write spec')
    await advance(20 * 60_000)
    fireEvent.click(screen.getByRole('button', { name: '15' }))
    expect(screen.getByText(/Session done/)).toHaveTextContent('15 min')
  })
})
