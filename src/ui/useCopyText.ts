import { useEffect, useRef, useState } from 'react'

/** Copy text built on demand to the clipboard; when that is unavailable, expose it as `fallback` to show for manual copying. */
export function useCopyText(build: () => string) {
  const [copied, setCopied] = useState(false)
  const [fallback, setFallback] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async () => {
    const text = build()
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(text)
      setFallback(null)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setFallback(text)
    }
  }
  return { copied, fallback, copy }
}
