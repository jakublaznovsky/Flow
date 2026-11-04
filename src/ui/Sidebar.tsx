import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Project, ProjectStatus } from '../model/types'
import { PROJECT_COLORS } from '../model/ids'

export type View = 'board' | 'week' | 'progress' | 'notes' | 'review' | 'settings'
type Patch = { title?: string; color?: string; status?: ProjectStatus }

interface Props {
  view: View
  onView: (v: View) => void
  projects: Project[]
  hidden: Project[]          // paused, done or archived projects
  progress: Record<string, { done: number; total: number }>
  filter: string | null
  /** Project named as this week's focus by the weekly review. */
  focusSlug?: string
  onFilter: (slug: string | null) => void
  onCreate: (title: string) => void
  onUpdate: (slug: string, patch: Patch) => void
  /** Delete a project (after the user approved it in the dialog). */
  onDelete: (slug: string) => void
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
function WeekIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5.25 1.75v2.5M10.75 1.75v2.5" />
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

function NotesIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 1.75h6.25L12.5 4.5v9.75h-9z" />
      <path d="M5.5 7.5h5M5.5 10.25h5" />
    </svg>
  )
}

function ReviewIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.25" width="11" height="11.5" rx="1.5" />
      <path d="M5.25 8.25l1.9 1.9 3.6-3.9" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.25" />
      <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.06 1.06M11.34 11.34l1.06 1.06M3.6 12.4l1.06-1.06M11.34 4.66l1.06-1.06" />
    </svg>
  )
}

/**
 * "Delete project?" — the one confirmation dialog in Flow (owner's exception to the no-pop-ups
 * rule, for this destructive action only). Focus starts on Cancel and stays inside; Escape and a
 * backdrop click cancel.
 */
function DeleteDialog({ project, onConfirm, onCancel }: { project: Project; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { cancelRef.current?.focus() }, [])
  const n = project.tasks.length
  const onKeyDown = (e: ReactKeyboardEvent) => {
    // Keep keys (Escape, app shortcuts) inside the dialog.
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return }
    if (e.key !== 'Tab') return
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('button') ?? [])]
    if (items.length === 0) return
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1)
    e.preventDefault()
    items[next].focus()
  }
  return createPortal(
    <div className="modal-backdrop" data-testid="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div
        ref={ref} className="modal" role="alertdialog" aria-modal="true"
        aria-labelledby="delete-project-title" aria-describedby="delete-project-text" onKeyDown={onKeyDown}
      >
        <h2 id="delete-project-title">Delete project?</h2>
        <p id="delete-project-text">
          Delete “{project.title}” and its {n} {n === 1 ? 'task' : 'tasks'}? Its file moves to the deleted folder
          inside your Flow folder, so it can be restored.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn" ref={cancelRef} onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ProjectMenu({ project, onUpdate, onStatus, onDelete, onClose }: {
  project: Project; onUpdate: (patch: Patch) => void; onStatus: (s: ProjectStatus) => void; onDelete: () => void
  onClose: (refocus: boolean) => void
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
      <div className="menu-sep" />
      <button role="menuitem" className="menu-danger" onClick={onDelete}>Delete…</button>
    </div>
  )
}

export default function Sidebar({ view, onView, projects, hidden, progress, filter, focusSlug, onFilter, onCreate, onUpdate, onDelete }: Props) {
  const [menu, setMenu] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const menuButtons = useRef(new Map<string, HTMLButtonElement>())
  const hiddenDeleteButtons = useRef(new Map<string, HTMLButtonElement>())
  const allButton = useRef<HTMLButtonElement>(null)
  const [deleting, setDeleting] = useState<Project | null>(null)

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
  const askDelete = (p: Project) => { setMenu(null); setDeleting(p) }
  const cancelDelete = () => {
    if (deleting) (menuButtons.current.get(deleting.slug) ?? hiddenDeleteButtons.current.get(deleting.slug))?.focus()
    setDeleting(null)
  }
  const confirmDelete = () => {
    if (!deleting) return
    onDelete(deleting.slug)
    setDeleting(null)
    allButton.current?.focus()
  }

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
        <button className="nav-item" aria-pressed={view === 'week'} onClick={() => onView('week')}>
          <WeekIcon /><span>Week</span><kbd aria-hidden="true">W</kbd>
        </button>
        <button className="nav-item" aria-pressed={view === 'progress'} onClick={() => onView('progress')}>
          <ProgressIcon /><span>Progress</span><kbd aria-hidden="true">P</kbd>
        </button>
        <button className="nav-item" aria-pressed={view === 'notes'} onClick={() => onView('notes')}>
          <NotesIcon /><span>Notes</span><kbd aria-hidden="true">O</kbd>
        </button>
        <button className="nav-item" aria-pressed={view === 'review'} onClick={() => onView('review')}>
          <ReviewIcon /><span>Weekly review</span><kbd aria-hidden="true">R</kbd>
        </button>
      </div>

      <div className="section-label" id="projects-label">Projects</div>
      <div className="projects">
        <button ref={allButton} className="nav-item all-projects" aria-pressed={filter === null} onClick={() => onFilter(null)}>
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
                  {focusSlug === p.slug && <span className="focus-star" role="img" aria-label="This week's focus">★</span>}
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
                    onDelete={() => askDelete(p)}
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
                    <button
                      className="link-btn link-danger" aria-label={`Delete ${p.title}…`} onClick={() => askDelete(p)}
                      ref={(el) => { if (el) hiddenDeleteButtons.current.set(p.slug, el); else hiddenDeleteButtons.current.delete(p.slug) }}
                    >Delete…</button>
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

      {deleting && <DeleteDialog project={deleting} onConfirm={confirmDelete} onCancel={cancelDelete} />}

      <div className="sidebar-foot">
        <button className="nav-item" aria-label="Settings" aria-pressed={view === 'settings'} onClick={() => onView('settings')}>
          <GearIcon /><span>Settings</span>
        </button>
        <div className="sidebar-hint"><kbd>Ctrl+Shift+Space</kbd> · quick capture</div>
      </div>
    </nav>
  )
}
