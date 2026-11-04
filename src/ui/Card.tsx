import { useState, type CSSProperties } from 'react'
import type { Step } from '../model/types'
import { useSortable } from '@dnd-kit/sortable'
import type { Card as CardData, ColumnId } from '../model/board'

interface Props {
  card: CardData
  column: ColumnId
  projects: { slug: string; title: string }[]
  onToggle: () => void
  onSave: (patch: { title: string; firstStep: string; project: string }) => void
  onDelete: () => void
  /** Today cards only: start a focus session on this task. */
  onFocus?: () => void
  inFocus?: boolean
  /** Task cards only: checklist edits. */
  steps?: {
    onAdd: (text: string) => void
    onToggle: (index: number) => void
    onEdit: (index: number, text: string) => void
    onDelete: (index: number) => void
  }
}

function Checklist({ steps, api }: { steps: Step[]; api: NonNullable<Props['steps']> }) {
  const [adding, setAdding] = useState('')
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const commitEdit = () => {
    if (editIdx !== null) api.onEdit(editIdx, editText)
    setEditIdx(null)
  }
  return (
    // Stop pointer-down here so the card's drag listeners never see clicks inside the checklist.
    <div className="checklist" onPointerDown={(e) => e.stopPropagation()}>
      {steps.length > 0 && (
        <ul role="list" className="steps">
          {steps.map((st, i) => (
            <li key={i} className={st.done ? 'is-ticked' : undefined}>
              <input type="checkbox" aria-label={editIdx === i ? `Done: ${st.text}` : st.text} checked={st.done} onChange={() => api.onToggle(i)} />
              {editIdx === i ? (
                <input
                  autoFocus className="step-edit" aria-label="Edit step" value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                    else if (e.key === 'Escape') { e.stopPropagation(); setEditIdx(null) }
                  }}
                  onBlur={commitEdit}
                />
              ) : (
                <button type="button" className="step-text" onClick={() => { setEditText(st.text); setEditIdx(i) }}>{st.text}</button>
              )}
              <button type="button" className="step-del" aria-label={`Delete step ${st.text}`} onClick={() => api.onDelete(i)}>×</button>
            </li>
          ))}
        </ul>
      )}
      <input
        className="step-add" aria-label="Add step" placeholder="Add step" value={adding}
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          if (adding.trim()) { api.onAdd(adding); setAdding('') }
        }}
      />
    </div>
  )
}

export default function Card({ card, column, projects, onToggle, onSave, onDelete, onFocus, inFocus, steps }: Props) {
  const [editing, setEditing] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  const list = card.steps ?? []
  const doneCount = list.filter((x) => x.done).length
  const next = list.find((x) => !x.done)?.text
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: card.key, data: { column }, disabled: editing,
  })
  const stripe = { '--project': card.color ?? 'var(--border-strong)' } as CSSProperties
  const dragStyle = { ...stripe, transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition, opacity: isDragging ? 0.5 : undefined }
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
      <li className="card editing" ref={setNodeRef} style={dragStyle}>
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
            <button type="submit" className="primary">Save</button>
            <button type="button" className="danger" onClick={onDelete}>Delete</button>
          </div>
        </form>
      </li>
    )
  }
  return (
    <li
      className={`card${column === 'done' ? ' is-done' : ''}${card.kind === 'inbox' ? ' is-inbox' : ''}${isDragging ? ' is-dragging' : ''}${inFocus ? ' in-focus' : ''}`}
      ref={setNodeRef}
      style={dragStyle}
      {...listeners}
    >
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
        {card.firstStep && <div className="step">{card.firstStep}</div>}
        {next && !showSteps && <div className="step next-step">Next: {next}</div>}
        {card.projectTitle && <span className="tag">{card.projectTitle}</span>}
        {(inFocus || (onFocus && column === 'today' && card.kind === 'task')) && (
          <div className="focus-row">
            {inFocus && <span className="focus-mark">in focus</span>}
            {onFocus && column === 'today' && card.kind === 'task' && (
              <button type="button" className="card-focus" aria-label={`Focus on ${card.title}`} onClick={onFocus}>Focus</button>
            )}
          </div>
        )}
      </div>
      {steps && (
        <div className="steps-ctl" onPointerDown={(e) => e.stopPropagation()}>
          {list.length > 0 && (
            <span className="steps-pill" aria-label={`${doneCount} of ${list.length} steps done`}>{doneCount}/{list.length}</span>
          )}
          <button
            type="button" className="steps-toggle" aria-expanded={showSteps}
            aria-label={showSteps ? 'Hide steps' : 'Show steps'} onClick={() => setShowSteps((v) => !v)}
          >
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5l3 3 3-3" /></svg>
          </button>
        </div>
      )}
      {steps && showSteps && <Checklist steps={list} api={steps} />}
    </li>
  )
}
