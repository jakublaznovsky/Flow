import type { ReactNode } from 'react'

type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'p'; text: string }

const HEADING = /^(#{1,6})\s+(.*)$/
const BULLET = /^\s*[-*]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

function blocks(text: string): Block[] {
  const out: Block[] = []
  let para: string[] = []
  const flush = () => { if (para.length) out.push({ kind: 'p', text: para.join(' ') }); para = [] }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const h = HEADING.exec(line)
    const b = BULLET.exec(line)
    const n = b ? null : NUMBERED.exec(line)
    if (line.trim() === '') { flush(); continue }
    if (h) { flush(); out.push({ kind: 'h', level: Math.min(h[1].length, 3), text: h[2].replace(/\s*#+$/, '') }); continue }
    if (b || n) {
      flush()
      const kind = b ? 'ul' : 'ol'
      const last = out[out.length - 1]
      const item = (b ?? n)![1]
      if (last && last.kind === kind) last.items.push(item)
      else out.push({ kind, items: [item] })
      continue
    }
    para.push(line.trim())
  }
  flush()
  return out
}

/** `**bold**` runs as <strong>; everything else stays plain text. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter((s) => s !== '').map((s, i) =>
    s.length > 4 && s.startsWith('**') && s.endsWith('**') ? <strong key={i}>{s.slice(2, -2)}</strong> : s)
}

/** Tiny safe renderer for Claude's answers: headings, lists, paragraphs, bold. Text nodes only. */
export default function Markdownish({ text }: { text: string }) {
  return (
    <div className="markdownish">
      {blocks(text).map((b, i) => {
        if (b.kind === 'h') {
          const H = (['h3', 'h4', 'h5'] as const)[b.level - 1]
          return <H key={i}>{inline(b.text)}</H>
        }
        if (b.kind === 'p') return <p key={i}>{inline(b.text)}</p>
        const L = b.kind
        return <L key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</L>
      })}
    </div>
  )
}
