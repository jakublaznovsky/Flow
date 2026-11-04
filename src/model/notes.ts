import { NOTES_PATH, type Change, type FlowData } from './types'

/** Replace the general notes text. Unchanged text is no change. */
export function setNotes(d: FlowData, body: string): Change {
  if (d.notes.body === body) return { data: d, changed: [] }
  return { data: { ...d, notes: { ...d.notes, body } }, changed: [NOTES_PATH] }
}

/** Add `## heading` and the text at the end of the general notes. Unreadable notes.md is left alone. */
export function appendNotes(d: FlowData, heading: string, text: string): Change {
  const clean = text.trim()
  if (d.skipped.includes(NOTES_PATH) || clean === '') return { data: d, changed: [] }
  const before = d.notes.body.replace(/\s+$/, '')
  const section = `## ${heading}\n\n${clean}\n`
  return setNotes(d, before === '' ? section : `${before}\n\n${section}`)
}
