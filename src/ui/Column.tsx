import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { ColumnId } from '../model/board'

interface Props {
  id: ColumnId; title: string; keys: string[]; children: ReactNode; footer?: ReactNode
  /** Soft placeholder shown while the column has no cards. */
  empty?: string
}

export default function Column({ id, title, empty, keys, children, footer }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section className={`column column-${id}${isOver ? ' is-over' : ''}`} aria-label={title} ref={setNodeRef}>
      <header>
        <h2>{title}</h2>
        <span className="count" title={`${keys.length} ${keys.length === 1 ? 'card' : 'cards'}`}>{keys.length}</span>
      </header>
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <ul className="cards">
          {children}
          {keys.length === 0 && empty && <li className="empty">{empty}</li>}
        </ul>
      </SortableContext>
      {footer && <div className="column-foot">{footer}</div>}
    </section>
  )
}
