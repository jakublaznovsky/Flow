import { NOTES_PATH, type Change, type FlowData } from './types'

/** Replace the general notes text. Unchanged text is no change. */
export function setNotes(d: FlowData, body: string): Change {
  if (d.notes.body === body) return { data: d, changed: [] }
  return { data: { ...d, notes: { ...d.notes, body } }, changed: [NOTES_PATH] }
}
