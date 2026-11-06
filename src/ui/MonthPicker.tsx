import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ISODate } from '../model/types'

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const pad = (n: number) => String(n).padStart(2, '0')
const ym = (date: ISODate): [number, number] => [Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1]

interface Props {
  /** The shown month ("YYYY-MM-DD", any day of it): highlighted, and where the picker opens. */
  current: ISODate
  today: ISODate
  /** The 1st of the chosen month. */
  onChoose: (first: ISODate) => void
  /** Closes the picker; refocus = return focus to the title button. */
  onClose: (refocus: boolean) => void
  /** The title button: clicks on it are not "outside" (it toggles the picker itself). */
  anchor: React.RefObject<HTMLElement | null>
}

/**
 * Outlook-style month/year popover under the Week view title: the year with ↑ (previous) and
 * ↓ (next) buttons and a 4×3 grid of months. Arrow keys move between months (Left/Right ±1,
 * Up/Down ±4, across years), Enter/Space choose, Escape closes, Tab cycles inside. Keys never
 * reach the app's shortcuts while it is open.
 */
export default function MonthPicker({ current, today, onChoose, onClose, anchor }: Props) {
  const [curYear, curMonth] = ym(current)
  const [todayYear, todayMonth] = ym(today)
  // `active` is the roving month (0–11) in `year`; it is the grid's one tab stop.
  const [year, setYear] = useState(curYear)
  const [active, setActive] = useState(curMonth)
  const ref = useRef<HTMLDivElement>(null)
  const focusActive = useRef(true)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!focusActive.current) return
    focusActive.current = false
    ref.current?.querySelector<HTMLElement>(`[data-month="${active}"]`)?.focus()
  }, [year, active])

  useEffect(() => {
    const outside = (t: EventTarget | null) => !(ref.current?.contains(t as Node) || anchor.current?.contains(t as Node))
    const onDown = (e: MouseEvent) => { if (outside(e.target)) closeRef.current(false) }
    const onFocusIn = (e: FocusEvent) => { if (outside(e.target)) closeRef.current(false) }
    // Escape also closes when focus has left the picker (e.g. the pointer clicked the title).
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeRef.current(true) } }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor])

  const moveTo = (index: number) => {
    // index counts months from January of `year`; it may run into the previous or next year.
    const y = year + Math.floor(index / 12)
    const m = ((index % 12) + 12) % 12
    focusActive.current = true
    setYear(y); setActive(m)
  }
  const choose = (m: number) => onChoose(`${year}-${pad(m + 1)}-01`)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Nothing typed here may reach the app's single-key shortcuts.
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); onClose(true); return }
    if (e.key === 'Tab') {
      const stops = [...(ref.current?.querySelectorAll<HTMLElement>('button:not([tabindex="-1"])') ?? [])]
      const at = stops.indexOf(document.activeElement as HTMLElement)
      e.preventDefault()
      const next = e.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at + 1) % stops.length
      stops[next]?.focus()
      return
    }
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key]
    if (step === undefined || !(e.target as HTMLElement).dataset.month) return
    e.preventDefault()
    moveTo(active + step)
  }

  return (
    <div
      ref={ref} className="month-picker" role="dialog" aria-label="Choose month" onKeyDown={onKeyDown}
      onMouseDown={(e) => { if (!(e.target as Element).closest('button')) e.preventDefault() }}
    >
      <div className="month-picker-head">
        <span className="month-picker-year" aria-live="polite">{year}</span>
        <button type="button" className="icon-btn" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9.5v-7M3 5.5l3-3 3 3" /></svg>
        </button>
        <button type="button" className="icon-btn" aria-label="Next year" onClick={() => setYear((y) => y + 1)}>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2.5v7M3 6.5l3 3 3-3" /></svg>
        </button>
      </div>
      <div className="month-grid">
        {SHORT.map((name, m) => {
          const isCurrent = year === curYear && m === curMonth
          const isToday = year === todayYear && m === todayMonth
          return (
            <button
              key={name} type="button" data-month={m} tabIndex={m === active ? 0 : -1}
              aria-label={`${LONG[m]} ${year}`} aria-current={isCurrent ? 'true' : undefined}
              className={`month-cell${isToday ? ' is-today' : ''}`}
              onClick={() => choose(m)} onFocus={() => setActive(m)}
            >
              {name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
