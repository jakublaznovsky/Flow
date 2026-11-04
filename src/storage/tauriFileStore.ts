import { exists, mkdir, readDir, readTextFile, remove, rename, watch, writeTextFile } from '@tauri-apps/plugin-fs'
import type { FileStore } from './fileStore'

const join = (root: string, rel: string) => `${root.replace(/[\\/]+$/, '')}/${rel}`

/** Absolute event path -> path relative to root ('/' separated), or null if Flow should ignore it. */
export function toRelativePath(root: string, abs: string): string | null {
  const r = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const a = abs.replace(/\\/g, '/')
  if (!a.startsWith(`${r}/`)) return null
  const rel = a.slice(r.length + 1)
  if (rel === '' || rel.endsWith('.tmp') || rel === 'flow-issues.log') return null
  return rel
}

export class TauriFileStore implements FileStore {
  private lastWritten = new Map<string, string>()

  private root: string

  constructor(root: string) {
    this.root = root
  }

  async list(dir: string): Promise<string[]> {
    const path = dir === '' ? this.root : join(this.root, dir)
    if (!(await exists(path))) return []
    return (await readDir(path)).filter((e) => e.isFile).map((e) => e.name)
  }

  async read(path: string): Promise<string | null> {
    const abs = join(this.root, path)
    return (await exists(abs)) ? readTextFile(abs) : null
  }

  async write(path: string, text: string): Promise<void> {
    const abs = join(this.root, path)
    await mkdir(abs.slice(0, abs.lastIndexOf('/')), { recursive: true })
    await writeTextFile(`${abs}.tmp`, text)
    await rename(`${abs}.tmp`, abs)
    this.lastWritten.set(path, text)
  }

  async append(path: string, text: string): Promise<void> {
    const abs = join(this.root, path)
    await mkdir(abs.slice(0, abs.lastIndexOf('/')), { recursive: true })
    const prev = (await exists(abs)) ? await readTextFile(abs) : ''
    await writeTextFile(abs, prev + text)
  }

  async remove(path: string): Promise<void> {
    const abs = join(this.root, path)
    if (await exists(abs)) await remove(abs)
    this.lastWritten.delete(path)
  }

  async watch(onChange: (paths: string[]) => void): Promise<() => void> {
    if (!(await exists(this.root))) await mkdir(this.root, { recursive: true })
    return watch(
      this.root,
      async (event) => {
        const rels = new Set<string>()
        for (const abs of event.paths) {
          const rel = toRelativePath(this.root, abs)
          if (rel) rels.add(rel)
        }
        const external: string[] = []
        for (const rel of rels) {
          const mine = this.lastWritten.get(rel)
          if (mine !== undefined && (await this.read(rel)) === mine) continue
          external.push(rel)
        }
        if (external.length > 0) onChange(external)
      },
      { recursive: true, delayMs: 300 },
    )
  }
}
