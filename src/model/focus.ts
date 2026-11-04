import { dayPath, type Change, type Day, type FlowData, type ISODate } from './types'

export function logFocus(d: FlowData, ref: string, minutes: number, today: ISODate): Change {
  const whole = Math.floor(minutes)
  if (!(whole >= 1)) return { data: d, changed: [] }
  const [slug, id] = ref.split('/')
  const project = d.projects[slug]
  const task = project?.tasks.find((t) => t.id === id)
  if (!project || !task) return { data: d, changed: [] }
  const day: Day = d.days[today]
    ? structuredClone(d.days[today])
    : { date: today, planned: [], done: [], focus: [], body: '', extra: {} }
  day.focus.push({ ref, title: task.title, project: project.title, minutes: whole, extra: {} })
  return { data: { ...d, days: { ...d.days, [today]: day } }, changed: [dayPath(today)] }
}
