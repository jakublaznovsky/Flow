import { useEffect, useRef, useState } from 'react'
import type { Project, ProjectStatus } from '../model/types'
import { PROJECT_COLORS } from '../model/ids'

export type View = 'board' | 'progress'
type Patch = { title?: string; color?: string; status?: ProjectStatus }

interface Props {
  view: View
  onView: (v: View) => void
  projects: Project[]
  hidden: Project[]          // paused, done or archived projects
  progress: Record<string, { done: number; total: number }>
  filter: string | null
  onFilter: (slug: string | null) => void
  onCreate: (title: string) => void
  onUpdate: (slug: string, patch: Patch) => void
}

const STATUS_LABEL: Record<ProjectStatus, string> = { active: 'Active', paused: 'Paused', done: 'Done', archived: 'Archived' }

function BoardIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.75" y="2.25" width="3.5" height="11.5" rx="1" />
      <rect x="6.25" y="2.25" width="3.5" height="8" rx="1" />
      <rect x="10.75" y="2.25" width="3.5" height="5.5" rx="1" />
    </svg>
  )
}
function ProgressIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 13.5h12" />
      <path d="M4 11V8M8 11V4.5M12 11V6.5" />
    </svg>
  )
}

function ProjectMenu({ project, onUpdate, onStatus, onClose }: {
  project: Project; onUpdate: (patch: Patch) => void; onStatus: (s: ProjectStatus) => void; onClose: (refocus: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [renaming, setRenaming] = useState(false)
  const [text, setText] = useState(project.title)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const onClose = (refocus: boolean) => closeRef.current(refocus)
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(true) } }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t)) return
      // The row's own ⋯ button toggles the menu itself.
      if ((t as Element).closest?.(`[data-menu-for="${project.slug}"]`)) return
      onClose(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [project.slug])

  return (
    <div className="menu" role="menu" aria-label={`${project.title} menu`} ref={ref}>
      {renaming ? (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onUpdate({ title: text.trim() }); onClose(true) }}>
          <input autoFocus aria-label="New name" value={text} onChange={(e) => setText(e.target.value)} />
        </form>
      ) : (
        <button role="menuitem" onClick={() => setRenaming(true)}>Rename</button>
      )}
      <div className="swatches" role="group" aria-label="Color">
        {PROJECT_COLORS.map((c) => (
          <button key={c} className="swatch" aria-label={`Color ${c}`} aria-pressed={c === project.color} style={{ background: c }}
            onClick={() => { onUpdate({ color: c }); onClose(true) }} />
        ))}
      </div>
      <div className="menu-sep" />
      <button role="menuitem" onClick={() => onStatus('paused')}>Pause</button>
      <button role="menuitem" onClick={() => onStatus('done')}>Mark done</button>
      <button role="menuitem" onClick={() => onStatus('archived')}>Archive</button>
    </div>
  )
}

export default function Sidebar({ view, onView, projects, hidden, progress, filter, onFilter, onCreate, onUpdate }: Props) {
  const [menu, setMenu] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const menuButtons = useRef(new Map<string, HTMLButtonElement>())

  const closeMenu = (refocus: boolean) => {
    if (refocus && menu) menuButtons.current.get(menu)?.focus()
    setMenu(null)
  }
  const setStatus = (slug: string, status: ProjectStatus) => {
    onUpdate(slug, { status })
    if (filter === slug) onFilter(null)
    setMenu(null)
  }
  const stopAdding = () => { setAdding(false); setNewTitle('') }

  return (
    <nav className="sidebar" aria-label="Sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">Flow</span>
      </div>

      <div className="nav-group">
        <button className="nav-item" aria-pressed={view === 'board'} onClick={() => onView('board')}>
          <BoardIcon /><span>Board</span><kbd aria-hidden="true">B</kbd>
        </button>
        <button className="nav-item" aria-pressed={view === 'progress'} onClick={() => onView('progress')}>
          <ProgressIcon /><span>Progress</span><kbd aria-hidden="true">P</kbd>
        </button>
      </div>

      <div className="section-label" id="projects-label">Projects</div>
      <div className="projects">
        <button className="nav-item all-projects" aria-pressed={filter === null} onClick={() => onFilter(null)}>
          <span className="dot dot-all" aria-hidden="true" /><span>All projects</span>
        </button>
        <ul className="project-list" aria-labelledby="projects-label">
          {projects.map((p) => {
            const pr = progress[p.slug] ?? { done: 0, total: 0 }
            const pct = pr.total > 0 ? Math.round((pr.done / pr.total) * 100) : 0
            return (
              <li key={p.slug} className={`project-row${menu === p.slug ? ' menu-open' : ''}`}>
                <button
                  className="project-btn"
                  aria-pressed={filter === p.slug}
                  onClick={() => onFilter(p.slug)}
                  onContextMenu={(e) => { e.preventDefault(); setMenu(p.slug) }}
                >
                  <span className="dot" aria-hidden="true" style={{ background: p.color }} />
                  <span className="project-title">{p.title}</span>
                </button>
                <div
                  className="progress"
                  role="progressbar"
                  aria-label={`${p.title} progress`}
                  aria-valuemin={0}
                  aria-valuemax={pr.total}
                  aria-valuenow={pr.done}
                  aria-valuetext={`${pr.done} of ${pr.total} done`}
                  title={`${pr.done} of ${pr.total} done`}
                >
                  <span style={{ width: `${pct}%`, background: p.color }} />
                </div>
                <button
                  className="more"
                  data-menu-for={p.slug}
                  aria-label={`Project menu for ${p.title}`}
                  aria-haspopup="menu"
                  aria-expanded={menu === p.slug}
                  ref={(el) => { if (el) menuButtons.current.set(p.slug, el); else menuButtons.current.delete(p.slug) }}
                  onClick={() => setMenu(menu === p.slug ? null : p.slug)}
                >
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
                    <circle cx="3.5" cy="8" r="1.25" /><circle cx="8" cy="8" r="1.25" /><circle cx="12.5" cy="8" r="1.25" />
                  </svg>
                </button>
                {menu === p.slug && (
                  <ProjectMenu
                    project={p}
                    onUpdate={(patch) => onUpdate(p.slug, patch)}
                    onStatus={(s) => setStatus(p.slug, s)}
                    onClose={closeMenu}
                  />
                )}
              </li>
            )
          })}
        </ul>

        {hidden.length > 0 && (
          <div className="hidden-group">
            <button className="nav-item subtle" aria-expanded={showHidden} onClick={() => setShowHidden(!showHidden)}>
              <svg className="chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4l4 4-4 4" />
              </svg>
              <span>Hidden ({hidden.length})</span>
            </button>
            {showHidden && (
              <ul className="hidden-list" aria-label="Hidden projects">
                {hidden.map((p) => (
                  <li key={p.slug}>
                    <span className="dot" aria-hidden="true" style={{ background: p.color }} />
                    <span className="project-title">{p.title}</span>
                    <span className="status">{STATUS_LABEL[p.status]}</span>
                    <button className="link-btn" onClick={() => onUpdate(p.slug, { status: 'active' })}>Make active</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {adding ? (
          <form className="new-project" onSubmit={(e) => { e.preventDefault(); if (newTitle.trim()) onCreate(newTitle.trim()); stopAdding() }}>
            <input autoFocus aria-label="Project name" placeholder="Project name" value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onBlur={() => { if (!newTitle.trim()) stopAdding() }}
              onKeyDown={(e) => { if (e.key === 'Escape') stopAdding() }} />
          </form>
        ) : (
          <button className="nav-item subtle" onClick={() => setAdding(true)}>+ New project</button>
        )}
      </div>

      <div className="sidebar-foot"><kbd>Ctrl+Shift+Space</kbd> · quick capture</div>
    </nav>
  )
}
