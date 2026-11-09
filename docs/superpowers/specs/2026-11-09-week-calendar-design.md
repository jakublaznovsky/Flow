# Week calendar (time grid) — Design Spec

Date: 2026-11-09 · Target version: 0.3.0 · Builds on v0.2.9 (see CLAUDE.md for current rules)
Backup of the pre-feature state: branch `backup/pre-calendar-v0.2.9`, tag `v0.2.9`.

## 1. Goal

Turn the Week tab into an Outlook-like weekly calendar so the owner can plan activities by the hour,
for project tasks and for week-only personal items (leisure, sport, appointments). Times are shown
**only** in the Week tab and **only by position** — no time text anywhere in the app.

## 2. Layout (Week tab only)

- Unchanged: header in the top bar (title + month picker, ‹ This week ›), the Unscheduled drawer,
  day columns Mon–Sun with today highlighted and past days dimmed.
- Each day column gets two parts:
  1. **Untimed strip** (top, above 07:00): tasks planned for that day without a time, "In Today"
     tasks without a time (today's column), and done history entries (no time). Grows with content
     up to a max height, then scrolls.
  2. **Time grid 07:00–24:00** below it.
- Left of the days: a **time axis** with hour labels (7, 8, … 23, 24 — numbers only, muted text);
  **thin horizontal lines at every full hour** across all days.
- The grid area scrolls vertically (strips + header stay visible); on open it scrolls so the current
  hour is visible (today) or 07:00 (other weeks).
- **Blocks** show only the title (and project colour stripe/tint for project tasks; a neutral sage
  style for week-only items). No times rendered. Overlapping blocks in one day are laid out
  side by side (equal-width lanes per overlap cluster).

## 3. Interaction (Outlook-like), snapping to 15 minutes

- **Move**: drag a block to another time and/or day.
- **Resize**: drag a block's top or bottom edge (resize handles ~6px, cursor ns-resize). Minimum
  15 min; clamped to 07:00–24:00.
- **Untimed strip → grid**: dropping a task into the grid gives it a 1-hour block starting at the
  drop position (snapped; shifted up if it would pass 24:00). **Grid → strip**: removes the time.
- **Unscheduled → grid**: schedules the task for that day and gives it the time; → strip: day only.
- Dropping a project task on another day's grid/strip changes its scheduled day using the existing
  week drop rules (future → scheduleTask; today → moveTask today; past → completeOn = done that
  day, which removes its time and puts it in that day's strip as history).
- **Create week-only item**: click on empty grid → 1-hour block at the click (snapped) with an inline
  title input; drag on empty grid → block spanning the drag. Enter saves (blank = no item), Escape
  cancels.
- **Week-only item**: double-click → rename inline; × button (on hover/focus) deletes immediately;
  move/resize like tasks.
- Project task blocks: move/resize only (completing/editing stays on the Board). Clicking a project
  task block does not create anything.
- Keyboard (accessibility): focused block — Alt+↑/↓ moves 15 min, Alt+Shift+↑/↓ changes the end by
  15 min, Delete removes a week-only item; each block has an aria-label with title and its time in
  words for screen readers (e.g. "Swim, Thursday 18:00 to 19:30") — the only place times exist as text,
  invisible.

## 4. Data

- **Project task time**: optional task field `time: "HH:MM-HH:MM"` (quoted string, 15-minute
  multiples, 07:00 ≤ start < end ≤ 24:00). Strict parse (invalid → file fails to parse, never
  written, per CLAUDE.md). Omitted when absent. It applies to the day the task is on in the Week
  view (its `scheduled` day, or today for status today). Ignored by Board, Progress, review, AI
  prompts (not included in any prompt or stats).
- The time is removed when: the task moves to the untimed strip or Unscheduled, changes day
  (except a Week-grid drop that sets a new time), or is completed (done). Board moves between
  To do / Today / Tomorrow keep it.
- **Week-only items**: new folder `calendar/`, one file per ISO week `calendar/YYYY-Www.md`:
  ```yaml
  ---
  week: "2026-W46"
  items:
    - id: c1
      title: Swimming
      date: 2026-11-12
      time: "18:00-19:30"
  ---
  ```
  Unknown fields preserved; strict types; `loadFlow`/`reloadPaths`/save/mergePath handle the folder
  like reviews; skipped files never written; README_TEXT documents it. Items never appear outside the
  Week tab (not in Progress, review, AI prompts, search, board).
- Moving an item to a day in another ISO week moves it to that week's file in one apply.

## 5. Non-goals

No recurring items, no reminders/notifications, no time text, no times on the Board, no AI use of times.

## 6. Testing

Model: time parse/serialize, snapping/clamping math, overlap lanes, setTaskTime/clear rules, calendar
CRUD incl. cross-week move, skipped-file guards. UI (jsdom): pure drop/resize/create handlers, render
positions (top/height from time), strip vs grid placement, no time text in DOM outside aria-labels.
Playwright smoke: create item by click and by drag, resize bottom/top, move to another day, drag a
task from strip into grid and back; screenshots light/dark at 1280×800 and 1920×1080.
