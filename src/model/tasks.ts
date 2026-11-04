import {
  dayPath, projectPath, type Change, type Day, type FlowData, type ISODate, type Project, type Task, type TaskStatus,
} from './types'
import { nextTaskIdFor } from './ids'

const noChange = (d: FlowData): Change => ({ data: d, changed: [] })

function splitRef(ref: string): [string, string] | undefined {
  const i = ref.indexOf('/')
  return i > 0 ? [ref.slice(0, i), ref.slice(i + 1)] : undefined
}

export function findTask(d: FlowData, ref: string): { project: Project; task: Task } | undefined {
  const parts = splitRef(ref)
  if (!parts) return undefined
  const project = d.projects[parts[0]]
  const task = project?.tasks.find((t) => t.id === parts[1])
  return project && task ? { project, task } : undefined
}

/** Copy of d with `project` replaced and the given days (already cloned) merged in. */
function withParts(d: FlowData, project: Project | undefined, days: Record<ISODate, Day>): FlowData {
  return {
    ...d,
    projects: project ? { ...d.projects, [project.slug]: project } : d.projects,
    days: { ...d.days, ...days },
  }
}

const emptyDay = (date: ISODate): Day => ({ date, planned: [], done: [], focus: [], body: '', extra: {} })
const cloneDay = (d: FlowData, date: ISODate): Day => (d.days[date] ? structuredClone(d.days[date]) : emptyDay(date))

function planOn(day: Day, ref: string) {
  if (!day.planned.includes(ref)) day.planned.push(ref)
}

export function addTask(d: FlowData, slug: string, title: string, status: 'todo' | 'today', today: ISODate): Change {
  const src = d.projects[slug]
  const clean = title.trim()
  if (!src || !clean) return noChange(d)
  const project = structuredClone(src)
  const id = nextTaskIdFor(d, slug)
  const task: Task = { id, title: clean, status, created: today, extra: {} }
  project.tasks.push(task)
  const days: Record<ISODate, Day> = {}
  const changed = [projectPath(slug)]
  if (status === 'today') {
    task.planned = today
    const day = cloneDay(d, today)
    planOn(day, `${slug}/${id}`)
    days[today] = day
    changed.push(dayPath(today))
  }
  return { data: withParts(d, project, days), changed }
}

export function editTask(
  d: FlowData, ref: string, patch: { title?: string; firstStep?: string }, _today: ISODate,
): Change {
  const found = findTask(d, ref)
  if (!found) return noChange(d)
  const project = structuredClone(found.project)
  const task = project.tasks.find((t) => t.id === found.task.id)!
  if (patch.title !== undefined && patch.title.trim()) task.title = patch.title.trim()
  if (patch.firstStep !== undefined) {
    const step = patch.firstStep.trim()
    if (step) task.firstStep = step
    else delete task.firstStep
  }
  return { data: withParts(d, project, {}), changed: [projectPath(project.slug)] }
}

export function moveTask(d: FlowData, ref: string, to: TaskStatus, today: ISODate): Change {
  const found = findTask(d, ref)
  if (!found || found.task.status === to) return noChange(d)
  const from = found.task.status
  const project = structuredClone(found.project)
  const task = project.tasks.find((t) => t.id === found.task.id)!
  const days: Record<ISODate, Day> = {}
  const changed = [projectPath(project.slug)]
  const touch = (date: ISODate): Day => {
    if (!days[date]) {
      days[date] = cloneDay(d, date)
      changed.push(dayPath(date))
    }
    return days[date]
  }

  if (from === 'done' && task.done) {
    const completedOn = task.done
    if (d.days[completedOn]) {
      const day = touch(completedOn)
      day.done = day.done.filter((e) => e.ref !== ref)
    }
  }
  delete task.done
  // A planned day only means something while the task waits in To do.
  if (to !== 'todo') delete task.scheduled
  task.status = to

  if (to === 'today' && from === 'todo') {
    task.planned = today
    planOn(touch(today), ref)
  } else if (to === 'done') {
    task.done = today
    const day = touch(today)
    if (!day.done.some((e) => e.ref === ref)) day.done.push({ ref, title: task.title, project: project.title, extra: {} })
  }
  return { data: withParts(d, project, days), changed }
}

export function deleteTask(d: FlowData, ref: string): Change {
  const found = findTask(d, ref)
  if (!found) return noChange(d)
  const project = structuredClone(found.project)
  project.tasks = project.tasks.filter((t) => t.id !== found.task.id)
  return { data: withParts(d, project, {}), changed: [projectPath(project.slug)] }
}

export function changeTaskProject(d: FlowData, ref: string, toSlug: string): Change & { ref: string } {
  const found = findTask(d, ref)
  const target = d.projects[toSlug]
  if (!found || !target || found.project.slug === toSlug) return { ...noChange(d), ref }
  const from = structuredClone(found.project)
  const to = structuredClone(target)
  const moved = from.tasks.find((t) => t.id === found.task.id)!
  from.tasks = from.tasks.filter((t) => t !== moved)
  moved.id = nextTaskIdFor(d, toSlug)
  to.tasks.push(moved)
  const data: FlowData = { ...d, projects: { ...d.projects, [from.slug]: from, [to.slug]: to } }
  return { data, changed: [projectPath(from.slug), projectPath(to.slug)], ref: `${to.slug}/${moved.id}` }
}
