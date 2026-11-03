# Flow — Design Spec

Date: 2026-11-03
Status: Draft for review

## 1. Purpose

Flow is a personal desktop planner for one user who likely has ADHD. Its job is to
keep the user productive by making it easy to **start** (pick a few tasks for today)
and **stay on track** (one simple board, a parking lot for stray thoughts), and to keep
a permanent record of **what was done each day**.

Flow is also **AI-friendly**: all data is plain Markdown files in one folder, so any
LLM can read the history and give feedback, plan upcoming days, or suggest growth
directions. In-app AI features come later.

### Success criteria

- The user opens Flow and sees one board; planning the day takes under two minutes.
- Every completed task is recorded in that day's file, and the record survives later
  edits or deletion of the task.
- An LLM pointed at the `Flow/` folder can understand the data with no other context.
- Flow never shows warnings, nags, or pop-ups.

### Out of scope (for now)

Focus timers, drift nudges, reminders/notifications, recurring tasks, week/year views,
separate project pages, in-app AI buttons, mobile builds, sync. The architecture must not
block adding these later.

## 2. Data format

The user chooses a `Flow/` folder (e.g. in Documents or a synced Dropbox/iCloud folder).
It is the single source of truth.

```
Flow/
  README.md            # explains this format to humans and AIs (written by Flow on first run)
  inbox.md             # parking lot
  projects/
    <slug>.md          # one file per project
  days/
    YYYY-MM-DD.md      # one file per day with activity
  flow-issues.log      # unreadable files Flow skipped (no UI; for the user or an AI)
```

All files are Markdown with YAML frontmatter. Dates are ISO `YYYY-MM-DD` in local time.

### 2.1 Project file — `projects/<slug>.md`

```markdown
---
title: Flow app
status: active          # active | paused | done | archived
color: "#4f8cff"
goal: Build my own ADHD-friendly planner
created: 2026-11-03
tasks:
  - id: t1
    title: Design the data format
    status: done        # todo | today | done
    first_step: List what a project needs
    created: 2026-11-03
    planned: 2026-11-03 # date it was last moved into Today
    done: 2026-11-03    # date it was completed
  - id: t2
    title: Set up Tauri project
    status: todo
    created: 2026-11-03
---
Free notes about the project.

## Decisions
- 2026-11-03: Build with Tauri, data as Markdown files.
```

- `slug` is derived from the title at creation (lowercase, hyphens) and never changes,
  even if the title is renamed, so references stay valid.
- Task `id`s are unique within a project (`t1`, `t2`, … incrementing). The global task
  reference is `<slug>/<id>`, e.g. `flow-app/t2`.
- Optional task fields (`first_step`, `planned`, `done`) are omitted when empty.
- The body (notes and `## Decisions`) is free text. Flow preserves it unchanged; it is
  edited outside Flow (text editor or AI) in this version.

### 2.2 Parking lot — `inbox.md`

```markdown
---
items:
  - id: i1
    text: Look into Spanish podcasts
    created: 2026-11-03
---
```

Items have no project. An item becomes a task when it is assigned to a project (§3.3).

### 2.3 Day file — `days/YYYY-MM-DD.md`

```markdown
---
date: 2026-11-04
planned: [flow-app/t2, learn-spanish/t5]
done:
  - ref: flow-app/t2
    title: Set up Tauri project
    project: Flow app
---
Optional free-text note (edited outside Flow in this version).
```

- `planned`: refs of tasks moved into Today on this date (appended; no duplicates).
- `done`: a snapshot of each completed task (ref plus title and project title at that
  moment), so the day's record stays readable if the task is later renamed or deleted.
- A day file is created only when something happens that day.

### 2.4 README.md

On first run Flow writes a `README.md` describing this format, the meaning of each field,
and example prompts ("Read Flow/days for the last 7 days and give me feedback"). Flow does
not overwrite it if it already exists.

## 3. The board (the whole UI)

One window, one board, four columns:

| Parking lot | To do | Today | Done |
|---|---|---|---|
| `inbox.md` items | tasks with `status: todo` | tasks with `status: today` | tasks completed **today** |

**Header bar:** the app name, a project filter (chips for active projects; click to
show only that project's cards; "All" by default), and a "+ Project" button.

**Cards** show the title, a colored project tag, and the first step (if set) in smaller
text. Clicking a card opens inline editing for title, first step and project, with a
delete action.

### 3.1 Moving cards

Cards move by drag and drop between columns, and within a column to reorder.

- To do → Today: `status: today`, `planned: <today>`, ref appended to today's `planned`.
- Today → Done (or ticking the card's checkbox): `status: done`, `done: <today>`,
  snapshot appended to today's `done`.
- Done → Today / To do (undo): status changes back, `done` field removed, and the entry
  removed from today's `done` list.
- Today → To do: `status: todo` (the `planned` history in day files is kept).

Card order within each column is a list of refs kept in the app's local settings (the
`store` plugin, not in `Flow/`). Cards missing from that list (e.g. tasks added by an AI
or text editor) appear at the bottom of their column, ordered by `created`.

### 3.2 Adding cards

- A "+" at the bottom of To do and Today adds a task: type a title, choose a project
  (defaults to the active filter, or the last-used project).
- A "+" in Parking lot adds an inbox item.

### 3.3 Parking lot

- **Global quick capture:** `Ctrl+Shift+Space` (Cmd+Shift+Space on macOS) opens a small
  capture window from anywhere; Enter saves the text to `inbox.md` and closes it.
- Dragging a Parking lot item into To do or Today shows a small project picker; choosing
  a project removes the item from `inbox.md` and creates a task in that project.
  Escape cancels and leaves the item in the Parking lot.

### 3.4 New day

When Flow opens (or the date changes while open):

- The Done column starts empty (earlier completions live in their day files).
- Unfinished Today cards stay in Today. No prompt or warning.
- Planning the day is simply dragging cards into Today. The Today column header shows a
  quiet hint "pick up to 3" while it is empty; there is no warning when it has more.

### 3.5 Projects

- "+ Project": enter a title (color auto-assigned); creates `projects/<slug>.md`.
- Right-click (or long-press) a project chip: rename, change color, pause, mark done,
  archive.
- Cards of projects that are not `active` are hidden from the board. Their files and
  history are untouched.

## 4. Architecture

**Stack:** Tauri 2 (desktop shell), React + TypeScript + Vite (UI). Official Tauri
plugins only: `fs`, `dialog` (folder picker), `global-shortcut`, `store` (local app
settings: folder path, column order, last-used project). All app logic is TypeScript;
Rust contains only Tauri setup and plugin registration.

### 4.1 Units

1. **`src/model/`** — pure functions over plain data types (`Project`, `Task`,
   `InboxItem`, `Day`, `FlowData`). Examples: `moveTask`, `completeTask`, `undoComplete`,
   `addTask`, `promoteInboxItem`, `createProject`, `boardColumns(data, today, filter)`.
   Each takes data (plus "today" as a parameter) and returns new data plus the list of
   changed files. No I/O, no clock access.
2. **`src/storage/`** — converts between files and data.
   - `parse*` / `serialize*` for each file type (YAML frontmatter + preserved body).
   - `FlowRepo` interface: `load(): FlowData`, `save(changedFiles)`, `watch(onChange)`.
   - `TauriFsRepo` implements it with the Tauri `fs` plugin; `MemoryRepo` implements it
     in memory for tests and browser development.
   - Writes are atomic: write `<file>.tmp`, then rename over the original.
3. **`src/ui/`** — React components: `Board`, `Column`, `Card`, `ProjectBar`,
   `ProjectPicker`, `QuickCapture` (rendered in the capture window). The UI holds
   `FlowData` in state, calls model functions, and passes changed files to the repo.

### 4.2 Data flow

1. Startup: read folder path from the `store`; if missing or the folder is gone, show the
   folder picker ("Choose or create your Flow folder"). Load all files into `FlowData`.
2. User action → model function → new `FlowData` in UI state → `repo.save(changed)`.
3. External change (text editor, AI) → watcher → reload the changed file → update state.
   Flow ignores watcher events caused by its own writes.

### 4.3 Errors (no warnings shown)

- A file that cannot be parsed is skipped, never overwritten, and a line is appended to
  `Flow/flow-issues.log` (timestamp, file, reason). Nothing is shown in the UI.
- A failed write is retried once; if it still fails it is logged to `flow-issues.log`
  and the in-memory state is kept so the next successful save writes it.
- If a task referenced by a day file no longer exists, the day file's snapshot is still
  valid; nothing breaks.

## 5. Testing

- **Unit tests (Vitest):** every model function; parse/serialize round-trips for every
  file type, including preserving unknown fields and the free-text body; slug and id
  generation; malformed-file handling.
- **UI tests (Vitest + React Testing Library, using `MemoryRepo`):** adding a task,
  moving To do → Today → Done and back, promoting a Parking lot item via the project
  picker, project filter, new-day behavior (Done empties, Today persists).
- **Browser check:** the UI runs in a normal browser with `MemoryRepo` (`npm run dev`)
  and can be checked headlessly with Playwright.
- **Manual on the user's computer:** the real Tauri window, folder picker, global
  shortcut and file watching (these cannot be exercised from the cloud session).

## 6. Later (not in this version)

Week and year views built from day files; project page for notes and decisions; morning
plan flow; focus timer; in-app AI ("Review my week", "Plan tomorrow") reading the same
files with the user's API key; mobile builds via Tauri 2; sync guidance.
