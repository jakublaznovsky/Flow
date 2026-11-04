import { taskCard, sortCards, type Card } from './board'
import { addDays, isoWeek } from './dates'
import { weekDates } from './stats'
import { reviewPath, type Change, type FlowData, type ISODate, type Review } from './types'

/** Tasks still open this week: everything in Today plus To do tasks planned Mon-Sun, active projects only. */
export function unfinishedThisWeek(d: FlowData, today: ISODate): Card[] {
  const [first, last] = [weekDates(today)[0], weekDates(today)[6]]
  const cards: Card[] = []
  for (const project of Object.values(d.projects)) {
    if (project.status !== 'active') continue
    for (const t of project.tasks) {
      const inToday = t.status === 'today'
      const planned = t.status === 'todo' && t.scheduled !== undefined && t.scheduled >= first && t.scheduled <= last
      if (inToday || planned) cards.push(taskCard(project, t))
    }
  }
  return sortCards(cards, undefined)
}

export interface ReviewPatch { focusProject?: string | null; intention?: string; body?: string }

/** Create or update the review of an ISO week. Empty/null focus project and empty intention drop their keys. */
export function saveReview(d: FlowData, week: string, patch: ReviewPatch): Change {
  const existing = d.reviews[week]
  const next: Review = existing ? { ...existing } : { week, body: '', extra: {} }
  if (patch.focusProject !== undefined) {
    if (patch.focusProject === null || patch.focusProject === '') delete next.focusProject
    else next.focusProject = patch.focusProject
  }
  if (patch.intention !== undefined) {
    if (patch.intention === '') delete next.intention
    else next.intention = patch.intention
  }
  if (patch.body !== undefined) next.body = patch.body
  const same = existing
    ? existing.focusProject === next.focusProject && existing.intention === next.intention && existing.body === next.body
    : next.focusProject === undefined && next.intention === undefined && next.body === ''
  if (same) return { data: d, changed: [] }
  return { data: { ...d, reviews: { ...d.reviews, [week]: next } }, changed: [reviewPath(week)] }
}

/**
 * The focus project to star this week: the one chosen in last week's review ("next week's focus"),
 * else the one in this week's review (a review done early in the week). Only if the project exists.
 */
export function focusProjectThisWeek(d: FlowData, today: ISODate): string | undefined {
  for (const week of [isoWeek(addDays(today, -7)), isoWeek(today)]) {
    const slug = d.reviews[week]?.focusProject
    if (slug !== undefined && d.projects[slug]) return slug
  }
  return undefined
}
