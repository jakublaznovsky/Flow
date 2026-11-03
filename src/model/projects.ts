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
  d: FlowData, slug: string, patch: { title?: string; color?: string; status?: ProjectStatus },
): Change {
  const src = d.projects[slug]
  if (!src) return { data: d, changed: [] }
  const project = structuredClone(src)
  if (patch.title !== undefined && patch.title.trim()) project.title = patch.title.trim()
  if (patch.color !== undefined) project.color = patch.color
  if (patch.status !== undefined) project.status = patch.status
  return { data: { ...d, projects: { ...d.projects, [slug]: project } }, changed: [projectPath(slug)] }
}
