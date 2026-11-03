import { useState } from 'react'
import type { Project, ProjectStatus } from '../model/types'
import { PROJECT_COLORS } from '../model/ids'

interface Props {
  projects: Project[]
  hidden: Project[]          // paused, done or archived projects
  filter: string | null
  onFilter: (slug: string | null) => void
  onCreate: (title: string) => void
  onUpdate: (slug: string, patch: { title?: string; color?: string; status?: ProjectStatus }) => void
}

export default function ProjectBar({ projects, hidden, filter, onFilter, onCreate, onUpdate }: Props) {
  const [menu, setMenu] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameText, setRenameText] = useState('')
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showHidden, setShowHidden] = useState(false)

  const closeMenu = () => { setMenu(null); setRenaming(false) }
  const setStatus = (slug: string, status: ProjectStatus) => {
    onUpdate(slug, { status })
    if (filter === slug) onFilter(null)
    closeMenu()
  }

  return (
    <div className="project-bar">
      <button className="chip" aria-pressed={filter === null} onClick={() => onFilter(null)}>All</button>
      {projects.map((p) => (
        <span key={p.slug} className="chip-wrap">
          <button
            className="chip"
            aria-pressed={filter === p.slug}
            style={{ borderColor: p.color }}
            onClick={() => onFilter(p.slug)}
            onContextMenu={(e) => { e.preventDefault(); setRenaming(false); setMenu(p.slug) }}
          >
            {p.title}
          </button>
          {menu === p.slug && (
            <div className="chip-menu" role="menu" aria-label={`${p.title} menu`}>
              {renaming ? (
                <form onSubmit={(e) => { e.preventDefault(); onUpdate(p.slug, { title: renameText }); closeMenu() }}>
                  <input autoFocus aria-label="New name" value={renameText} onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') closeMenu() }} />
                </form>
              ) : (
                <button role="menuitem" onClick={() => { setRenameText(p.title); setRenaming(true) }}>Rename</button>
              )}
              <div className="swatches" role="group" aria-label="Color">
                {PROJECT_COLORS.map((c) => (
                  <button key={c} className="swatch" aria-label={`Color ${c}`} style={{ background: c }}
                    onClick={() => { onUpdate(p.slug, { color: c }); closeMenu() }} />
                ))}
              </div>
              <button role="menuitem" onClick={() => setStatus(p.slug, 'paused')}>Pause</button>
              <button role="menuitem" onClick={() => setStatus(p.slug, 'done')}>Mark done</button>
              <button role="menuitem" onClick={() => setStatus(p.slug, 'archived')}>Archive</button>
              <button role="menuitem" onClick={closeMenu}>Close</button>
            </div>
          )}
        </span>
      ))}
      {adding ? (
        <form onSubmit={(e) => { e.preventDefault(); onCreate(newTitle); setNewTitle(''); setAdding(false) }}>
          <input autoFocus aria-label="Project name" placeholder="Project name" value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setNewTitle('') } }} />
        </form>
      ) : (
        <button className="chip add-project" onClick={() => setAdding(true)}>+ Project</button>
      )}
      {hidden.length > 0 && (
        <>
          <button className="chip hidden-chip" aria-expanded={showHidden} onClick={() => setShowHidden(!showHidden)}>
            Hidden ({hidden.length})
          </button>
          {showHidden && (
            <ul className="hidden-list" aria-label="Hidden projects">
              {hidden.map((p) => (
                <li key={p.slug}>
                  <span>{p.title}</span>
                  <button onClick={() => onUpdate(p.slug, { status: 'active' })}>Make active</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
