import { useEffect, useRef, useState } from 'react'
import type { Change, FlowData } from '../model/types'
import { NOTES_PATH, projectPath } from '../model/types'
import { setNotes } from '../model/notes'
import { updateProject } from '../model/projects'

interface Props {
  data: FlowData
  apply: (fn: (d: FlowData) => Change) => void
  /** Project to select first (the focused project), if any. */
  initial?: string | null
}

const GENERAL = 'general'

/** Notes view: General notes plus each active project's notes, one calm editor. */
export default function NotesView({ data, apply, initial }: Props) {
  const active = Object.values(data.projects).filter((p) => p.status === 'active')
  const [picked, setPicked] = useState<string>(() => (initial && data.projects[initial]?.status === 'active' ? initial : GENERAL))
  const selected = picked === GENERAL || active.some((p) => p.slug === picked) ? picked : GENERAL
  const project = selected === GENERAL ? undefined : data.projects[selected]
  const unreadable = selected === GENERAL && data.skipped.includes(NOTES_PATH)
  const body = project ? project.body : data.notes.body
  const path = project ? projectPath(project.slug) : NOTES_PATH

  const [draft, setDraft] = useState(body)
  const editing = useRef(false)

  // Follow outside changes (and the switch to another item), but never overwrite what is being typed.
  useEffect(() => { if (!editing.current) setDraft(body) }, [body, selected])

  const save = () => {
    if (unreadable || draft === body) return
    if (project) apply((d) => updateProject(d, project.slug, { body: draft }))
    else apply((d) => setNotes(d, draft))
  }
  const select = (slug: string) => {
    if (slug === selected) return
    save()
    editing.current = false
    setPicked(slug)
  }

  return (
    <section className="notes-view" role="region" aria-label="Notes">
      <ul className="notes-list" aria-label="Notes list">
        <li>
          <button className="notes-item" aria-pressed={selected === GENERAL} onClick={() => select(GENERAL)}>
            General notes
          </button>
        </li>
        {active.map((p) => (
          <li key={p.slug}>
            <button className="notes-item" aria-pressed={selected === p.slug} onClick={() => select(p.slug)}>
              <span className="dot" aria-hidden="true" style={{ background: p.color }} />
              <span className="notes-item-title">{p.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="notes-editor">
        <div className="notes-editor-inner">
          <h2>{project ? project.title : 'General notes'}</h2>
          <p className="notes-path">{path}</p>
          {unreadable && <p className="notes-status">notes.md couldn't be read — fix it in a text editor</p>}
          <textarea
            aria-label="Notes text"
            placeholder="Write anything…"
            readOnly={unreadable}
            value={unreadable ? '' : draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => { editing.current = true }}
            onBlur={() => { editing.current = false; save() }}
          />
        </div>
      </div>
    </section>
  )
}
