export type ISODate = string;                                  // 'YYYY-MM-DD'
export type ProjectStatus = 'active' | 'paused' | 'done' | 'archived';
export type TaskStatus = 'todo' | 'today' | 'done';
export type Extra = Record<string, unknown>;                   // unknown frontmatter keys, preserved
export interface Step { text: string; done: boolean; extra: Extra }
export interface Task { id: string; title: string; status: TaskStatus; firstStep?: string;
  created: ISODate; planned?: ISODate; done?: ISODate; scheduled?: ISODate; steps?: Step[]
  /** "HH:MM-HH:MM" on the task's Week day (scheduled day, or today for status today). Week view only. */
  time?: string; extra: Extra }
export interface Project { slug: string; title: string; status: ProjectStatus; color: string;
  goal?: string; created: ISODate; tasks: Task[]; body: string; extra: Extra }
export interface InboxItem { id: string; text: string; created: ISODate; extra: Extra }
export interface Inbox { items: InboxItem[]; body: string; extra: Extra }
export interface DoneEntry { ref: string; title: string; project: string; extra: Extra }
export interface FocusEntry { ref: string; title: string; project: string; minutes: number; extra: Extra }
export interface Day { date: ISODate; planned: string[]; done: DoneEntry[]; focus: FocusEntry[]; body: string; extra: Extra }
export interface Notes { body: string; extra: Extra }
export interface Review { week: string; focusProject?: string; intention?: string; body: string; extra: Extra }
/** A week-only calendar item (leisure, sport, appointments); `time` is "HH:MM-HH:MM". */
export interface CalendarItem { id: string; title: string; date: ISODate; time: string; extra: Extra }
/** calendar/YYYY-Www.md: the week-only items of one ISO week. */
export interface CalendarWeek { week: string; items: CalendarItem[]; body: string; extra: Extra }
export interface FlowData { projects: Record<string, Project>; inbox: Inbox; notes: Notes;
  days: Record<ISODate, Day>; reviews: Record<string, Review>; calendar: Record<string, CalendarWeek>; skipped: string[] }              // skipped = relative paths that failed to parse
export interface Change { data: FlowData; changed: string[] }  // changed = relative file paths to write
export const projectPath = (slug: string) => `projects/${slug}.md`;
export const dayPath = (date: ISODate) => `days/${date}.md`;
export const reviewPath = (week: string) => `reviews/${week}.md`;
export const calendarPath = (week: string) => `calendar/${week}.md`;
export const INBOX_PATH = 'inbox.md';
export const NOTES_PATH = 'notes.md';
export const emptyFlow = (): FlowData => ({ projects: {}, inbox: { items: [], body: '', extra: {} }, notes: { body: '', extra: {} }, days: {}, reviews: {}, calendar: {}, skipped: [] });
