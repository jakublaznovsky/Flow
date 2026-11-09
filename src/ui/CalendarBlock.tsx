import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { minutesToY, type TimeBlock } from '../model/timeblock'
import type { ISODate } from '../model/types'
import { blockLabel } from './calendarDrop'

/** Height of one hour in the Week grid, in px (set as `--hour-px` on .week-cal, used by board.css). */
export const HOUR_PX = 48

/** A block in the Week grid: a timed project task or a week-only item. */
export interface BlockData {
  kind: 'task' | 'item'
  /** Task ref (`slug/t1`) or item id (`c1`). */
  id: string
  title: string
  color?: string
  date: ISODate
  block: TimeBlock
}

export type Edge = 'top' | 'bottom'

/** Position of a block in its day column: top/height from its time, left/width from its lane. */
export function blockStyle(b: TimeBlock, lane = 0, lanes = 1): CSSProperties {
  return {
    top: `${minutesToY(b.start, HOUR_PX)}px`,
    height: `${minutesToY(b.end, HOUR_PX) - minutesToY(b.start, HOUR_PX)}px`,
    left: `${(lane / lanes) * 100}%`,
    width: `${100 / lanes}%`,
  }
}

/** Inline title input (new item or rename): Enter saves, Escape cancels, leaving saves. */
export function TitleInput({ label, initial = '', onDone }: { label: string; initial?: string; onDone: (title: string | null, byKey: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  const finish = (v: string | null, byKey: boolean) => {
    if (done.current) return
    done.current = true
    onDone(v, byKey)
  }
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref} className="cal-block-input" aria-label={label} defaultValue={initial}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); finish(e.currentTarget.value, true) }
        else if (e.key === 'Escape') { e.preventDefault(); finish(null, true) }
      }}
      onBlur={(e) => finish(e.currentTarget.value, false)}
    />
  )
}

interface Props {
  data: BlockData
  lane: number
  lanes: number
  /** The original while it is being dragged (shown faded). */
  placeholder?: boolean
  editing?: boolean
  onPointerDown: (e: PointerEvent<HTMLElement>, data: BlockData, edge?: Edge) => void
  onKeyDown: (e: KeyboardEvent<HTMLElement>, data: BlockData) => void
  onRename: (data: BlockData) => void
  onRenamed: (data: BlockData, title: string | null, byKey: boolean) => void
  onDelete: (data: BlockData) => void
}

/**
 * One block: the title only (times exist only in its aria-label). Its body moves it, its ~6px top
 * and bottom edges resize it. A week-only item also renames on double-click and has a × button.
 */
export default function CalendarBlock({ data, lane, lanes, placeholder, editing, onPointerDown, onKeyDown, onRename, onRenamed, onDelete }: Props) {
  const item = data.kind === 'item'
  const style = { ...blockStyle(data.block, lane, lanes), '--project': data.color ?? 'var(--border-strong)' } as CSSProperties
  const short = data.block.end - data.block.start <= 30
  return (
    <div
      className={`cal-block ${item ? 'is-item' : 'is-task'}${short ? ' is-short' : ''}${placeholder ? ' is-placeholder' : ''}${editing ? ' is-editing' : ''}`}
      style={style} data-block-id={data.id}
    >
      {editing ? (
        <TitleInput label={`Rename ${data.title}`} initial={data.title} onDone={(t, byKey) => onRenamed(data, t, byKey)} />
      ) : (
        <div
          role="button" tabIndex={0} className="cal-block-body" aria-label={blockLabel(data.title, data.date, data.block)}
          onPointerDown={(e) => onPointerDown(e, data)}
          onDoubleClick={item ? () => onRename(data) : undefined}
          onKeyDown={(e) => onKeyDown(e, data)}
        >
          <span className="cal-block-title">{data.title}</span>
        </div>
      )}
      {!editing && <div className="cal-block-edge is-top" aria-hidden="true" onPointerDown={(e) => onPointerDown(e, data, 'top')} />}
      {!editing && <div className="cal-block-edge is-bottom" aria-hidden="true" onPointerDown={(e) => onPointerDown(e, data, 'bottom')} />}
      {item && !editing && (
        <button
          type="button" className="cal-block-delete" aria-label={`Delete ${data.title}`}
          onPointerDown={(e) => e.stopPropagation()} onClick={() => onDelete(data)}
        >
          <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l6 6M8 2l-6 6" /></svg>
        </button>
      )}
    </div>
  )
}

/** A block being dragged (or a task dragged in from a strip), where it would land. */
export function GhostBlock({ title, color, item, block }: { title: string; color?: string; item: boolean; block: TimeBlock }) {
  const style = { ...blockStyle(block), '--project': color ?? 'var(--border-strong)' } as CSSProperties
  return (
    <div className={`cal-block is-ghost ${item ? 'is-item' : 'is-task'}${block.end - block.start <= 30 ? ' is-short' : ''}`} style={style} aria-hidden="true">
      <div className="cal-block-body"><span className="cal-block-title">{title}</span></div>
    </div>
  )
}
