import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { addDays, dayParts, weekStart } from '../model/dates'
import type { ISODate } from '../model/types'

interface Props {
  title: string
  today: ISODate
  /** The task's planned day (To do / Tomorrow), if any. */
  scheduled?: ISODate
  /** True for a task in the Today column. */
  inToday: boolean
  /** A date plans the task for that day (today = Today column); null removes the date. */
  onPlan: (date: ISODate | null) => void
}

interface Choice { label: string; date: ISODate }

/** Today, Tomorrow, the 5 days after tomorrow ("Fri 6") and next Monday when not already listed. */
export function planChoices(today: ISODate): Choice[] {
  const short = (date: ISODate) => { const p = dayParts(date); return `${p.weekday} ${p.day}` }
  const nextMonday = addDays(weekStart(today), 7)
  const list: Choice[] = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    ...[2, 3, 4, 5, 6].map((n) => ({ label: short(addDays(today, n)), date: addDays(today, n) })),
  ]
  // Next Monday is often already one of the days above; list it only once.
  if (!list.some((c) => c.date === nextMonday)) list.push({ label: `Next week (${short(nextMonday)})`, date: nextMonday })
  return list
}

const CalendarIcon = () => (
  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2.5" width="9" height="8" rx="1.5" /><path d="M1.5 5h9M4 1.3v2.2M8 1.3v2.2" />
  </svg>
)

/** Calendar button on a task card that opens a small "plan for" menu (no dialog). */
export default function PlanMenu({ title, today, scheduled, inToday, onPlan }: Props) {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [pos, setPos] = useState<CSSProperties>({ opacity: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const choices = planChoices(today)
  const current = inToday ? today : scheduled
  // The first matching choice is the current one; a date outside the list marks "Pick a date…".
  const currentIdx = current === undefined ? -1 : choices.findIndex((c) => c.date === current)
  const picked = current !== undefined && currentIdx < 0 ? current : undefined

  const closeRef = useRef<(refocus: boolean) => void>(() => {})
  const close = (refocus: boolean) => {
    setOpen(false); setPicking(false)
    if (refocus) buttonRef.current?.focus()
  }
  closeRef.current = close
  const choose = (date: ISODate | null) => { close(true); onPlan(date) }

  // Fixed position next to the button, so the menu is never clipped by the column's scroll area.
  useLayoutEffect(() => {
    if (!open) return
    const b = buttonRef.current?.getBoundingClientRect()
    const m = menuRef.current?.getBoundingClientRect()
    if (!b || !m) return
    const vw = window.innerWidth, vh = window.innerHeight
    const left = Math.max(8, Math.min(b.right - m.width, vw - m.width - 8))
    const below = b.bottom + 4
    const top = below + m.height > vh - 8 ? Math.max(8, b.top - 4 - m.height) : below
    setPos({ top, left })
  }, [open, picking])

  useEffect(() => {
    if (!open) return
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
    const start = menuRef.current?.querySelector<HTMLElement>('[aria-current="true"]') ?? items?.[0]
    start?.focus({ preventScroll: true })
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return
      closeRef.current(false)
    }
    // Escape also closes when focus has left the menu (e.g. the pointer clicked its padding).
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeRef.current(true) } }
    // The menu is placed once; scrolling or resizing would leave it floating, so it closes.
    const onMove = () => closeRef.current(false)
    // Focus moving anywhere outside (Tab, a shortcut opening another field) closes it too.
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return
      closeRef.current(false)
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onMove, true)
    document.addEventListener('focusin', onFocusIn)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onMove, true)
      document.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    e.preventDefault()
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length
    items[next]?.focus()
  }

  // A date field passes through complete-looking dates while being typed (one digit of a pre-filled
  // value is enough), so the picked date applies only on Set or Enter, never on change.
  const dateRef = useRef<HTMLInputElement>(null)
  const applyPicked = () => {
    const v = dateRef.current?.value ?? ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) choose(v)
  }

  const item = (label: string, onClick: () => void, isCurrent: boolean, key?: string) => (
    <button key={key ?? label} type="button" role="menuitem" aria-current={isCurrent ? 'true' : undefined} onClick={onClick}>
      <span className="plan-check" aria-hidden="true">{isCurrent ? '✓' : ''}</span>{label}
    </button>
  )

  return (
    <>
      <button
        ref={buttonRef} type="button" className="plan-toggle" aria-label={`Plan ${title}`}
        aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close(false) : setOpen(true))}
      >
        <CalendarIcon />
      </button>
      {open && createPortal(
        <div
          ref={menuRef} className="menu plan-menu" role="menu" aria-label={`Plan ${title}`} style={pos}
          onKeyDown={onKeyDown} onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => { if (!(e.target as Element).closest('button, input')) e.preventDefault() }}
        >
          {choices.slice(0, 2).map((c, i) => item(c.label, () => choose(c.date), i === currentIdx, c.date))}
          <div className="menu-sep" />
          {choices.slice(2).map((c, i) => item(c.label, () => choose(c.date), i + 2 === currentIdx, c.date))}
          <div className="menu-sep" />
          {picking ? (
            <div className="plan-pick">
              <input
                ref={dateRef} autoFocus type="date" className="plan-date" aria-label="Pick a date" defaultValue={picked ?? ''}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPicked() } }}
              />
              <button type="button" className="primary plan-set" onClick={applyPicked}>Set</button>
            </div>
          ) : item(picked ? `Pick a date… (${dayParts(picked).weekday} ${dayParts(picked).day} ${dayParts(picked).month})` : 'Pick a date…', () => setPicking(true), picked !== undefined, 'pick')}
          {scheduled !== undefined && item('Remove date', () => choose(null), false, 'remove')}
        </div>,
        document.body,
      )}
    </>
  )
}
