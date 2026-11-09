import { useState } from 'react'

/** `dictateHint`: on Windows, the placeholder mentions Win+H (Windows voice typing works in this field). */
export default function QuickCapture({ onSubmit, dictateHint = false }: { onSubmit(text: string): void; dictateHint?: boolean }) {
  const [text, setText] = useState('')
  return (
    <input
      className="quick-capture"
      autoFocus
      placeholder={dictateHint ? 'Capture a thought… (Win+H to dictate)' : 'Capture a thought…'}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        const clean = text.trim()
        if (!clean) return
        onSubmit(clean)
        setText('')
      }}
    />
  )
}
