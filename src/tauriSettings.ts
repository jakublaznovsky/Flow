import { load, type Store } from '@tauri-apps/plugin-store'
import type { Settings } from './ui/settings'

export class TauriSettings implements Settings {
  private store: Promise<Store> = load('settings.json', { defaults: {}, autoSave: true })

  async get<T>(key: string): Promise<T | undefined> {
    return (await (await this.store).get<T>(key)) ?? undefined
  }

  async set(key: string, value: unknown): Promise<void> {
    await (await this.store).set(key, value)
  }
}
