import { describe, expect, it, vi } from 'vitest'
import { registerShortcut, type ShortcutApi } from './shortcut'

const ACC = 'CommandOrControl+Shift+Space'

/** Mimics the plugin on Windows: registering a held accelerator fails with "already registered". */
function fakeOs(opts: { takenByOtherApp?: boolean } = {}) {
  const held = new Map<string, () => void>()
  const api: ShortcutApi = {
    register: vi.fn(async (acc: string, handler: () => void) => {
      await Promise.resolve()
      if (opts.takenByOtherApp) throw new Error('RegisterHotKey failed: hotkey already registered')
      if (held.has(acc)) throw new Error(`HotKey already registered: ${acc}`)
      held.set(acc, handler)
    }),
    unregister: vi.fn(async (acc: string) => {
      await Promise.resolve()
      held.delete(acc)
    }),
  }
  return { api, held }
}

describe('registerShortcut', () => {
  it('registers the accelerator and wires the handler; logs nothing on success', async () => {
    const { api, held } = fakeOs()
    const handler = vi.fn()
    const log = vi.fn()
    await expect(registerShortcut(api, ACC, handler, log)).resolves.toBe(true)
    held.get(ACC)?.()
    expect(handler).toHaveBeenCalledOnce()
    expect(log).not.toHaveBeenCalled()
  })

  it('replaces a stale registration left by an earlier page load (unregister first)', async () => {
    const { api, held } = fakeOs()
    const stale = vi.fn()
    held.set(ACC, stale)
    const fresh = vi.fn()
    const log = vi.fn()
    await expect(registerShortcut(api, ACC, fresh, log)).resolves.toBe(true)
    held.get(ACC)?.()
    expect(fresh).toHaveBeenCalledOnce()
    expect(stale).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })

  it('two calls (sequential or overlapping) never end unregistered', async () => {
    const { api, held } = fakeOs()
    const log = vi.fn()
    await registerShortcut(api, ACC, vi.fn(), log)
    await registerShortcut(api, ACC, vi.fn(), log)
    expect(held.has(ACC)).toBe(true)
    const last = vi.fn()
    await Promise.all([registerShortcut(api, ACC, vi.fn(), log), registerShortcut(api, ACC, last, log)])
    expect(held.has(ACC)).toBe(true)
    held.get(ACC)?.()
    expect(last).toHaveBeenCalledOnce()
    expect(log).not.toHaveBeenCalled()
  })

  it('a failure is logged once via the injected log and never throws', async () => {
    const { api } = fakeOs({ takenByOtherApp: true })
    const log = vi.fn()
    await expect(registerShortcut(api, ACC, vi.fn(), log)).resolves.toBe(false)
    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0][0]).toMatch(/could not register CommandOrControl\+Shift\+Space: .*already registered/)
  })

  it('an unregister error is ignored', async () => {
    const { api } = fakeOs()
    api.unregister = vi.fn(async () => { throw new Error('not registered') })
    const log = vi.fn()
    await expect(registerShortcut(api, ACC, vi.fn(), log)).resolves.toBe(true)
    expect(log).not.toHaveBeenCalled()
  })

  it('a throwing log does not throw either', async () => {
    const { api } = fakeOs({ takenByOtherApp: true })
    await expect(registerShortcut(api, ACC, vi.fn(), () => { throw new Error('disk full') })).resolves.toBe(false)
  })
})
