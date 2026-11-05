import { INBOX_PATH, dayPath, projectPath, type Change, type FlowData, type ISODate } from './types'
import { nextInboxId, nextTaskIdFor } from './ids'
import { addTask, deleteTask, findTask, moveTask } from './tasks'

const noChange = (d: FlowData): Change => ({ data: d, changed: [] })

export function addInboxItem(d: FlowData, text: string, today: ISODate): Change {
  const clean = text.trim()
  if (!clean) return noChange(d)
  const inbox = structuredClone(d.inbox)
  inbox.items.push({ id: nextInboxId(inbox.items), text: clean, created: today, extra: {} })
  return { data: { ...d, inbox }, changed: [INBOX_PATH] }
}

export function editInboxItem(d: FlowData, id: string, text: string): Change {
  const clean = text.trim()
  const item = d.inbox.items.find((i) => i.id === id)
  if (!item || !clean || item.text === clean) return noChange(d)
  const inbox = structuredClone(d.inbox)
  inbox.items.find((i) => i.id === id)!.text = clean
  return { data: { ...d, inbox }, changed: [INBOX_PATH] }
}

export function deleteInboxItem(d: FlowData, id: string): Change {
  if (!d.inbox.items.some((i) => i.id === id)) return noChange(d)
  const inbox = structuredClone(d.inbox)
  inbox.items = inbox.items.filter((i) => i.id !== id)
  return { data: { ...d, inbox }, changed: [INBOX_PATH] }
}

/**
 * Turn a Parking lot item into a task in `slug`: in To do, in Today (planned today), or done
 * today (added, then completed in the same change). Never writes half a move: nothing changes
 * when inbox.md, the project file or (Today/Done) today's day file failed to parse.
 */
export function promoteInboxItem(
  d: FlowData, id: string, slug: string, to: 'todo' | 'today' | 'done', today: ISODate,
): Change {
  const item = d.inbox.items.find((i) => i.id === id)
  if (!item || !d.projects[slug]) return noChange(d)
  const writes = [INBOX_PATH, projectPath(slug), ...(to === 'todo' ? [] : [dayPath(today)])]
  if (writes.some((p) => d.skipped.includes(p))) return noChange(d)
  const ref = `${slug}/${nextTaskIdFor(d, slug)}`
  let added = addTask(d, slug, item.text, to === 'today' ? 'today' : 'todo', today)
  if (added.changed.length === 0) return noChange(d)
  if (to === 'done') added = moveTask(added.data, ref, 'done', today)
  if (added.changed.length === 0) return noChange(d)
  const inbox = structuredClone(d.inbox)
  inbox.items = inbox.items.filter((i) => i.id !== id)
  return { data: { ...added.data, inbox }, changed: writes }
}

/**
 * "Park" a task: it leaves its project and becomes a Parking lot item whose text is the title
 * plus any details on one line (`Title — first step: X; steps: a ✓, b; planned: YYYY-MM-DD`).
 * Any status; day files are untouched (their done/planned snapshots stay).
 */
export function parkTask(d: FlowData, ref: string, today: ISODate): Change & { itemId?: string } {
  const found = findTask(d, ref)
  // Never write half a move: if either file failed to parse, nothing changes.
  if (!found || d.skipped.includes(INBOX_PATH) || d.skipped.includes(projectPath(found.project.slug))) return noChange(d)
  const { task } = found
  const details: string[] = []
  if (task.firstStep) details.push(`first step: ${task.firstStep}`)
  if (task.steps && task.steps.length > 0) details.push(`steps: ${task.steps.map((s) => (s.done ? `${s.text} ✓` : s.text)).join(', ')}`)
  const planned = task.scheduled ?? task.planned
  if (planned) details.push(`planned: ${planned}`)
  const text = task.title + (details.length > 0 ? ` — ${details.join('; ')}` : '')
  const removed = deleteTask(d, ref)
  const itemId = nextInboxId(d.inbox.items)
  const added = addInboxItem(removed.data, text, today)
  // Unknown task fields travel with the item (preserved on write).
  const item = added.data.inbox.items.find((i) => i.id === itemId)
  if (item) item.extra = structuredClone(task.extra)
  return { data: added.data, changed: [projectPath(found.project.slug), INBOX_PATH], itemId }
}
