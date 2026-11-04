# Flow

Tauri 2 + React + TypeScript desktop planner. One board: Parking lot / To do / Tomorrow / Today / Done.
Data is Markdown files with YAML frontmatter in a user-chosen folder. See
`docs/superpowers/specs/2026-11-03-flow-design.md` for the design.

## Commands

- `npm test` runs the whole Vitest suite; `npm test -- <path>` runs one file.
- `npm run typecheck` runs `tsc -b --noEmit`.
- `npm run dev` starts Vite on port 1420 (browser mode).
- `npm run app:dev` runs the desktop app via Tauri.
- `node scripts/smoke.mjs` is a Playwright smoke test with real pointer drag-and-drop
  across Board, Week, Progress, Notes, Review, Settings (needs `npm run dev` running; writes
  `docs/screenshot*.png`: board, dark, progress, week). jsdom cannot drive dnd-kit.

## Structure

- `src/model/` pure logic over `FlowData` (tasks, projects, inbox, board columns, dates, ids). No I/O.
  v0.2 modules: `focus` (log timer sessions into day files), `stats` (week, heatmap, project
  progress), `review` (Copy AI review prompt text), `notes` (general notes), `notes-day` (today's
  note), `steps` (task checklists), `schedule` (scheduled dates, `promoteScheduled`, `weekPlan`),
  `review-week` (weekly review files, focus project), `plan` (apply Claude's suggested tasks).
  v0.2.3: `moveStep` (steps.ts) reorders a task's checklist; `src/ui/stepDrop.ts` has the pure
  `handleStepDrop` and `stepIds` used by the Checklist in Card.tsx.
  v0.2.1: `boardColumns` puts To do tasks scheduled for tomorrow in the Tomorrow column (not in
  To do); `parkTask` (inbox.ts) turns a task dropped on the Parking lot into an inbox item.
- `src/storage/` Markdown/frontmatter parsing, `FileStore` interface (`MemoryFileStore`,
  `TauriFileStore`), and `flowRepo` (load/save, README text, issue log).
- `src/ai/` Claude client (`claude.ts`, lazy-loaded `@anthropic-ai/sdk`), prompt builders
  (`prompts.ts`) and the dev-only canned client (`fake.ts`).
- `src/ui/` React components (Board, Column, Card, quick capture, folder setup) and `useFlow`.
  Board.tsx is the shell; views: `BoardView`, `WeekView`, `ProgressView`, `NotesView`,
  `WeeklyReview`, `SettingsPanel`; plus `Sidebar`, `ProjectHeader`, `NotesPanel`, `PlanMenu` (calendar
  menu on To do/Tomorrow/Today cards: scheduleTask), `FocusBar` +
  `useFocus`, `SearchBox`, `AiPanel`; tokens and themes in `theme.css`, styles in `board.css`.
- `src/shortcut.ts` idempotent global-shortcut registration (injected plugin functions).
- `src/main.tsx` picks the shell: browser or Tauri (main window / capture window).
- All app logic is TypeScript; Rust (`src-tauri`) only registers plugins.

## Rules

- Never write a file that failed to parse; it is skipped and recorded in `Flow/flow-issues.log`.
- No warnings, nags or pop-ups in the UI; problems go only to the issue log.
- Unknown frontmatter fields and Markdown bodies are preserved on write.
- Dates are local-time ISO `YYYY-MM-DD` (never `toISOString().slice(0, 10)`).
- Slugs are derived once at creation and never change on rename.
- Browser dev (`npm run dev`) uses `MemoryFileStore` seeded with example data; nothing persists.
- Day `focus` list: entries `ref, title, project, minutes`; omitted when empty; sessions under
  1 minute are not logged; each session is logged once. Timer state is in memory only.
- Task `steps: [{text, done}]` and `scheduled: YYYY-MM-DD` are omitted when empty; unknown fields
  on steps are preserved. Ticking the last step never completes the task.
- Step reorder: only the step's grip handle starts a drag, in a nested DndContext inside the
  Checklist (the board never sees step drags; the card never moves). Alt+Up/Down on the focused
  grip moves the step; focus stays on its grip. Done state and step extras move with the step.
- Decisions are `- YYYY-MM-DD: <text>` lines, last in the `## Decisions` section of the project body.
- Promotion is active-only: To do tasks with `scheduled <= today` in active projects move to Today
  on load/date change and lose `scheduled`; paused/done/archived projects keep their date.
- Tomorrow column = no new state: it is `scheduled === today + 1`. Drops onto it schedule tomorrow
  (Done tasks reopen first); Tomorrow → To do clears the date.
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
- `hiddenColumns` (array of ColumnId) in local app settings hides board columns; never all five,
  never in the Flow folder. Hidden columns' data and promotion are unchanged.
- Browser seed data in `src/main.tsx` is generated relative to today's local date.
