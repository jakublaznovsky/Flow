import { dayPath, type Change, type Day, type FlowData, type ISODate } from './types'

/** Set a day's note (its file body). Empty note on a day without a file writes nothing. */
export function setDayNote(d: FlowData, date: ISODate, body: string): Change {
  const existing = d.days[date]
  if (!existing && body === '') return { data: d, changed: [] }
  if ((existing?.body ?? '') === body) return { data: d, changed: [] }
  const day: Day = existing
    ? { ...existing, body }
    : { date, planned: [], done: [], focus: [], body, extra: {} }
  return { data: { ...d, days: { ...d.days, [date]: day } }, changed: [dayPath(date)] }
}
