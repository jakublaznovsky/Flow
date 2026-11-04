import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'

interface Props {
  keys: string[]
  open: boolean
  onToggle: () => void
  children: ReactNode
}

/**
 * Done as a bar under the board: "Done today (N)" with a toggle; when open, today's done cards in
 * one horizontally scrolling row. Open or closed, the whole bar is the `done` drop target.
 */
export default function DoneBar({ keys, open, onToggle, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'done' })
  return (
    <section
      ref={setNodeRef} aria-label="Done"
      className={`done-bar${open ? ' is-open' : ''}${isOver ? ' is-over' : ''}`}
    >
      <h2 className="done-bar-head">
        <button type="button" className="done-bar-toggle" aria-expanded={open} aria-controls={open ? 'done-bar-cards' : undefined} onClick={onToggle}>
          <svg className="done-bar-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 3l3 3-3 3" /></svg>
          Done today <span className="done-bar-count">({keys.length})</span>
        </button>
      </h2>
      {open && (
        <SortableContext items={keys} strategy={horizontalListSortingStrategy}>
          <ul id="done-bar-cards" className="done-cards">
            {children}
            {keys.length === 0 && <li className="done-empty">Tick a card or drop it here when it's done</li>}
          </ul>
        </SortableContext>
      )}
    </section>
  )
}
