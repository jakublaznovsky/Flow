import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { ColumnId } from '../model/board'

interface Props {
  id: ColumnId; title: string; hint?: string; keys: string[]; children: ReactNode; footer?: ReactNode
}

export default function Column({ id, title, hint, keys, children, footer }: Props) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <section className="column" aria-label={title}>
      <header>
        <h2>{title}</h2>
        {hint && <span className="hint">{hint}</span>}
      </header>
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <ul className="cards" ref={setNodeRef}>{children}</ul>
      </SortableContext>
      {footer}
    </section>
  )
}
