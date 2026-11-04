import { useEffect, useState, type ReactNode } from 'react'
import { setDayNote } from '../model/notes-day'
import { buildReviewPrompt } from '../model/review'
import { doneOn, focusMinutesOn, heatmap, projectProgress, weekDates } from '../model/stats'
import type { Change, FlowData } from '../model/types'
import { useCopyText } from './useCopyText'

interface Props {
  data: FlowData
  today: string
  apply: (fn: (d: FlowData) => Change) => void
  /** Extra controls shown next to "Copy AI review". */
  aiSlot?: ReactNode
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function TodayNote({ body, today, apply }: { body: string; today: string; apply: Props['apply'] }) {
  const [text, setText] = useState(body)
  const [focused, setFocused] = useState(false)
  // Follow outside changes (reload, date change) unless the owner is typing.
  useEffect(() => { if (!focused) setText(body) }, [body, focused])
  return (
    <textarea
      className="progress-note"
      aria-label="Today's note"
      placeholder="What happened today? Anything to remember."
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { setFocused(false); apply((d) => setDayNote(d, today, text)) }}
    />
  )
}

function AiReview({ data, today, aiSlot }: { data: FlowData; today: string; aiSlot?: ReactNode }) {
  const { copied, fallback, copy } = useCopyText(() => buildReviewPrompt(data, today))
  return (
    <>
      <p className="progress-hint">Copies a prompt with your last 7 days to paste into Claude or another AI.</p>
      <div className="review-ai progress-ai">
        <button type="button" className="btn" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy AI review'}</button>
        {aiSlot}
      </div>
      {fallback !== null && (
        <textarea className="progress-fallback" aria-label="AI review prompt" readOnly value={fallback} onFocus={(e) => e.currentTarget.select()} />
      )}
    </>
  )
}

export default function ProgressView({ data, today, apply, aiSlot }: Props) {
  const week = weekDates(today)
  const cols = heatmap(data, today)
  const active = Object.values(data.projects).filter((p) => p.status === 'active')
  return (
    <section className="progress-view" aria-label="Progress">
      <section className="p-card" aria-labelledby="p-week"><h2 id="p-week">This week</h2>
        <div className="week-grid">
          {week.map((date, i) => {
            const done = doneOn(data, date)
            const minutes = focusMinutesOn(data, date)
            return (
              <div key={date} role="group" aria-label={`${DAY_NAMES[i]} ${date}`}
                className={`week-day${date === today ? ' is-today' : ''}${date > today ? ' is-future' : ''}`}
                aria-current={date === today ? 'date' : undefined}>
                <div className="week-day-head"><span>{DAY_NAMES[i]}</span><span className="muted">{Number(date.slice(8))}</span></div>
                <ul>{done.map((e, j) => <li key={`${e.ref}-${j}`}>{e.title}</li>)}</ul>
                {minutes > 0 && <div className="muted week-focus">{minutes} min</div>}
              </div>
            )
          })}
        </div>
      </section>
      <div className="p-row">
        <section className="p-card p-year" aria-labelledby="p-year"><h2 id="p-year">Year</h2>
          <div className="heat-wrap">
            <div className="heat-months" aria-hidden="true">
              {cols.map((c, w) => {
                const first = c[0].date
                const show = w === 0 || first.slice(5, 7) !== cols[w - 1][0].date.slice(5, 7)
                return <span key={first}>{show ? MONTHS[Number(first.slice(5, 7)) - 1] : ''}</span>
              })}
            </div>
            <div className="heat-grid">
              {cols.map((c) => c.map((cell) => (
                <span key={cell.date}
                  className={`heat-cell ${cell.future ? 'future' : `level-${cell.level}`}`}
                  title={cell.future ? cell.date : `${cell.date}: ${cell.count} done`} />
              )))}
            </div>
          </div>
        </section>
        <section className="p-card p-projects" aria-labelledby="p-proj"><h2 id="p-proj">Projects</h2>
          {active.length === 0 ? <p className="muted">No active projects.</p> : (
            <ul className="proj-list">
              {active.map((p) => {
                const { done, total, doneLast7 } = projectProgress(data, p.slug, today)
                return (
                  <li key={p.slug}>
                    <div className="proj-head"><span className="proj-dot" style={{ background: p.color }} /><span className="proj-title">{p.title}</span>
                      <span className="muted">{done} of {total} done</span></div>
                    <div className="bar" role="progressbar" aria-label={`${p.title} progress`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
                      <div className="bar-fill" style={{ width: total ? `${(done / total) * 100}%` : '0%', background: p.color }} />
                    </div>
                    <div className="muted proj-recent">{doneLast7} done in last 7 days</div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
      <div className="p-row">
        <section className="p-card" aria-labelledby="p-note"><h2 id="p-note">Today's note</h2>
          <TodayNote body={data.days[today]?.body ?? ''} today={today} apply={apply} />
        </section>
        <section className="p-card" aria-labelledby="p-ai"><h2 id="p-ai">AI review</h2>
          <AiReview data={data} today={today} aiSlot={aiSlot} />
        </section>
      </div>
    </section>
  )
}
