import { addDays, isoWeek } from '../model/dates'
import { focusProjectThisWeek } from '../model/review-week'
import { doneOn } from '../model/stats'
import type { FlowData, ISODate, Review } from '../model/types'

export { buildReviewPrompt } from '../model/review'

const instruction = (tomorrow: ISODate) =>
  `You are my planning coach. I have ADHD, so be warm, practical and keep it small. ` +
  `Help me plan tomorrow (${tomorrow}): suggest at most 3 tasks. Prefer my existing open tasks and use their ref exactly as written; ` +
  `only suggest a new task when something clearly matters and is missing, and give it an empty ref. ` +
  `For each task give a tiny, concrete first step I can start in under 5 minutes, and the title of one of my active projects. ` +
  `The summary is one or two kind sentences about the day.`

/** The review that set this week's focus (last week's, else this week's), or the newest with an intention. */
function focusReview(d: FlowData, today: ISODate, slug: string | undefined): Review | undefined {
  const reviews = [isoWeek(addDays(today, -7)), isoWeek(today)].map((w) => d.reviews[w]).filter((r): r is Review => !!r)
  if (slug !== undefined) return reviews.find((r) => r.focusProject === slug)
  return reviews.find((r) => r.intention)
}

/** Prompt for "Plan tomorrow": recent days, open and scheduled tasks, this week's focus, active projects. */
export function buildPlanPrompt(d: FlowData, today: ISODate): string {
  const tomorrow = addDays(today, 1)
  const active = Object.values(d.projects).filter((p) => p.status === 'active')
  const projectTitle = (slug: string) => d.projects[slug]?.title ?? slug
  const out: string[] = [instruction(tomorrow), '', '## Last 3 days', '']

  for (let i = 2; i >= 0; i--) {
    const date = addDays(today, -i)
    const done = doneOn(d, date)
    out.push(`### ${date}`)
    if (done.length === 0) out.push('Nothing done.')
    for (const e of done) out.push(`- ${e.title} (${projectTitle(e.project)})`)
    out.push('')
  }

  const open: string[] = []
  const scheduled: { date: ISODate; line: string }[] = []
  const last = addDays(today, 7)
  for (const p of active) {
    for (const t of p.tasks) {
      if (t.status === 'done') continue
      const item = `${p.slug}/${t.id} — ${t.title} (project: ${p.title})`
      open.push(`- [${t.status}] ${item}`)
      if (t.status === 'todo' && t.scheduled !== undefined && t.scheduled > today && t.scheduled <= last) {
        scheduled.push({ date: t.scheduled, line: `- ${t.scheduled}: ${item}` })
      }
    }
  }
  scheduled.sort((a, b) => a.date.localeCompare(b.date))
  out.push('## Open tasks', '', ...(open.length ? open : ['None.']), '')
  out.push('## Scheduled in the next 7 days', '', ...(scheduled.length ? scheduled.map((s) => s.line) : ['None.']), '')

  const slug = focusProjectThisWeek(d, today)
  const review = focusReview(d, today, slug)
  const focus: string[] = []
  if (slug !== undefined) focus.push(`Project: ${projectTitle(slug)}`)
  if (review?.intention) focus.push(`Intention: ${review.intention}`)
  out.push("## This week's focus", '', ...(focus.length ? focus : ['None chosen.']), '')

  out.push('## Active projects', '', ...(active.length ? active.map((p) => `- ${p.title}`) : ['None.']))
  return out.join('\n').trimEnd() + '\n'
}
