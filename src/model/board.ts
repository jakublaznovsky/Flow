import type { FlowData, ISODate, Step } from './types'

export type ColumnId = 'inbox' | 'todo' | 'today' | 'done'
export interface Card {
  key: string; kind: 'task' | 'inbox'; title: string; firstStep?: string; steps?: Step[]
  projectSlug?: string; projectTitle?: string; color?: string; created: ISODate
}
export type ColumnOrder = Partial<Record<ColumnId, string[]>>   // card keys

function sortCards(cards: Card[], order: string[] | undefined): Card[] {
  const byKey = new Map(cards.map((c) => [c.key, c]))
  const first: Card[] = []
  for (const key of order ?? []) {
    const c = byKey.get(key)
    if (c) { first.push(c); byKey.delete(key) }
  }
  const rest = [...byKey.values()].sort((a, b) =>
    a.created < b.created ? -1 : a.created > b.created ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  return [...first, ...rest]
}

export function boardColumns(
  d: FlowData, today: ISODate, filter: string | null, order: ColumnOrder,
): Record<ColumnId, Card[]> {
  const cols: Record<ColumnId, Card[]> = { inbox: [], todo: [], today: [], done: [] }
  for (const item of d.inbox.items) {
    cols.inbox.push({ key: `inbox/${item.id}`, kind: 'inbox', title: item.text, created: item.created })
  }
  for (const project of Object.values(d.projects)) {
    if (project.status !== 'active') continue
    if (filter !== null && project.slug !== filter) continue
    for (const t of project.tasks) {
      if (t.status === 'done' && t.done !== today) continue
      const card: Card = {
        key: `${project.slug}/${t.id}`, kind: 'task', title: t.title,
        projectSlug: project.slug, projectTitle: project.title, color: project.color, created: t.created,
      }
      if (t.firstStep !== undefined) card.firstStep = t.firstStep
      if (t.steps && t.steps.length > 0) card.steps = t.steps
      cols[t.status].push(card)
    }
  }
  for (const id of Object.keys(cols) as ColumnId[]) cols[id] = sortCards(cols[id], order[id])
  return cols
}

/** Cards whose title, first step or project title contains `query` (trimmed, case-insensitive). */
export function searchCards(cols: Record<ColumnId, Card[]>, query: string): Record<ColumnId, Card[]> {
  const q = query.trim().toLowerCase()
  if (!q) return cols
  const hit = (c: Card) => [c.title, c.firstStep, c.projectTitle].some((s) => s?.toLowerCase().includes(q))
  const out = { ...cols }
  for (const id of Object.keys(out) as ColumnId[]) out[id] = out[id].filter(hit)
  return out
}
