import type { ReactNode } from 'react'

interface Props { title: string; hint?: string; children: ReactNode; footer?: ReactNode }

export default function Column({ title, hint, children, footer }: Props) {
  return (
    <section className="column" aria-label={title}>
      <header>
        <h2>{title}</h2>
        {hint && <span className="hint">{hint}</span>}
      </header>
      <ul className="cards">{children}</ul>
      {footer}
    </section>
  )
}
