# Week calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Outlook-like time grid (07–24) in the Week tab with movable/resizable blocks for project tasks and week-only items.
**Architecture:** pure model (`src/model/timeblock.ts`, `src/model/calendar.ts`) + storage for `calendar/` files + WeekView split into `WeekStrip` / `TimeGrid` components with pointer-based move/resize/create (dnd-kit kept for strip/tray drags).
**Spec:** `docs/superpowers/specs/2026-11-09-week-calendar-design.md` (binding). CLAUDE.md rules apply.

## Global constraints
- Snap 15 min; grid 07:00–24:00; min block 15 min; default new/dropped block 60 min.
- No time text rendered anywhere (aria-label only). Times never in Board/Progress/review/AI/search.
- `time: "HH:MM-HH:MM"` strict; `calendar/YYYY-Www.md` strict, extras preserved, skipped never written.
- Version 0.3.0.

### Task 1: Model + storage
Files: `src/model/timeblock.ts` (parseTime, formatTime, snap(min), clampBlock, minutesToY/yToMinutes helpers, layoutLanes(blocks) → lane/lanes), `src/model/calendar.ts` (addItem, updateItem(id,{date?,time?,title?}) incl. cross-week move, deleteItem; setTaskTime(d, ref, time|null); week view plan helpers), types (`Task.time?`, `CalendarItem`, `FlowData.calendar`), files.ts parse/serialize (task `time`, calendar file), flowRepo load/reload/save/README_TEXT, useFlow mergePath, and clearing rules in tasks.ts/schedule.ts (completeOn/moveTask done, scheduleTask day change, parkTask drops time).
Tests: model + storage round trips, strictness, skipped guards, cross-week move, clear rules, lanes.

### Task 2: Week calendar UI + interactions
Files: `src/ui/WeekView.tsx` (+ new `TimeGrid.tsx`, `WeekStrip.tsx`, `CalendarBlock.tsx`), `board.css`.
Strip + grid + axis + hour lines; blocks positioned from time; overlap lanes; scroll to current hour; pointer move/resize/create (snap 15, clamp), rename/delete for items, strip↔grid and Unscheduled↔grid drops, keyboard (Alt+arrows), aria-labels. Export pure handlers for jsdom tests.
Tests: handlers + rendering; no time text in DOM (except aria-label).

### Task 3: Smoke, docs, version
`scripts/smoke.mjs` calendar steps (create by click/drag, resize, move, strip↔grid), screenshots (light/dark, 1280×800 + 1920×1080, update docs/screenshot-week.png), README, CLAUDE.md rules, version 0.3.0 everywhere (Cargo `features = []` kept).
