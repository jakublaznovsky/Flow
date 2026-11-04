import { useRef, useState } from 'react'
import type { Project } from '../model/types'

interface Props {
  project: Project
  done: number
  total: number
  doneThisWeek: number
  notesOpen: boolean
  onToggleNotes: () => void
  onGoal: (goal: string) => void
}

function Goal({ goal, onSave }: { goal: string; onSave: (g: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(goal)
  const cancelled = useRef(false)
  const finish = () => {
    if (cancelled.current) { cancelled.current = false } else if (text.trim() !== goal) onSave(text.trim())
    setEditing(false)
  }
  if (editing) {
    return (
      <input
        autoFocus
        className="goal-input"
        aria-label="Goal"
        placeholder="What is this project for?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
          else if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; e.currentTarget.blur() }
        }}
      />
    )
  }
  return (
    <button className={`goal${goal ? '' : ' is-empty'}`} onClick={() => { setText(goal); setEditing(true) }}>
      {goal || 'Add a goal'}
    </button>
  )
}

export default function ProjectHeader({ project, done, total, doneThisWeek, notesOpen, onToggleNotes, onGoal }: Props) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="project-header">
      <div className="project-head-main">
        <h1 className="project-name"><span className="dot" aria-hidden="true" style={{ background: project.color }} />{project.title}</h1>
        <Goal key={project.slug} goal={project.goal ?? ''} onSave={onGoal} />
      </div>
      <div className="project-stats">
        <div className="project-progress">
          <div className="bar" role="progressbar" aria-label="Project progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <span style={{ width: `${pct}%`, background: project.color }} />
          </div>
          <span>{done} of {total} done</span>
        </div>
        <span className="muted">Done this week: {doneThisWeek}</span>
        <button className="notes-btn" aria-expanded={notesOpen} onClick={onToggleNotes}>Notes</button>
      </div>
    </div>
  )
}
