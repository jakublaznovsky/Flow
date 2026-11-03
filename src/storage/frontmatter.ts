import { parse, stringify } from 'yaml'

/** Split `---\nyaml\n---\nbody`. No leading `---` means no frontmatter: data is {} and body is the whole text. */
export function splitFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  // Tolerate a leading BOM and blank lines before the opening delimiter.
  const lead = /^(?:\uFEFF)?(?:[ \t\r]*\n)*/.exec(text)?.[0].length ?? 0
  const lines = text.slice(lead).split('\n')
  if (lines[0].trimEnd() !== '---') return { data: {}, body: text }
  const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === '---')
  if (end === -1) throw new Error('frontmatter is not closed')
  const yamlText = lines.slice(1, end).join('\n')
  const body = lines.slice(end + 1).join('\n')
  const data: unknown = parse(yamlText)
  if (data === null || data === undefined) return { data: {}, body }
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('frontmatter must be a mapping')
  return { data: data as Record<string, unknown>, body }
}

export function joinFrontmatter(data: Record<string, unknown>, body: string): string {
  const yamlText = Object.keys(data).length === 0 ? '' : stringify(data, { lineWidth: 0 })
  return `---\n${yamlText}---\n${body}`
}
