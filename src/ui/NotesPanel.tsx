import { useEffect, useRef, useState } from 'react'

interface Props {
  body: string
  onSaveBody: (body: string) => void
  onAddDecision: (text: string) => void
  onClose: () => void
}

/** Right-side drawer with the project notes. Mounted per project (keyed by slug). */
export default function NotesPanel({ body, onSaveBody, onAddDecision, onClose }: Props) {
  const [draft, setDraft] = useState(body)
  const [decision, setDecision] = useState('')
  const editing = useRef(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // Follow outside changes, but never overwrite what is being typed.
  useEffect(() => { if (!editing.current) setDraft(body) }, [body])

  const save = () => { if (draft !== body) onSaveBody(draft) }
  const close = () => { if (editing.current) save(); onClose() }
  const closeRef = useRef(close)
  closeRef.current = close

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) closeRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <aside className="notes-panel" role="complementary" aria-label="Project notes">
      <header>
        <h2>Notes</h2>
        <button className="link-btn" onClick={close}>Close</button>
      </header>
      <textarea
        ref={areaRef}
        aria-label="Project notes"
        placeholder="Notes for this project"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => { editing.current = true }}
        onBlur={() => { editing.current = false; save() }}
      />
      <input
        aria-label="Add decision"
        placeholder="Add decision"
        value={decision}
        onChange={(e) => setDecision(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && decision.trim()) { e.preventDefault(); onAddDecision(decision); setDecision('') }
        }}
      />
    </aside>
  )
}
