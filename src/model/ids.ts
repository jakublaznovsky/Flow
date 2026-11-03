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
