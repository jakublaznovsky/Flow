import { useState } from 'react'

export default function QuickCapture({ onSubmit }: { onSubmit(text: string): void }) {
  const [text, setText] = useState('')
  return (
    <input
      className="quick-capture"
      autoFocus
      placeholder="Capture a thought…"
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
