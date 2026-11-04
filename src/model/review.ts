import type { FlowData, ISODate } from './types'
import { addDays } from './dates'
import { doneOn, focusMinutesOn } from './stats'

const INSTRUCTIONS =
  'You are my planning coach. Below is a record of my last 7 days and my active projects. ' +
  'Give me honest but kind feedback: what went well, and what got in the way. ' +
  'Then suggest a realistic plan for the next 3 days, with at most 3 tasks per day, chosen from my open tasks.'

export function buildReviewPrompt(d: FlowData, today: ISODate): string {
  const out: string[] = [INSTRUCTIONS, '', '## Last 7 days', '']
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i)
    const done = doneOn(d, date)
    const minutes = focusMinutesOn(d, date)
    const note = d.days[date]?.body.trim() ?? ''
    out.push(`### ${date}`)
    if (done.length === 0 && minutes === 0 && note === '') {
      out.push('Nothing recorded.')
    } else {
      if (done.length > 0) {
        out.push('Done:')
        for (const e of done) {
          const title = d.projects[e.project]?.title ?? e.project
          out.push(`- ${e.title} (${title})`)
        }
      }
      if (minutes > 0) out.push(`Focus: ${minutes} min`)
      if (note !== '') out.push('Notes:', note)
    }
    out.push('')
  }
  out.push('## Active projects', '')
  for (const p of Object.values(d.projects)) {
    if (p.status !== 'active') continue
    out.push(`### ${p.title}`)
    if (p.goal) out.push(`Goal: ${p.goal}`)
    const open = p.tasks.filter((t) => t.status === 'todo' || t.status === 'today')
    if (open.length === 0) out.push('No open tasks.')
    else {
      out.push('Open tasks:')
      for (const t of open) out.push(`- [${t.status}] ${t.title}`)
    }
    out.push('')
  }
  return out.join('\n').trimEnd() + '\n'
}
