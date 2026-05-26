# FlowBoard — Progress

**Last Updated:** May 25, 2026

**Current Phase:** Phase 5 — Board Views (complete, pending merge)
**Overall Completion:** 72% (18/25 tasks)

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
- [ ] **6.1** Gantt-style roadmap → `skill:frontend-design`
- [ ] **6.2** Draggable bars + today indicator → `skill:frontend-design`

### Phase 7 — Reports
- [ ] **7.1** Burndown chart → `skill:frontend-design`
- [ ] **7.2** Velocity chart → `skill:frontend-design`
- [ ] **7.3** Status distribution chart → `skill:frontend-design`
- [ ] **7.4** Workload per-member chart → `skill:frontend-design`

### Phase 8 — Inbox & Notifications
- [ ] **8.1** Inbox page → `skill:frontend-design`
- [ ] **8.2** Native OS notifications → `backend-engineer`
- [ ] **8.3** Notification bell badge → `skill:frontend-design`

### Phase 9 — Polish & UX
- [ ] **9.1** Empty states, loading skeletons, error toasts → `skill:frontend-design`
- [ ] **9.2** Keyboard shortcuts → `skill:ux-engineer`
- [ ] **9.3** Global search → `skill:ux-engineer`
- [ ] **9.4** App icon, window title, about page → `backend-engineer`

---

## Current Focus / In Progress
- **Phase 5 complete on `phase/5-boards`** — awaiting PR and merge to `main`.

## Blockers / Notes
- None

## Recent Completions
- 5.1–5.5 (UserStoryBoard, TaskBoard, DiscoveryBoard, SprintPlanningBoard — all with @dnd-kit drag-and-drop)
- 4.1–4.5 (CreateTaskModal + TaskDetailPanel with Comments, Attachments, Time Logs; tauri-plugin-dialog added)
- 3.2 (Sprints page: list/create/edit/delete, scoped to active project, status badges + date range)
- 3.1 (People page: team roster with avatar, role, email; full CRUD with inline delete confirmation)
- 2.3 (Create Project modal + Settings page with edit/delete; shadcn ui primitives added)
- 2.2 (App shell: 220px sidebar, 48px top bar, HashRouter + route stubs for all nav targets)
- 2.1 (Typed Tauri command wrappers + React Query hooks for all 8 entities + UI store extension)
- 1.4 (Rust CRUD commands, 31 invoke handlers across 8 entities)
- 1.3 (SQLite schema + migrations; SCHEMA.md FK rules clarified)
- 1.2 (shadcn foundation, React Query, Zustand, types, staging build profile)
- 1.1 (Tauri v2 scaffold; Tailwind v4 dark-mode; `@/` alias)

---

**See also:**
- [`plan.md`](./plan.md) — Detailed build plan and handoffs
- [`CLAUDE.md`](./CLAUDE.md) — Canonical project reference
- [`DECISIONS.md`](./DECISIONS.md) — Architecture decisions