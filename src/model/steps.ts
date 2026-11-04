import { projectPath, type Change, type FlowData, type Project, type Task } from './types'
import { findTask } from './tasks'

/** Run `fn` on a copy of the task's step list; undefined from `fn` means "no change". */
function withSteps(d: FlowData, ref: string, fn: (task: Task) => boolean): Change {
  const found = findTask(d, ref)
  if (!found) return { data: d, changed: [] }
  const project: Project = structuredClone(found.project)
  const task = project.tasks.find((t) => t.id === found.task.id)!
  if (!fn(task)) return { data: d, changed: [] }
  if (task.steps && task.steps.length === 0) delete task.steps
  return { data: { ...d, projects: { ...d.projects, [project.slug]: project } }, changed: [projectPath(project.slug)] }
}
const valid = (t: Task, i: number) => Number.isInteger(i) && i >= 0 && i < (t.steps?.length ?? 0)

export function addStep(d: FlowData, ref: string, text: string): Change {
  const clean = text.trim()
  if (!clean) return { data: d, changed: [] }
  return withSteps(d, ref, (t) => { (t.steps ??= []).push({ text: clean, done: false, extra: {} }); return true })
}

export function toggleStep(d: FlowData, ref: string, index: number): Change {
  return withSteps(d, ref, (t) => {
    if (!valid(t, index)) return false
    t.steps![index].done = !t.steps![index].done
    return true
  })
}

/** Blank text deletes the step. */
export function editStep(d: FlowData, ref: string, index: number, text: string): Change {
  const clean = text.trim()
  if (!clean) return deleteStep(d, ref, index)
  return withSteps(d, ref, (t) => {
    if (!valid(t, index)) return false
    t.steps![index].text = clean
    return true
  })
}

export function deleteStep(d: FlowData, ref: string, index: number): Change {
  return withSteps(d, ref, (t) => {
    if (!valid(t, index)) return false
    t.steps!.splice(index, 1)
    return true
  })
}

/** Move the step at `from` to index `to` (the index it has afterwards); done state and extras move with it. */
export function moveStep(d: FlowData, ref: string, from: number, to: number): Change {
  return withSteps(d, ref, (t) => {
    if (from === to || !valid(t, from) || !valid(t, to)) return false
    const [step] = t.steps!.splice(from, 1)
    t.steps!.splice(to, 0, step)
    return true
  })
}

export function nextStep(task: Task): string | undefined {
  return task.steps?.find((s) => !s.done)?.text
}
