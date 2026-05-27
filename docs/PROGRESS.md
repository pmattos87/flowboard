# FlowBoard — Progress

**Last Updated:** May 27, 2026

**Status:** v1.0.0 shipped — 2026-05-27
**Overall Completion:** 31/31 tasks shipped across 10 phases

---

## Phase Progress

### Phase 1 — Scaffold & Infrastructure
- [x] **1.1** Init Tauri v2 + React + TypeScript + Vite → `backend-engineer`
- [x] **1.2** Configure Tailwind, shadcn/ui, Zustand, React Query, `@/` alias → `backend-engineer`
- [x] **1.3** Initialize SQLite schema with migrations → `backend-engineer`
- [x] **1.4** Tauri Rust CRUD commands for all entities → `backend-engineer`

### Phase 2 — Core Data Layer & Navigation
- [x] **2.1** Zustand UI stores + React Query hooks for all entities → `skill:data-layer`
- [x] **2.2** App shell: sidebar, top bar, routing → `skill:frontend-design`
- [x] **2.3** Projects CRUD UI → `skill:frontend-design`

### Phase 3 — People & Sprint Management
- [x] **3.1** People page → `skill:frontend-design`
- [x] **3.2** Sprints page → `skill:frontend-design`

### Phase 4 — Task Management
- [x] **4.1** Task creation modal → `skill:frontend-design`
- [x] **4.2** Task detail panel → `skill:frontend-design`
- [x] **4.3** Comments section → `skill:frontend-design`
- [x] **4.4** File attachments → `backend-engineer`
- [x] **4.5** Time tracking → `skill:frontend-design`

### Phase 5 — Board Views
- [x] **5.1** User Story Board → `skill:frontend-design`
- [x] **5.2** Task Board → `skill:frontend-design`
- [x] **5.3** Discovery Board → `skill:frontend-design`
- [x] **5.4** Sprint Planning Board → `skill:frontend-design`
- [x] **5.5** Drag & drop between columns → `skill:frontend-design`

### Phase 6 — Roadmap
- [x] **6.1** Gantt-style roadmap → `skill:backend-engineer`
- [x] **6.2** Draggable bars + today indicator → `skill:backend-engineer`

### Phase 7 — Reports
- [x] **7.1** Burndown chart → `skill:frontend-design`
- [x] **7.2** Velocity chart → `skill:frontend-design`
- [x] **7.3** Status distribution chart → `skill:frontend-design`
- [x] **7.4** Workload per-member chart → `skill:frontend-design`

### Phase 8 — Inbox & Notifications
- [x] **8.1** Inbox page → `skill:frontend-design`
- [x] **8.2** Native OS notifications → `skill:frontend-design`
- [x] **8.3** Notification bell badge → `skill:frontend-design`

### Phase 9 — Polish & UX
- [x] **9.1** Empty states, loading skeletons, error toasts → `skill:frontend-design`
- [x] **9.2** Keyboard shortcuts → `skill:frontend-design`
- [x] **9.3** Global search → `skill:frontend-design`
- [x] **9.4** App icon, window title, about page → `skill:frontend-design`

### Phase 10 — Hierarchy: Sprint Filters, Story Grouping, Backlog Pipeline
> Design doc: [`HIERARCHY.md`](./HIERARCHY.md)
- [x] **10.1** Shared `boardSprintFilter` in `uiStore` + `SprintFilterSelect` component → `skill:data-layer` + `skill:frontend-design`
- [x] **10.2** Sprint filter wired into User Story Board → `skill:frontend-design`
- [x] **10.3** Task Board: sprint filter + grouping by parent story → `skill:frontend-design`
- [x] **10.4** Discovery Board narrowed to backlog (`sprint_id IS NULL`) → `skill:frontend-design`
- [x] **10.5** Sprint Planning backlog → stories only + backend cascade → `skill:backend-engineer`
- [x] **10.6** Tests & DoD enforcement → `skill:qa-engineer`

---

## Current Focus / In Progress
- None — v1.0.0 cut. Phase 10 merged via PR #26; staging-badge gate landed via PR #27; per-project task numbering shipped on `main`.

## Blockers / Notes
- None. 231 Vitest tests pass; 13 Rust tests pass; `tsc --noEmit` clean as of release.

## Recent Completions
- 10.1–10.6 (Hierarchy: boardSprintFilter store + SprintFilterSelect; User Story Board / Task Board / Discovery / Sprint Planning narrowed to the Project > Sprint > Story > Task pipeline; backend cascade so story children follow their parent in/out of a sprint atomically)
- 9.1–9.4 (Polish: sonner toasts, skeleton loading, keyboard shortcuts n//, global search, About page)
- 8.1–8.3 (Inbox page, OS notifications via tauri-plugin-notification, bell badge with unread count)
- 7.1–7.4 (Reports: Burndown, Velocity, Status Distribution, Workload charts via Recharts)
- 6.1–6.2 (Roadmap page: read-only Gantt timeline, draggable bars, today indicator)
- 5.1–5.5 (All four board views with @dnd-kit drag-and-drop)
- 4.1–4.5 (Task modal, detail panel, comments, file attachments, time tracking)
- 3.1–3.2 (People and Sprints pages)
- 2.1–2.3 (Data layer, app shell, projects CRUD)
- 1.1–1.4 (Scaffold, Tauri, SQLite, Rust commands)

---

**See also:**
- [`PLAN.md`](./PLAN.md) — Detailed build plan and handoffs
- [`CLAUDE.md`](../CLAUDE.md) — Canonical project reference
- [`DECISIONS.md`](./DECISIONS.md) — Architecture decisions
- [`CHANGELOG.md`](./CHANGELOG.md) — Version history
