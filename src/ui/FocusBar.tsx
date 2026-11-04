import type { useFocus } from './useFocus'

const PRESETS = [15, 25, 45] as const

interface Props { focus: ReturnType<typeof useFocus>; onMarkDone: (ref: string) => void }

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  return `${mm}:${String(total % 60).padStart(2, '0')}`
}

export default function FocusBar({ focus, onMarkDone }: Props) {
  const { state, remainingMs } = focus
  if (!state) return null
  if (state.finished) {
    return (
      <div className="focus-bar is-finished" role="timer" aria-label="Focus timer">
        <span className="focus-title">{state.title}</span>
        <span className="focus-status">Session done · {state.minutes} min</span>
        <div className="focus-actions">
          <button type="button" className="primary" onClick={() => onMarkDone(state.ref)}>Mark done</button>
          <button type="button" className="focus-btn" onClick={focus.again}>Another round</button>
          <button type="button" className="focus-btn" onClick={focus.close}>Close</button>
        </div>
      </div>
    )
  }
  const paused = state.pausedAt !== null
  return (
    <div className={`focus-bar${paused ? ' is-paused' : ''}`} role="timer" aria-label="Focus timer">
      <span className="focus-title">{state.title}</span>
      <span className="focus-time">{clock(remainingMs)}</span>
      <div className="focus-presets" role="group" aria-label="Session length">
        {PRESETS.map((m) => (
          <button key={m} type="button" aria-pressed={state.minutes === m} onClick={() => focus.setMinutes(m)}>{m}</button>
        ))}
      </div>
      <div className="focus-actions">
        <button type="button" className="focus-btn" onClick={paused ? focus.resume : focus.pause}>{paused ? 'Resume' : 'Pause'}</button>
        <button type="button" className="focus-btn" onClick={focus.stop}>Stop</button>
      </div>
    </div>
  )
}
