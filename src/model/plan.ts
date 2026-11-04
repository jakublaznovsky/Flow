import { addDays } from './dates'
import { nextTaskIdFor } from './ids'
import { scheduleTask } from './schedule'
import { addTask, editTask, findTask } from './tasks'
import type { Change, FlowData, ISODate } from './types'

/** A task suggested for tomorrow; no `ref` (or an unknown/done one) means a new task. */
export interface Suggestion { ref?: string; title: string; project: string; first_step: string }

const merge = (a: string[], b: string[]) => [...new Set([...a, ...b])]

/**
 * Plan suggestions for tomorrow, as one Change. An existing open task is scheduled for tomorrow
 * (a Today task goes back to To do with the date). Anything else becomes a new To do task with its
 * first step, in the active project whose title matches (case-insensitive), else `preferred`
 * (if active), else the first active project; it is scheduled for tomorrow too.
 */
export function planSuggestions(d: FlowData, list: Suggestion[], today: ISODate, preferred?: string): Change {
  const tomorrow = addDays(today, 1)
  let data = d
  let changed: string[] = []
  const step = (c: Change) => { data = c.data; changed = merge(changed, c.changed) }
  for (const s of list) {
    const found = s.ref ? findTask(data, s.ref) : undefined
    if (s.ref && found && found.task.status !== 'done') {
      step(scheduleTask(data, s.ref, tomorrow, today))
      continue
    }
    const active = Object.values(data.projects).filter((p) => p.status === 'active')
    if (active.length === 0) continue
    const wanted = s.project.trim().toLowerCase()
    const slug = active.find((p) => p.title.trim().toLowerCase() === wanted)?.slug
      ?? (preferred && data.projects[preferred]?.status === 'active' ? preferred : active[0].slug)
    const ref = `${slug}/${nextTaskIdFor(data, slug)}`
    const added = addTask(data, slug, s.title, 'todo', today)
    if (added.changed.length === 0) continue
    step(added)
    step(editTask(data, ref, { firstStep: s.first_step }, today))
    step(scheduleTask(data, ref, tomorrow, today))
  }
  return { data, changed }
}
