# Flow

Tauri 2 + React + TypeScript desktop planner. One board: Parking lot | To do | Today | Tomorrow columns,
with Done as a collapsible bar underneath (v0.2.6).
Data is Markdown files with YAML frontmatter in a user-chosen folder. See
`docs/superpowers/specs/2026-11-03-flow-design.md` for the design.

## Commands

- `npm test` runs the whole Vitest suite; `npm test -- <path>` runs one file.
- `npm run typecheck` runs `tsc -b --noEmit`.
- `npm run dev` starts Vite on port 1420 (browser mode).
- `npm run app:dev` runs the desktop app via Tauri.
- `node scripts/smoke.mjs` is a Playwright smoke test with real pointer drag-and-drop
  across Board, Week, Progress, Notes, Review, Settings (needs `npm run dev` running; writes
  `docs/screenshot*.png`: board, dark, progress, week). jsdom cannot drive dnd-kit. Board cards are
  dragged by their title row (the always-open checklist keeps its own pointer events). Week steps
  drop on a day's strip (`.week-col-top`) for a day without a time; calendar steps create items by
  click and drag, resize both edges, move an item to another day, drag a task strip → grid → strip
  (checked via block aria-labels) and check no time text is visible. `FLOW_NOW=2026-11-12T10:00`
  pins the page clock to run the weekday-dependent steps.

## Structure

- `src/model/` pure logic over `FlowData` (tasks, projects, inbox, board columns, dates, ids). No I/O.
  v0.2 modules: `focus` (log timer sessions into day files), `stats` (week, heatmap, project
  progress), `review` (Copy AI review prompt text), `notes` (general notes), `notes-day` (today's
  note), `steps` (task checklists), `schedule` (scheduled dates, `promoteScheduled`, `weekPlan`),
  `review-week` (weekly review files, focus project), `plan` (apply Claude's suggested tasks).
  v0.2.3: `moveStep` (steps.ts) reorders a task's checklist; `src/ui/stepDrop.ts` has the pure
  `handleStepDrop` and `stepIds` used by the Checklist in Card.tsx.
  v0.3.0: `timeblock` (`HH:MM-HH:MM` parse/format, 15-min snap, 07:00–24:00 clamp, overlap
  lanes), `calendar` (week-only items CRUD incl. cross-week move, `setTaskTime`, `splitByTime`).
  v0.2.1: `boardColumns` puts To do tasks scheduled for tomorrow in the Tomorrow column (not in
  To do); `parkTask` (inbox.ts) turns a task dropped on the Parking lot into an inbox item.
- `src/storage/` Markdown/frontmatter parsing, `FileStore` interface (`MemoryFileStore`,
  `TauriFileStore`), and `flowRepo` (load/save, README text, issue log).
- `src/ai/` Claude client (`claude.ts`, lazy-loaded `@anthropic-ai/sdk`), prompt builders
  (`prompts.ts`) and the dev-only canned client (`fake.ts`).
- `src/ui/` React components (Board, Column, Card, quick capture, folder setup) and `useFlow`.
  Board.tsx is the shell; views: `BoardView`, `WeekView`, `ProgressView`, `NotesView`,
  `WeeklyReview`, `SettingsPanel`; plus `DoneBar` (Done under the columns), `useStoredFlag` (boolean
  local settings), `Sidebar`, `ProjectHeader`, `NotesPanel`, `PlanMenu` (calendar
  menu on To do/Tomorrow/Today cards: scheduleTask), `FocusBar` +
  `useFocus`, `SearchBox`, `AiPanel`; tokens and themes in `theme.css`, styles in `board.css`.
  Week calendar (v0.3.0): `WeekStrip` (day header + untimed strip, dnd-kit), `TimeGrid` (axis, day
  grids, pointer gestures: move/resize/create, keys, title inputs), `CalendarBlock` (one block,
  `HOUR_PX`), pure `calendarDrop` (`dropTask`, `dropItem`, `createItem`, block math, `blockLabel`);
  `edgeScroll` (grid auto-scroll only inside `.week-cal`, top band below the sticky strips, rAF loop
  while held in a band); WeekView is lazy-loaded inside `QuietBoundary` (a failure → issue log, renders nothing).
- `src/shortcut.ts` idempotent global-shortcut registration (injected plugin functions).
- `tauri-plugin-persisted-scope` (lib.rs, after fs) persists folder access granted via the folder
  picker, so a Flow folder outside `$HOME` (e.g. on D:) is reopened after a restart without asking.
- `src/main.tsx` picks the shell: browser or Tauri (main window / capture window).
- All app logic is TypeScript; Rust (`src-tauri`) only registers plugins.

## Rules

- v0.2.6 board: `COLUMNS` order is inbox, todo, today, tomorrow, done; `done` renders as the
  `DoneBar` (region "Done", heading/toggle "Done today (N)", aria-expanded), a drop target open or
  closed; open shows compact done cards (checkbox, title, pill, tag; no checklist).
- v0.2.6 cards: no chevron, no "Next:" line, no first-step line; a task card always shows its
  checklist between the title row (title + `n/m` pill) and the footer. Only the checklist's controls
  (grip, step checkbox, step text, ×, edit/Add step inputs) stop pointer-down; empty row space drags
  the card. Informational text uses `--text-muted` (≥ 4.5:1); `--text-faint` is for placeholders,
  icons and grips only. Footer: project tag tinted ~15% with
  a dot, day chip, calendar. Light theme: warm paper/linen, amber accent (`--accent`, darker
  `--accent-strong` for filled buttons, `--accent-text`), sage `--success*` for done/checks/heatmap.
- Never write a file that failed to parse; it is skipped and recorded in `Flow/flow-issues.log`.
- No warnings, nags or pop-ups in the UI; problems go only to the issue log. One owner exception:
  deleting a project asks first in an in-app dialog (`DeleteDialog` in Sidebar.tsx: alertdialog,
  focus on Cancel, Escape/backdrop cancel; never `window.confirm`).
- Unknown frontmatter fields and Markdown bodies are preserved on write.
- Dates are local-time ISO `YYYY-MM-DD` (never `toISOString().slice(0, 10)`).
- Slugs are derived once at creation and never change on rename.
- Browser dev (`npm run dev`) uses `MemoryFileStore` seeded with example data; nothing persists.
- Day `focus` list: entries `ref, title, project, minutes`; omitted when empty; sessions under
  1 minute are not logged; each session is logged once. Timer state is in memory only.
- `first_step` is kept in files but never shown on cards; the edit form offers "First step" only for
  a task that already has one (so it can be cleared). Claude's suggested first step is added as the
  new task's first checklist step, not as `first_step`.
- Task `steps: [{text, done}]` and `scheduled: YYYY-MM-DD` are omitted when empty; unknown fields
  on steps are preserved. Ticking the last step never completes the task.
- Step reorder: only the step's grip handle starts a drag, in a nested DndContext inside the
  Checklist (the board never sees step drags; the card never moves). Alt+Up/Down on the focused
  grip moves the step; focus stays on its grip. Done state and step extras move with the step.
- Decisions are `- YYYY-MM-DD: <text>` lines, last in the `## Decisions` section of the project body.
- Promotion is active-only: To do tasks with `scheduled <= today` in active projects move to Today
  on load/date change and lose `scheduled`; paused/done/archived projects keep their date.
- Week view drops (v0.2.5, `handleWeekDrop`): To do, In Today and done entries (task still in an
  active project) all drag. Future day: reopen if done, then `scheduleTask`. Today's column:
  `moveTask(today)`. Past day: `completeOn` (tasks.ts) = done that day, `scheduled` cleared,
  snapshot `extra: {}` on that day (no duplicate), removed from the previous done day; planned lists
  untouched; no change if a file to write is skipped. Unscheduled: back to To do, date cleared.
- Delete project (⋯ menu / Hidden list, v0.2.5): `useFlow.removeProject` runs in the save chain:
  `moveToDeleted` (flowRepo) copies the exact on-disk text to `deleted/<slug>-<date>.md` (-2, -3…),
  then `FileStore.remove`s the original (never if the copy failed; failures → one log line, project
  stays); only then `deleteProject` (projects.ts) drops it from FlowData. Days/inbox untouched;
  focus filter and lastProject cleared. loadFlow never reads `deleted/`.
- Week header (v0.2.9): WeekView portals its header (group "Week navigation": h2 title + ‹ This week ›)
  into the top bar's left `header-slot` (Board.tsx `headerSlot`), on the search box's row; other
  views' top bar is unchanged. The title is a button (aria-haspopup="dialog") inside the h2; its text shares a
  grid cell with an invisible sizer (`TITLE_SIZER`, tabular digits) so ‹ This week › never move. It
  opens `MonthPicker` (dialog "Choose month": year with ↑ Previous year / ↓ Next year, 4×3 months,
  aria-label "November 2026"; aria-current = month of the shown week's Sunday, `.is-today` = today's
  month). Choosing a month shows the week containing its 1st (kept as the week `offset`). Arrows move
  (±1/±4, across years), Enter/Space choose, Escape/outside click close, Tab cycles; keys never reach
  app shortcuts while it is open; focus returns to the title.
- Weekly review (v0.2.9): the card fills the main area (flex column; Back + Next together at its
  bottom-right). Step 1's seven day boxes fill the card (each list scrolls inside its box); step 2's
  rows are a responsive grid; steps 3–4 content is at most 900px wide.
- Week calendar (v0.3.0): the Week tab is a 07:00–24:00 grid (hour lines, axis 7…24) under each
  day's untimed strip (tasks with a day but no time, In Today, done history). Task `time:
  "HH:MM-HH:MM"` (quoted; 15-min multiples; 07:00 ≤ start < end ≤ 24:00) is strict (invalid → file
  skipped) and omitted when absent; it applies to the task's Week day (`scheduled`, or today for a
  Today task). Week-only items live in `calendar/YYYY-Www.md` (`week`, `items: [{id, title, date,
  time}]`, strict, unknown fields kept; a date in another ISO week moves the item to that file in
  one apply; repeated item ids get new ids in memory only (`dedupeCalendarIds` on load/reload), and the
  new id is written when that file is next saved). Board moves keep the time (To do / Today /
  Tomorrow in any direction; Tomorrow moves pass `keepTime`; a Today task keeps it at rollover).
  Only these remove it: in the Week view, unscheduling, a strip drop or a day change (except a
  grid drop, which sets a new time); Plan menu / WeeklyReview rescheduling to another day or
  unscheduling; completing; parking. A block moved/resized on its own day (pointer or Alt+arrows)
  only changes its time (`placeTask` → `setTaskTime`, never the day-drop rules).
  Strip/drawer drops onto the grid start in the 15-min slot under the pointer (floor), 1 hour.
  Click/drag on empty grid creates an item with an inline title: Enter or blur saves (blank = no
  item), Escape cancels; double-click/Enter/F2 renames, × or Delete/Backspace deletes a week-only
  item (task blocks only move/resize). Week-only items show under the project filter. The grid
  scrolls to the current hour (this week) or 07:00 only when the view first opens. No time text
  anywhere: a block shows its title; times exist only in its aria-label ("Swim, Thursday 18:00 to
  19:30"). Times and items never reach Board, Progress, review, AI prompts or search. dnd-kit
  drops read the real pointer position (its auto-scroll is off; the grid scrolls near its edges).
  While a block is resized or moved, `html[data-cal-gesture=resize|move]` forces one cursor
  (ns-resize / grabbing) everywhere until release or Escape (v0.3.1).
- Tomorrow column = no new state: it is `scheduled === today + 1`. Drops onto it schedule tomorrow
  (Done tasks reopen first); Tomorrow → To do clears the date.
- Promoting a Parking lot item (v0.2.8): dropping it on To do / Today / Tomorrow / the Done bar
  (open or collapsed) always opens `ProjectPicker` (also with no active project). Label "Move to
  which project?", or "Done in which project?" for Done. `promoteInboxItem(..., to: 'todo' |
  'today' | 'done')`: done = addTask + `moveTask(done, today)` (day `done` snapshot); no change if
  inbox.md, the project or (today/done) the day file is skipped. The picker's last option
  "+ New project" swaps to an input ("New project name"): Enter (non-blank) runs `createProject` +
  the promotion in ONE apply (neither happens without the other); Escape there returns to the list
  (focus on "+ New project"); Escape in the list cancels. Escape/cancel never changes anything.
- Parking a task: text `<title> — first step: X; steps: a ✓, b; planned: <scheduled ?? planned>`
  (only parts present), task `extra` kept on the item; day files untouched; no change if inbox.md or
  the project file is skipped.
- Add forms close on Escape, Cancel, or an outside click while empty (typed text is kept).
- Weekly reviews live in `reviews/YYYY-Www.md` (ISO week; `week`, `focus_project`, `intention`,
  body = reflection). The focus project applies to the following week (review W-1, fallback W).
- No streaks anywhere: nothing counts consecutive days.
- The Claude API key and model live in local app settings only, never in the Flow folder. AI
  buttons send data only on press; errors show as one calm line in the AI panel.
  The API's own error (status, type, message — never the key) goes to `flow-issues.log` via
  `aiErrorDetail`. Structured-output schemas must avoid unsupported keywords (`maxItems`,
  `minItems`, `minimum`/`maximum`, `minLength`/`maxLength`…); enforce such limits client-side.
- Dev-only `?fakeAi=1` (browser dev) swaps in a canned Claude client; never in production builds.
- Shortcuts (`/ n b w p o r`) fire only when no input, textarea or select has focus. `n` is a
  no-op while To do is hidden.
- The global quick-capture shortcut is registered once per app run in `renderTauri` (main.tsx),
  never from a React effect (StrictMode would register → unregister → register), via
  `registerShortcut` (`src/shortcut.ts`): unregister first, then register, serialized. Failures go
  only to the issue log; Settings shows one muted status line (none in the browser).
- `hiddenColumns` (array of ColumnId) in local app settings hides board columns; never all four
  real columns (the Done bar does not count and can be hidden on its own), never in the Flow
  folder. Hidden columns' data and promotion are unchanged. Hiding `done` hides the Done bar.
- `doneBarOpen` and `weekTrayOpen` (booleans, default true) in local app settings remember whether
  the Done bar and the Week view's Unscheduled drawer (full width, above the days) are open.
- Browser seed data in `src/main.tsx` is generated relative to today's local date.
