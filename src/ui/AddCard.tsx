import { useState } from 'react'

interface Props {
  label: string
  placeholder: string
  needProject: boolean
  projects: { slug: string; title: string }[]
  defaultProject: string | null
  onAdd: (title: string, slug: string | null) => void
  onCreateProject: (title: string) => string
}

/** "+" button that expands into an inline input. */
export default function AddCard({ label, placeholder, needProject, projects, defaultProject, onAdd, onCreateProject }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const [slug, setSlug] = useState<string | null>(null)
  const askProject = needProject && created === null
  const showSelect = !needProject && projects.length > 1

  const close = () => { setOpen(false); setText(''); setCreated(null); setSlug(null) }

  const submit = () => {
    const t = text.trim()
    if (!t) return
    if (askProject) {
      setCreated(onCreateProject(t))
      setText('')
      return
    }
    onAdd(t, created ?? slug ?? defaultProject)
    close()
  }

  if (!open) {
    return <button className="add-btn" aria-label={label} onClick={() => setOpen(true)}>+</button>
  }
  return (
    <form className="add-form" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <input
        autoFocus
        aria-label={askProject ? 'Project title' : placeholder}
        placeholder={askProject ? 'First, name a project' : placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') close() }}
      />
      {showSelect && (
        <select aria-label="Project for new task" value={slug ?? defaultProject ?? ''} onChange={(e) => setSlug(e.target.value)}>
          {projects.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
        </select>
      )}
      <button type="submit" aria-label={askProject ? 'Create project' : 'Add'}>{askProject ? 'Create' : 'Add'}</button>
    </form>
  )
}
