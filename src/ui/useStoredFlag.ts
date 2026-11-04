import { useCallback, useEffect, useRef, useState } from 'react'
import type { Settings } from './settings'

/**
 * A boolean kept in local app settings (never the Flow folder), e.g. whether a drawer is open.
 * Starts at `initial`; a stored boolean replaces it unless the owner already toggled it.
 */
export function useStoredFlag(settings: Settings, key: string, initial: boolean): [boolean, () => void] {
  const [value, setValue] = useState(initial)
  const chosen = useRef(false)
  useEffect(() => {
    let cancelled = false
    void settings.get<unknown>(key).then((v) => {
      if (!cancelled && !chosen.current && typeof v === 'boolean') setValue(v)
    })
    return () => { cancelled = true }
  }, [settings, key])
  const valueRef = useRef(value)
  valueRef.current = value
  const toggle = useCallback(() => {
    chosen.current = true
    const next = !valueRef.current
    valueRef.current = next
    setValue(next)
    void settings.set(key, next)
  }, [settings, key])
  return [value, toggle]
}
