/** The global-shortcut plugin functions this helper needs (injected so it stays testable). */
export interface ShortcutApi {
  register(accelerator: string, handler: () => void): Promise<void>
  unregister(accelerator: string): Promise<void>
}

/** Whether the quick-capture shortcut is held by Flow; `label` is how Settings names it. */
export interface ShortcutStatus { ok: boolean; label: string }

// Calls on the same api run one after another, so overlapping calls can't interleave
// unregister/register and leave the accelerator unregistered.
const queues = new WeakMap<ShortcutApi, Promise<unknown>>()

/**
 * Register `accelerator` idempotently: unregister first (a webview reload leaves the old
 * registration, bound to a dead page, in place), then register. Resolves to whether the
 * shortcut is held; a failure goes to `log` only. Never throws.
 */
export function registerShortcut(
  api: ShortcutApi, accelerator: string, handler: () => void, log: (reason: string) => void,
): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    await api.unregister(accelerator).catch(() => {})
    try {
      await api.register(accelerator, handler)
      return true
    } catch (e) {
      try { log(`could not register ${accelerator}: ${e instanceof Error ? e.message : String(e)}`) } catch { /* never breaks the app */ }
      return false
    }
  }
  const next = (queues.get(api) ?? Promise.resolve()).then(run, run)
  queues.set(api, next)
  return next
}
