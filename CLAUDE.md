# Flow

Tauri 2 + React + TypeScript desktop planner. One board: Parking lot / To do / Today / Done.
Data is Markdown files with YAML frontmatter in a user-chosen folder. See
`docs/superpowers/specs/2026-11-03-flow-design.md` for the design.

## Commands

- `npm test` runs the whole Vitest suite; `npm test -- <path>` runs one file.
- `npm run typecheck` runs `tsc -b --noEmit`.
- `npm run dev` starts Vite on port 1420 (browser mode).
- `npm run app:dev` runs the desktop app via Tauri.
- `node scripts/smoke.mjs` is a Playwright smoke test with real pointer drag-and-drop
  (needs `npm run dev` running; writes `docs/screenshot.png`). jsdom cannot drive dnd-kit.

## Structure

- `src/model/` pure logic over `FlowData` (tasks, projects, inbox, board columns, dates, ids). No I/O.
- `src/storage/` Markdown/frontmatter parsing, `FileStore` interface (`MemoryFileStore`,
  `TauriFileStore`), and `flowRepo` (load/save, README text, issue log).
- `src/ui/` React components (Board, Column, Card, quick capture, folder setup) and `useFlow`.
- `src/main.tsx` picks the shell: browser or Tauri (main window / capture window).
- All app logic is TypeScript; Rust (`src-tauri`) only registers plugins.

## Rules

- Never write a file that failed to parse; it is skipped and recorded in `Flow/flow-issues.log`.
- No warnings, nags or pop-ups in the UI; problems go only to the issue log.
- Unknown frontmatter fields and Markdown bodies are preserved on write.
- Dates are local-time ISO `YYYY-MM-DD` (never `toISOString().slice(0, 10)`).
- Slugs are derived once at creation and never change on rename.
- Browser dev (`npm run dev`) uses `MemoryFileStore` seeded with example data; nothing persists.
