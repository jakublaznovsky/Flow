import { INBOX_PATH, dayPath, projectPath, type Change, type FlowData, type ISODate } from './types'
import { nextInboxId } from './ids'
import { addTask } from './tasks'

const noChange = (d: FlowData): Change => ({ data: d, changed: [] })

export function addInboxItem(d: FlowData, text: string, today: ISODate): Change {
  const clean = text.trim()
  if (!clean) return noChange(d)
  const inbox = structuredClone(d.inbox)
  inbox.items.push({ id: nextInboxId(inbox.items), text: clean, created: today, extra: {} })
  return { data: { ...d, inbox }, changed: [INBOX_PATH] }
}

export function deleteInboxItem(d: FlowData, id: string): Change {
  if (!d.inbox.items.some((i) => i.id === id)) return noChange(d)
  const inbox = structuredClone(d.inbox)
  inbox.items = inbox.items.filter((i) => i.id !== id)
  return { data: { ...d, inbox }, changed: [INBOX_PATH] }
}

export function promoteInboxItem(
  d: FlowData, id: string, slug: string, to: 'todo' | 'today', today: ISODate,
): Change {
  const item = d.inbox.items.find((i) => i.id === id)
  if (!item || !d.projects[slug]) return noChange(d)
  const added = addTask(d, slug, item.text, to, today)
  if (added.changed.length === 0) return noChange(d)
  const inbox = structuredClone(d.inbox)
  inbox.items = inbox.items.filter((i) => i.id !== id)
  const changed = [INBOX_PATH, projectPath(slug)]
  if (to === 'today') changed.push(dayPath(today))
  return { data: { ...added.data, inbox }, changed }
}
