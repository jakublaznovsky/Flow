import type { FlowData } from './types'

/** URL-safe slug: diacritics stripped, lowercase, non-alphanumerics collapsed to '-'. */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'project'
}

/** Slug for a title that does not collide with any taken slug (appends -2, -3, ...). */
export function uniqueSlug(title: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = slugify(title)
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

function nextNumericId(prefix: string, items: { id: string }[]): string {
  const pattern = new RegExp(`^${prefix}(\\d+)$`)
  let max = 0
  for (const { id } of items) {
    const m = pattern.exec(id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${max + 1}`
}

export function nextTaskId(tasks: { id: string }[]): string {
  return nextNumericId('t', tasks)
}

/**
 * Next task id for a project, past every id it has ever used: current tasks plus any
 * `<slug>/tN` ref in the days' planned and done lists (so a deleted task's id is never reused).
 */
export function nextTaskIdFor(d: FlowData, slug: string): string {
  const used: { id: string }[] = [...(d.projects[slug]?.tasks ?? [])]
  const prefix = `${slug}/`
  for (const day of Object.values(d.days)) {
    for (const ref of [...day.planned, ...day.done.map((e) => e.ref)]) {
      if (ref.startsWith(prefix)) used.push({ id: ref.slice(prefix.length) })
    }
  }
  return nextTaskId(used)
}

export function nextInboxId(items: { id: string }[]): string {
  return nextNumericId('i', items)
}

export const PROJECT_COLORS: string[] = [
  '#e5484d', '#f76b15', '#f5a524', '#30a46c',
  '#0091ff', '#8e4ec6', '#d6409f', '#12a594',
]

export function pickColor(usedCount: number): string {
  return PROJECT_COLORS[usedCount % PROJECT_COLORS.length]
}
