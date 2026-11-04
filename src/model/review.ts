import type { FlowData, ISODate } from './types'
import { addDays } from './dates'
import { doneOn, focusMinutesOn } from './stats'

const INSTRUCTIONS =
  'You are my planning coach. Below is a record of my last 7 days and my active projects. ' +
  'Give me honest but kind feedback and a realistic plan, chosen from my open tasks. ' +
  'Keep the whole answer under 150 words, in exactly three short sections: ' +
  '"Went well" (1–2 bullets), "Got in the way" (1–2 bullets) and "Next 3 days" (one line per day, at most 3 tasks per day). ' +
  'No introduction, no closing remarks, no follow-up questions.'

const NOTES_LIMIT = 2000

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
  const notes = d.notes.body.trim()
  if (notes !== '') {
    out.push('## General notes', '', notes.length > NOTES_LIMIT ? notes.slice(0, NOTES_LIMIT) + '…' : notes, '')
  }
  return out.join('\n').trimEnd() + '\n'
}
