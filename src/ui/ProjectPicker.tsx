import { useEffect, useRef, useState } from 'react'

interface Props {
  projects: { slug: string; title: string }[]
  onChoose: (slug: string) => void
  /** Create a project with this (non-blank) name and use it for the pending promotion. */
  onCreate: (title: string) => void
  onCancel: () => void
}

const NEW_ID = 'pp-new-project'

/**
 * Listbox of active projects, ending with "+ New project": choosing that swaps its row for a name
 * input (Enter creates, Escape goes back to the list). Escape in the list cancels.
 */
export default function ProjectPicker({ projects, onChoose, onCreate, onCancel }: Props) {
  const [index, setIndex] = useState(0)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const ref = useRef<HTMLUListElement>(null)
  const count = projects.length + 1 // the projects, then "+ New project"
  const newIndex = projects.length
  useEffect(() => { ref.current?.focus() }, [])

  const pick = (i: number) => {
    const p = projects[i]
    if (p) onChoose(p.slug)
    else if (i === newIndex) { setIndex(newIndex); setNaming(true) }
  }
  const backToList = () => {
    setNaming(false)
    setName('')
    setIndex(newIndex)
    ref.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, count - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(index) }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }
  const onNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (name.trim()) onCreate(name.trim())
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      backToList()
    }
  }

  const activeId = naming ? undefined : projects[index] ? `pp-${projects[index].slug}` : index === newIndex ? NEW_ID : undefined
  return (
    <div className="project-picker">
      <ul
        ref={ref}
        className="project-picker-list"
        role="listbox"
        aria-label="Choose a project"
        tabIndex={0}
        aria-activedescendant={activeId}
        onKeyDown={onKeyDown}
      >
        {projects.map((p, i) => (
          <li
            key={p.slug}
            id={`pp-${p.slug}`}
            role="option"
            aria-selected={!naming && i === index}
            className={!naming && i === index ? 'active' : undefined}
            onMouseEnter={() => { if (!naming) setIndex(i) }}
            onClick={() => onChoose(p.slug)}
          >
            {p.title}
          </li>
        ))}
        {!naming && (
          <li
            id={NEW_ID}
            role="option"
            aria-selected={index === newIndex}
            className={`project-picker-add${index === newIndex ? ' active' : ''}`}
            onMouseEnter={() => setIndex(newIndex)}
            onClick={() => pick(newIndex)}
          >
            + New project
          </li>
        )}
      </ul>
      {/* Outside the listbox (which may only own options), in place of the "+ New project" row. */}
      {naming && (
        <div className="project-picker-new">
          <input
            type="text"
            aria-label="New project name"
            placeholder="New project name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onNameKeyDown}
          />
        </div>
      )}
    </div>
  )
}
