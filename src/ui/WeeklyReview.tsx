import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Card } from '../model/board'
import { addDays, dayParts, isoWeek, weekStart } from '../model/dates'
import { buildReviewPrompt } from '../model/review'
import { saveReview, unfinishedThisWeek } from '../model/review-week'
import { scheduleTask } from '../model/schedule'
import { doneOn, focusMinutesOn, weekDates } from '../model/stats'
import { deleteTask, moveTask } from '../model/tasks'
import type { Change, FlowData, ISODate } from '../model/types'
import { useCopyText } from './useCopyText'

interface Props {
  data: FlowData
  today: ISODate
  apply: (fn: (d: FlowData) => Change) => void
  /** Leave the review (back to the Board). */
  onFinish: () => void
  /** Extra controls shown next to "Copy AI review" in the last step. */
  aiSlot?: ReactNode
}

const STEPS = ['Your week', 'Unfinished', 'Next week', 'Reflect']
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
type Outcome = 'kept' | 'next' | 'todo'

function YourWeek({ data, today }: { data: FlowData; today: ISODate }) {
  const dates = weekDates(today)
  const minutes = dates.reduce((n, date) => n + focusMinutesOn(data, date), 0)
  const total = dates.reduce((n, date) => n + doneOn(data, date).length, 0)
  return (
    <>
      <h2>Your week</h2>
      <p className="review-summary">
        {total === 0 ? 'No tasks finished yet this week.' : `${total} ${total === 1 ? 'task' : 'tasks'} finished.`}{' '}
        <span>{minutes} min focused</span>
      </p>
      <div className="review-days">
        {dates.map((date, i) => (
          <div key={date} role="group" aria-label={`${DAY_NAMES[i]} ${date}`} className="review-day">
            <div className="review-day-head"><span>{DAY_NAMES[i]}</span><span>{Number(date.slice(8))}</span></div>
            <ul>{doneOn(data, date).map((e, j) => <li key={`${e.ref}-${j}`}>{e.title}</li>)}</ul>
          </div>
        ))}
      </div>
    </>
  )
}

function Unfinished({ data, today, apply }: { data: FlowData; today: ISODate; apply: Props['apply'] }) {
  // The rows are fixed when the step opens, so a task stays in place after you act on it.
  const [rows] = useState<Card[]>(() => unfinishedThisWeek(data, today))
  const [outcome, setOutcome] = useState<Record<string, Outcome>>({})
  const [deleted, setDeleted] = useState<Set<string>>(new Set())
  const nextMonday = addDays(weekStart(today), 7)
  const set = (key: string, o: Outcome) => setOutcome((cur) => ({ ...cur, [key]: o }))
  const keep = (key: string) => { apply((d) => moveTask(d, key, 'today', today)); set(key, 'kept') }
  const later = (key: string) => { apply((d) => scheduleTask(d, key, nextMonday, today)); set(key, 'next') }
  const back = (key: string) => {
    apply((d) => {
      const moved = moveTask(d, key, 'todo', today)
      const cleared = scheduleTask(moved.data, key, null, today)
      return { data: cleared.data, changed: [...new Set([...moved.changed, ...cleared.changed])] }
    })
    set(key, 'todo')
  }
  const remove = (key: string) => { apply((d) => deleteTask(d, key)); setDeleted((cur) => new Set(cur).add(key)) }
  const label = (o: Outcome) => o === 'kept' ? 'Kept in Today'
    : o === 'next' ? (() => { const p = dayParts(nextMonday); return `Next week: ${p.weekday} ${p.day} ${p.month}` })()
      : 'Back in To do'
  const shown = rows.filter((c) => !deleted.has(c.key))
  return (
    <>
      <h2>Unfinished</h2>
      {shown.length === 0 ? <p className="review-empty">Nothing unfinished this week.</p> : (
        <ul className="review-rows" aria-label="Unfinished tasks">
          {shown.map((c) => {
            const o = outcome[c.key]
            const btn = (name: string, which: Outcome, onClick: () => void) =>
              <button type="button" className="btn" aria-pressed={o === which} onClick={onClick}>{name}</button>
            return (
              <li key={c.key} aria-label={c.title} className="review-row">
                <div className="review-row-title">
                  <span className="dot" aria-hidden="true" style={{ background: c.color }} />
                  <span>{c.title}</span>
                  <span className="review-project">{c.projectTitle}</span>
                </div>
                <div className="review-row-actions">
                  {btn('Keep in Today', 'kept', () => keep(c.key))}
                  {btn('Next week', 'next', () => later(c.key))}
                  {btn('Back to To do', 'todo', () => back(c.key))}
                  <button type="button" className="btn review-delete" onClick={() => remove(c.key)}>Delete</button>
                </div>
                {o && <div className="review-outcome">{label(o)}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function NextWeek({ data, week, apply }: { data: FlowData; week: string; apply: Props['apply'] }) {
  const active = Object.values(data.projects).filter((p) => p.status === 'active')
  const review = data.reviews[week]
  const focus = review?.focusProject && data.projects[review.focusProject]?.status === 'active' ? review.focusProject : ''
  const [draft, setDraft] = useState(review?.intention ?? '')
  const editing = useRef(false)
  const dirty = useRef(false) // only a typed change is saved; otherwise an outside edit wins
  const stored = review?.intention ?? ''
  useEffect(() => { if (!editing.current) setDraft(stored) }, [stored])
  const pick = (slug: string) => apply((d) => saveReview(d, week, { focusProject: slug === '' ? null : slug }))
  return (
    <>
      <h2>Next week's focus</h2>
      <p className="review-hint">Saved with this review — shown with a ★ next week.</p>
      <fieldset className="review-focus">
        <legend>Focus project</legend>
        <label className="review-option"><input type="radio" name="focus-project" checked={focus === ''} onChange={() => pick('')} /><span>No focus</span></label>
        {active.map((p) => (
          <label key={p.slug} className="review-option">
            <input type="radio" name="focus-project" checked={focus === p.slug} onChange={() => pick(p.slug)} />
            <span className="dot" aria-hidden="true" style={{ background: p.color }} /><span>{p.title}</span>
          </label>
        ))}
      </fieldset>
      <label className="review-field">
        <span>Intention</span>
        <input
          type="text"
          aria-label="Intention"
          placeholder="One line: what matters most next week?"
          value={draft}
          onChange={(e) => { dirty.current = true; setDraft(e.target.value) }}
          onFocus={() => { editing.current = true }}
          onBlur={() => {
            editing.current = false
            if (!dirty.current) { setDraft(stored); return }
            dirty.current = false
            apply((d) => saveReview(d, week, { intention: draft }))
          }}
        />
      </label>
    </>
  )
}

function Reflect({ data, today, week, apply, aiSlot }: { data: FlowData; today: ISODate; week: string; apply: Props['apply']; aiSlot?: ReactNode }) {
  const stored = data.reviews[week]?.body ?? ''
  const [draft, setDraft] = useState(stored)
  const editing = useRef(false)
  const dirty = useRef(false) // only a typed change is saved; otherwise an outside edit wins
  useEffect(() => { if (!editing.current) setDraft(stored) }, [stored])
  const { copied, fallback, copy } = useCopyText(() => buildReviewPrompt(data, today))
  return (
    <>
      <h2>Reflect</h2>
      <textarea
        className="review-reflection"
        aria-label="Reflection"
        placeholder="What went well? What got in the way? Anything to remember."
        value={draft}
        onChange={(e) => { dirty.current = true; setDraft(e.target.value) }}
        onFocus={() => { editing.current = true }}
        onBlur={() => {
          editing.current = false
          if (!dirty.current) { setDraft(stored); return }
          dirty.current = false
          apply((d) => saveReview(d, week, { body: draft }))
        }}
      />
      <div className="review-ai">
        <button type="button" className="btn" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy AI review'}</button>
        {aiSlot}
      </div>
      {fallback !== null && (
        <textarea className="progress-fallback" aria-label="AI review prompt" readOnly value={fallback} onFocus={(e) => e.currentTarget.select()} />
      )}
    </>
  )
}

/** Guided 5-minute weekly review: your week, unfinished tasks, next week's focus, reflection. */
export default function WeeklyReview({ data, today, apply, onFinish, aiSlot }: Props) {
  const [step, setStep] = useState(0)
  const week = isoWeek(today)
  return (
    <section className="review-view" role="region" aria-label="Weekly review">
      <div className="review-card">
        <ol className="review-steps" aria-label="Steps">
          {STEPS.map((name, i) => (
            <li key={name} className={i === step ? 'is-current' : i < step ? 'is-past' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="review-step-no" aria-hidden="true">{i + 1}</span>{' '}{name}
            </li>
          ))}
        </ol>
        <div className="review-body">
          {step === 0 && <YourWeek data={data} today={today} />}
          {step === 1 && <Unfinished data={data} today={today} apply={apply} />}
          {step === 2 && <NextWeek data={data} week={week} apply={apply} />}
          {step === 3 && <Reflect data={data} today={today} week={week} apply={apply} aiSlot={aiSlot} />}
        </div>
        <div className="review-nav">
          {step > 0 ? <button type="button" className="btn" onClick={() => setStep(step - 1)}>Back</button> : <span />}
          {step < 3
            ? <button type="button" className="btn primary" onClick={() => setStep(step + 1)}>Next</button>
            : <button type="button" className="btn primary" onClick={onFinish}>Finish</button>}
        </div>
      </div>
    </section>
  )
}
