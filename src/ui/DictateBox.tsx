import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Starts Windows voice typing (Win+H) in the focused field; Tauri on Windows only. */
  dictate: () => Promise<void>
  /** A non-blank thought to add to the Parking lot. */
  onSubmit: (text: string) => void
  /** Open/closed, so the top bar can hide the search box while dictating. */
  onOpenChange: (open: boolean) => void
  /** Why dictation could not start (issue log only); the field stays open for Win+H by hand. */
  onError?: (reason: string) => void
}

/** Delay between focusing the field and pressing Win+H, so voice typing targets the field. */
const START_DELAY_MS = 150

/**
 * Mic button next to the search box. Opens a "Speak a thought" field and starts Windows voice
 * typing in it; Enter adds the text to the Parking lot, Escape cancels, an outside click closes it
 * only while empty. Window focus changes (the voice typing bar) never close it.
 */
export default function DictateBox({ dictate, onSubmit, onOpenChange, onError }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const mic = useRef<HTMLButtonElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const textRef = useRef(text)
  textRef.current = text

  const close = (refocus: boolean) => {
    setOpen(false)
    setText('')
    onOpenChange(false)
    if (refocus) requestAnimationFrame(() => mic.current?.focus())
  }

  useEffect(() => {
    if (!open) return
    field.current?.focus()
    const t = setTimeout(() => {
      dictate().catch((e: unknown) => onError?.(e instanceof Error ? e.message : String(e)))
    }, START_DELAY_MS)
    const outside = (e: PointerEvent) => {
      if (box.current?.contains(e.target as Node)) return
      if (!textRef.current.trim()) close(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', outside) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [open])

  if (!open) {
    return (
      <button
        ref={mic}
        type="button"
        className="dictate-btn"
        aria-label="Dictate a thought"
        title="Dictate a thought"
        onClick={() => { setOpen(true); onOpenChange(true) }}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5.75" y="1.75" width="4.5" height="8" rx="2.25" />
          <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.25" />
        </svg>
      </button>
    )
  }

  return (
    <div className="dictate" ref={box}>
      <span className="dictate-dot" aria-hidden="true" />
      <input
        ref={field}
        type="text"
        aria-label="Speak a thought"
        placeholder="Speak a thought…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); close(true) }
          if (e.key !== 'Enter') return
          e.preventDefault()
          const clean = text.trim()
          if (!clean) return
          onSubmit(clean)
          close(true)
        }}
      />
    </div>
  )
}
