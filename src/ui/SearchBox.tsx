import type { Ref } from 'react'

interface Props { value: string; onChange: (v: string) => void; ref?: Ref<HTMLInputElement> }

/** Top-bar search. Escape clears it. */
export default function SearchBox({ value, onChange, ref }: Props) {
  return (
    <div className="search" role="search">
      <svg className="search-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="7" cy="7" r="4.75" /><path d="M10.5 10.5l3.25 3.25" />
      </svg>
      <input
        ref={ref}
        type="search"
        aria-label="Search"
        placeholder="Search tasks"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onChange('') } }}
      />
      {!value && <kbd aria-hidden="true">/</kbd>}
    </div>
  )
}
