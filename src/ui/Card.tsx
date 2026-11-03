import { useState } from 'react'
import type { Card as CardData, ColumnId } from '../model/board'

interface Props {
  card: CardData
  column: ColumnId
  projects: { slug: string; title: string }[]
  onToggle: () => void
  onSave: (patch: { title: string; firstStep: string; project: string }) => void
  onDelete: () => void
}

export default function Card({ card, column, projects, onToggle, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(card.title)
  const [step, setStep] = useState(card.firstStep ?? '')
  const [project, setProject] = useState(card.projectSlug ?? '')

  const open = () => {
    setTitle(card.title); setStep(card.firstStep ?? ''); setProject(card.projectSlug ?? '')
    setEditing(true)
  }
  const save = () => { onSave({ title, firstStep: step, project }); setEditing(false) }

  if (editing) {
    return (
      <li className="card editing">
        <form
          onSubmit={(e) => { e.preventDefault(); save() }}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
        >
          <input autoFocus aria-label={card.kind === 'inbox' ? 'Text' : 'Title'} value={title} onChange={(e) => setTitle(e.target.value)} />
          {card.kind === 'task' && (
            <>
              <input aria-label="First step" placeholder="First step" value={step} onChange={(e) => setStep(e.target.value)} />
              <select aria-label="Project" value={project} onChange={(e) => setProject(e.target.value)}>
                {projects.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
              </select>
            </>
          )}
          <div className="row">
            <button type="submit">Save</button>
            <button type="button" className="danger" onClick={onDelete}>Delete</button>
          </div>
        </form>
      </li>
    )
  }
  return (
    <li className={`card${column === 'done' ? ' is-done' : ''}`}>
      {card.kind === 'task' && (
        <input
          type="checkbox"
          aria-label={`Done: ${card.title}`}
          checked={column === 'done'}
          onChange={onToggle}
        />
      )}
      <div className="card-body">
        <button className="card-title" onClick={open}>{card.title}</button>
        {card.projectTitle && (
          <span className="tag" style={{ background: card.color }}>{card.projectTitle}</span>
        )}
        {card.firstStep && <div className="step">{card.firstStep}</div>}
      </div>
    </li>
  )
}
