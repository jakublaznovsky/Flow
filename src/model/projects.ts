import { projectPath, type Change, type FlowData, type ISODate, type ProjectStatus } from './types'
import { pickColor, uniqueSlug } from './ids'

export function createProject(d: FlowData, title: string, today: ISODate): Change & { slug: string } {
  const clean = title.trim()
  if (!clean) return { data: d, changed: [], slug: '' }
  const skippedSlugs = d.skipped
    .map((p) => /^projects\/(.+)\.md$/.exec(p)?.[1])
    .filter((s): s is string => s !== undefined)
  const slug = uniqueSlug(clean, [...Object.keys(d.projects), ...skippedSlugs])
  const project = {
    slug, title: clean, status: 'active' as const, color: pickColor(Object.keys(d.projects).length),
    created: today, tasks: [], body: '', extra: {},
  }
  return { data: { ...d, projects: { ...d.projects, [slug]: project } }, changed: [projectPath(slug)], slug }
}

export function updateProject(
  d: FlowData, slug: string, patch: { title?: string; color?: string; status?: ProjectStatus; goal?: string; body?: string },
): Change {
  const src = d.projects[slug]
  if (!src) return { data: d, changed: [] }
  const project = structuredClone(src)
  if (patch.title !== undefined && patch.title.trim()) project.title = patch.title.trim()
  if (patch.color !== undefined) project.color = patch.color
  if (patch.status !== undefined) project.status = patch.status
  if (patch.goal !== undefined) {
    if (patch.goal === '') delete project.goal
    else project.goal = patch.goal
  }
  if (patch.body !== undefined) project.body = patch.body
  return { data: { ...d, projects: { ...d.projects, [slug]: project } }, changed: [projectPath(slug)] }
}

export function addDecision(d: FlowData, slug: string, text: string, today: ISODate): Change {
  const src = d.projects[slug]
  const clean = text.trim()
  if (!src || !clean) return { data: d, changed: [] }
  const line = `- ${today}: ${clean}`
  const lines = src.body.split('\n')
  const heading = lines.findIndex((l) => /^## Decisions\s*$/.test(l))
  let body: string
  if (heading === -1) {
    const base = src.body.replace(/\n+$/, '')
    body = `${base ? `${base}\n\n` : ''}## Decisions\n${line}\n`
  } else {
    let end = lines.length
    for (let i = heading + 1; i < lines.length; i++) if (lines[i].startsWith('## ')) { end = i; break }
    let at = heading
    for (let i = heading + 1; i < end; i++) if (lines[i].startsWith('- ')) at = i
    lines.splice(at + 1, 0, line)
    if (lines[lines.length - 1] !== '') lines.push('')
    body = lines.join('\n')
  }
  const project = { ...structuredClone(src), body }
  return { data: { ...d, projects: { ...d.projects, [slug]: project } }, changed: [projectPath(slug)] }
}
