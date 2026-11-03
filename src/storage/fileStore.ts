// Paths are relative to the Flow folder, '/' separated.
export interface FileStore {
  list(dir: string): Promise<string[]> // file names in dir; [] if dir missing
  read(path: string): Promise<string | null> // null if missing
  write(path: string, text: string): Promise<void> // atomic, creates parent dirs
  append(path: string, text: string): Promise<void>
  watch(onChange: (paths: string[]) => void): Promise<() => void> // only external changes
}

export class MemoryFileStore implements FileStore {
  files: Record<string, string>
  private watchers = new Set<(paths: string[]) => void>()

  constructor(initial: Record<string, string> = {}) {
    this.files = { ...initial }
  }

  async list(dir: string): Promise<string[]> {
    const prefix = dir === '' ? '' : `${dir}/`
    return Object.keys(this.files)
      .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map((p) => p.slice(prefix.length))
  }

  async read(path: string): Promise<string | null> {
    return path in this.files ? this.files[path] : null
  }

  async write(path: string, text: string): Promise<void> {
    this.files[path] = text
  }

  async append(path: string, text: string): Promise<void> {
    this.files[path] = (this.files[path] ?? '') + text
  }

  async watch(onChange: (paths: string[]) => void): Promise<() => void> {
    this.watchers.add(onChange)
    return () => {
      this.watchers.delete(onChange)
    }
  }

  externalWrite(path: string, text: string): void {
    this.files[path] = text
    for (const w of [...this.watchers]) w([path])
  }
}
