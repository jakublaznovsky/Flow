import { useEffect, useRef, useState } from 'react'
import { aiErrorMessage, type AiClient, type AiModel, type Plan, type PlanSuggestion } from '../ai/claude'
import Markdownish from './Markdownish'
import { typingTarget } from './typing'
import { useCopyText } from './useCopyText'

export type AiKind = 'review' | 'plan'
type Status = 'running' | 'done' | 'stopped' | 'error'

interface Props {
  kind: AiKind
  client: AiClient
  model: AiModel
  /** Built when the panel opens; it is exactly what gets sent. */
  prompt: string
  onClose: () => void
  /** Append the review to General notes; false when notes.md can't be written. */
  onSaveNotes: (text: string) => boolean
  /** Put suggestions on tomorrow, all in one change; says per suggestion whether it worked. */
  onAdd: (list: PlanSuggestion[]) => boolean[]
}

const TITLE: Record<AiKind, string> = { review: 'Review of your week', plan: 'Plan for tomorrow' }

/** "Review my week" / "Plan tomorrow" buttons, or the way to Settings when no key is saved. */
export function AiActions({ ready, onReview, onPlan, onSetup }: {
  ready: boolean; onReview: () => void; onPlan?: () => void; onSetup: () => void
}) {
  if (!ready) return <button type="button" className="btn" onClick={onSetup}>Set up Claude in Settings</button>
  return (
    <>
      <button type="button" className="btn" onClick={onReview}>Review my week</button>
      {onPlan && <button type="button" className="btn" onClick={onPlan}>Plan tomorrow</button>}
    </>
  )
}

function Thinking() {
  return (
    <p className="ai-thinking" role="status">
      <span className="ai-dots" aria-hidden="true"><span /><span /><span /></span>
      Claude is thinking…
    </p>
  )
}

function Suggestions({ plan, onAdd }: { plan: Plan; onAdd: Props['onAdd'] }) {
  const [result, setResult] = useState<Record<number, 'added' | 'failed'>>({})
  const add = (idx: number[]) => {
    const todo = idx.filter((i) => result[i] === undefined)
    if (todo.length === 0) return
    const ok = onAdd(todo.map((i) => plan.tasks[i]))
    setResult((cur) => ({ ...cur, ...Object.fromEntries(todo.map((i, j) => [i, ok[j] ? 'added' : 'failed'])) }))
  }
  const remaining = plan.tasks.map((_, i) => i).filter((i) => result[i] === undefined)
  return (
    <>
      {plan.summary && <p className="ai-summary">{plan.summary}</p>}
      {plan.tasks.length === 0 ? <p className="ai-muted">No tasks suggested.</p> : (
        <ul className="ai-suggestions" aria-label="Suggestions">
          {plan.tasks.map((s, i) => (
            <li key={i} aria-label={s.title} className="ai-suggestion">
              <div className="ai-suggestion-head">
                <span className="ai-suggestion-title">{s.title}</span>
                <span className="ai-muted">{s.project}{s.ref ? '' : ' · new'}</span>
              </div>
              {s.first_step && <div className="ai-step"><span className="ai-step-label">First step</span> <span>{s.first_step}</span></div>}
              {result[i] === 'added' ? <span className="ai-added">Added</span>
                : result[i] === 'failed' ? <span className="ai-muted ai-result">Couldn't add</span>
                  : <button type="button" className="btn" onClick={() => add([i])}>Plan for tomorrow</button>}
            </li>
          ))}
        </ul>
      )}
      {remaining.length > 1 && (
        <div className="ai-actions"><button type="button" className="btn primary" onClick={() => add(remaining)}>Add all</button></div>
      )}
    </>
  )
}

/** Right drawer that runs one Claude request and shows its answer. Mounted per request. */
export default function AiPanel({ kind, client, model, prompt, onClose, onSaveNotes, onAdd }: Props) {
  const [status, setStatus] = useState<Status>('running')
  const [text, setText] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<'saved' | 'failed' | null>(null)
  const ctrl = useRef<AbortController | null>(null)
  const stopped = useRef(false)
  const { copied, fallback, copy } = useCopyText(() => text)

  useEffect(() => {
    const c = new AbortController()
    ctrl.current = c
    stopped.current = false
    let live = true
    setStatus('running'); setText(''); setPlan(null); setError('')
    const run = kind === 'review'
      ? client.reviewWeek(prompt, model, (t) => { if (live) setText((x) => x + t) }, c.signal).then((full) => { if (live) setText(full) })
      : client.planTomorrow(prompt, model, c.signal).then((p) => { if (live) setPlan(p) })
    run.then(
      () => { if (live) setStatus('done') },
      (e: unknown) => {
        if (!live) return
        if (stopped.current) { setStatus('stopped'); return }
        setError(aiErrorMessage(e))
        setStatus('error')
      },
    )
    return () => { live = false; c.abort() }
  }, [kind, client, model, prompt])

  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !typingTarget(document.activeElement)) closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const stop = () => { stopped.current = true; ctrl.current?.abort() }
  const save = () => setSaved(onSaveNotes(text) ? 'saved' : 'failed')
  const running = status === 'running'
  const showText = kind === 'review' && text !== ''

  return (
    <aside className="ai-panel" role="complementary" aria-label={TITLE[kind]}>
      <header>
        <h2>{TITLE[kind]}</h2>
        <button type="button" className="link-btn" onClick={onClose}>Close</button>
      </header>
      <div className="ai-body">
        {running && !showText && <Thinking />}
        {showText && <Markdownish text={text} />}
        {kind === 'plan' && plan && <Suggestions plan={plan} onAdd={onAdd} />}
        {status === 'stopped' && <p className="ai-muted">Stopped.</p>}
        {status === 'error' && <p className="ai-error">{error}</p>}
      </div>
      {running && (
        <div className="ai-actions"><button type="button" className="btn" onClick={stop}>Stop</button></div>
      )}
      {kind === 'review' && !running && status !== 'error' && text !== '' && (
        <div className="ai-actions">
          <button type="button" className="btn" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
          {saved !== 'saved' && <button type="button" className="btn" onClick={save}>Save to notes</button>}
          {saved === 'saved' && <span className="ai-muted">Saved to notes</span>}
          {saved === 'failed' && <span className="ai-muted">Couldn't save — notes.md can't be read</span>}
        </div>
      )}
      {fallback !== null && (
        <textarea className="progress-fallback" aria-label="Claude's answer" readOnly value={fallback} onFocus={(e) => e.currentTarget.select()} />
      )}
    </aside>
  )
}
