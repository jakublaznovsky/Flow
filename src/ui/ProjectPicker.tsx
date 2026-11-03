import { useEffect, useRef, useState } from 'react'

interface Props {
  projects: { slug: string; title: string }[]
  onChoose: (slug: string) => void
  onCancel: () => void
}

export default function ProjectPicker({ projects, onChoose, onCancel }: Props) {
  const [index, setIndex] = useState(0)
  const ref = useRef<HTMLUListElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, projects.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const p = projects[index]; if (p) onChoose(p.slug) }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  return (
    <ul
      ref={ref}
      className="project-picker"
      role="listbox"
      aria-label="Choose a project"
      tabIndex={0}
      aria-activedescendant={projects[index] ? `pp-${projects[index].slug}` : undefined}
      onKeyDown={onKeyDown}
    >
      {projects.map((p, i) => (
        <li
          key={p.slug}
          id={`pp-${p.slug}`}
          role="option"
          aria-selected={i === index}
          className={i === index ? 'active' : undefined}
          onMouseEnter={() => setIndex(i)}
          onClick={() => onChoose(p.slug)}
        >
          {p.title}
        </li>
      ))}
    </ul>
  )
}
