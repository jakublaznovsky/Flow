export interface Settings {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
}

export class MemorySettings implements Settings {
  private values = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value)
  }
}
