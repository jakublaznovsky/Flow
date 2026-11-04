import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  placeholder: string
  needProject: boolean
  pickProject: boolean
  projects: { slug: string; title: string }[]
  defaultProject: string | null
  /** `scheduled` is the optional "Plan for" day ('' for none); only sent when `planFor` is on. */
  onAdd: (title: string, slug: string | null, scheduled: string) => void
  onCreateProject: (title: string) => string
  /** Show an optional "Plan for" date field (To do). */
  planFor?: boolean
  /** When true, opens the input (or focuses it when already open) and calls onOpenHandled. */
  openRequest?: boolean
  onOpenHandled?: () => void
}

/**
 * "+" button that expands into an inline form. It closes on Escape (anywhere in the form), on
 * Cancel, and on a click outside while nothing is typed or picked (content is never thrown away
 * by a stray click).
 */
export default function AddCard({ label, placeholder, needProject, pickProject, projects, defaultProject, onAdd, onCreateProject, planFor, openRequest, onOpenHandled }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [date, setDate] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const [slug, setSlug] = useState<string | null>(null)
  const askProject = needProject && created === null
  const showSelect = pickProject && !needProject && projects.length > 1
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  // Typed text or a chosen date count as content: an outside click never throws them away.
  const hasContentRef = useRef(false)
  hasContentRef.current = text.trim() !== '' || date !== ''

  useEffect(() => {
    if (!openRequest) return
    setOpen(true)
    inputRef.current?.focus()
    onOpenHandled?.()
  }, [openRequest, onOpenHandled])

  const close = () => { setOpen(false); setText(''); setDate(''); setCreated(null); setSlug(null) }

  // Outside click closes an empty form. Capture phase, so cards that stop propagation still count.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (formRef.current?.contains(e.target as Node)) return
      if (hasContentRef.current) return
      setOpen(false); setText(''); setDate(''); setCreated(null); setSlug(null)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [open])

  const submit = () => {
    const t = text.trim()
    if (!t) return
    if (askProject) {
      setCreated(onCreateProject(t))
      setText('')
      return
    }
    onAdd(t, created ?? slug ?? defaultProject, planFor ? date : '')
    close()
  }

  if (!open) {
    return (
      <button className="add-btn" aria-label={label} onClick={() => setOpen(true)}>
        <span aria-hidden="true">+</span> Add
      </button>
    )
  }
  return (
    <form
      ref={formRef}
      className="add-form"
      onSubmit={(e) => { e.preventDefault(); submit() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() } }}
    >
      <input
        ref={inputRef}
        autoFocus
        aria-label={askProject ? 'Project title' : placeholder}
        placeholder={askProject ? 'First, name a project' : placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {showSelect && (
        <select aria-label="Project for new task" value={slug ?? defaultProject ?? ''} onChange={(e) => setSlug(e.target.value)}>
          {projects.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
        </select>
      )}
      {planFor && !askProject && (
        <label className="plan-for">
          <span>Plan for</span>
          <input type="date" aria-label="Plan for" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      )}
      <div className="add-actions">
        <button type="submit" className="primary" aria-label={askProject ? 'Create project' : 'Add'}>{askProject ? 'Create' : 'Add'}</button>
        <button type="button" className="ghost" onClick={close}>Cancel</button>
      </div>
    </form>
  )
}
