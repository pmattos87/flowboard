# FlowBoard — Build Plan

**This file contains only the phased task list and agent handoff messages.**

**Status:** v1.0.0 shipped 2026-05-27. All 10 phases merged to `main`.

---

## Phased Task List

### Phase 1 — Scaffold & Infrastructure
> **Git Setup:** Ensure you are on `phase/1-infrastructure` before beginning.
- **Task 1.1** Init Tauri v2 + React + TypeScript + Vite project → `skill:backend-engineer`
- **Task 1.2** Configure Tailwind, shadcn/ui, Zustand, React Query, `@/` alias → `skill:backend-engineer`
- **Task 1.3** Initialize SQLite schema with migrations → `skill:backend-engineer`
- **Task 1.4** Tauri Rust CRUD commands for all entities → `skill:backend-engineer`
> **Phase Exit Criteria:** Push `phase/1-infrastructure` to GitHub (`git push origin phase/1-infrastructure`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge, sync locally: `git checkout main && git pull`. Tag is optional: `git tag v0.1-infra && git push origin v0.1-infra`.

### Phase 2 — Core Data Layer & Navigation
> **Git Setup:** git checkout main && git pull && git checkout -b phase/2-core-layers
- **Task 2.1** Zustand UI stores + React Query hooks for all entities → `skill:data-layer`
- **Task 2.2** App shell: sidebar, top bar, routing → `skill:frontend-design`
- **Task 2.3** Projects CRUD UI → `skill:frontend-design`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/2-core-layers`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v0.2-core -m "Phase 2 Complete: Core App Shell & Data layer ready" && git push origin v0.2-core`

### Phase 3 — People & Sprint Management
> **Git Setup:** git checkout main && git pull && git checkout -b phase/3-management
- **Task 3.1** People page → `skill:frontend-design`
- **Task 3.2** Sprints page → `skill:frontend-design`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/3-management`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v0.3-mgmt -m "Phase 3 Complete: Sprints and Team management views" && git push origin v0.3-mgmt`

### Phase 4 — Task Management
> **Git Setup:** git checkout main && git pull && git checkout -b phase/4-task-engine
- **Task 4.1** Task creation modal → `skill:frontend-design`
- **Task 4.2** Task detail panel → `skill:frontend-design`
- **Task 4.3** Comments section → `skill:frontend-design`
- **Task 4.4** File attachments → `skill:backend-engineer`
- **Task 4.5** Time tracking → `skill:frontend-design`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/4-task-engine`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v0.4-tasks -m "Phase 4 Complete: Core task CRUD, commenting, and file mechanics" && git push origin v0.4-tasks`

### Phase 5 — Board Views
> **Git Setup:** git checkout main && git pull && git checkout -b phase/5-boards
- **Task 5.1** User Story Board → `skill:frontend-design`
- **Task 5.2** Task Board → `skill:frontend-design` + `skill:backend-engineer` (DnD)
- **Task 5.3** Discovery Board → `skill:frontend-design`
- **Task 5.4** Sprint Planning Board → `skill:frontend-design`
- **Task 5.5** Drag & drop between columns → `skill:backend-engineer`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/5-boards`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v0.5-boards -m "Phase 5 Complete: Interactive agile board views with DnD tracking" && git push origin v0.5-boards`

### Phase 6 — Roadmap
> **Git Setup:** git checkout main && git pull && git checkout -b phase/6-roadmap
- **Task 6.1** Gantt-style roadmap → `skill:backend-engineer`
- **Task 6.2** Draggable bars + today indicator → `skill:backend-engineer`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/6-roadmap`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v0.6-roadmap -m "Phase 6 Complete: Gantt roadmap timeline visualizer" && git push origin v0.6-roadmap`

### Phase 7 — Reports
> **Git Setup:** git checkout main && git pull && git checkout -b phase/7-analytics
- **Task 7.1–7.4** All charts (Burndown, Velocity, Status, Workload) → `skill:frontend-design`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/7-analytics`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v0.7-reports -m "Phase 7 Complete: Burndown and analytics reporting dashboards" && git push origin v0.7-reports`

### Phase 8 — Inbox & Notifications
> **Git Setup:** git checkout main && git pull && git checkout -b phase/8-notifications
- **Task 8.1** Inbox page → `skill:frontend-design`
- **Task 8.2** Native OS notifications → `skill:backend-engineer`
- **Task 8.3** Notification bell badge → `skill:frontend-design`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/8-notifications`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v0.8-alerts -m "Phase 8 Complete: Notification center and native OS toast messaging" && git push origin v0.8-alerts`

### Phase 9 — Polish & UX
> **Git Setup:** git checkout main && git pull && git checkout -b phase/9-polish
- **Task 9.1** Empty states, loading skeletons, error toasts → `skill:frontend-design`
- **Task 9.2** Keyboard shortcuts → `skill:ux-engineer`
- **Task 9.3** Global search → `skill:ux-engineer`
- **Task 9.4** App icon, window title, about page → `skill:backend-engineer`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/9-polish`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v1.0.0 -m "FlowBoard MVP Launch Release" && git push origin v1.0.0`

### Phase 10 — Hierarchy: Sprint Filters, Story Grouping, Backlog Pipeline
> **Design doc:** [`HIERARCHY.md`](./HIERARCHY.md)
> **Git Setup:** git checkout main && git pull && git checkout -b phase/10-hierarchy
- **Task 10.1** Shared `boardSprintFilter` in `uiStore` + `SprintFilterSelect` component → `skill:data-layer` + `skill:frontend-design`
- **Task 10.2** Sprint filter wired into User Story Board → `skill:frontend-design`
- **Task 10.3** Task Board: sprint filter + grouping by parent story (collapsible rows, per-group droppables) → `skill:frontend-design`
- **Task 10.4** Discovery Board narrowed to `sprint_id IS NULL` backlog → `skill:frontend-design`
- **Task 10.5** Sprint Planning backlog panel narrowed to stories; backend cascade on story `sprint_id` change (children follow parent) → `skill:backend-engineer`
- **Task 10.6** Tests: Rust cascade unit tests; Vitest for filter store, grouping reducer, Discovery filter; re-verify `KanbanBoard.dnd.test.tsx` rect-mock if column classes changed → `skill:qa-engineer`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/10-hierarchy`), open a PR into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v0.10-hierarchy -m "Phase 10 Complete: Project > Sprint > Story > Task hierarchy in boards" && git push origin v0.10-hierarchy`

---

## Agent Handoff Messages

### Handoff: Task 1.1 — Project Scaffold
**Assigned to:** skill:backend-engineer  
**Depends on:** —

- `create-tauri-app` with React + TypeScript + Vite template
- Frontend deps: `tailwindcss`, `@tailwindcss/vite`, `shadcn-ui`, `zustand`, `@tanstack/react-query`, `@dnd-kit/core`, `@dnd-kit/sortable`, `recharts`, `lucide-react`, `clsx`, `tailwind-merge`
- Tauri plugins: `tauri-plugin-sql` (SQLite feature), `tauri-plugin-fs`, `tauri-plugin-notification`
- Tailwind `darkMode: 'class'`; apply `dark` class to `<html>` permanently
- Vite `@/` → `src/` alias mirrored in `tsconfig.json`
- Output: running skeleton confirming `bg-gray-950` dark background

### Handoff: Task 1.2 — Frontend Tooling Configuration
**Assigned to:** skill:backend-engineer  
**Depends on:** 1.1

Configure all frontend tooling...

*(Configuration details remain as in previous version — Tailwind, shadcn/ui, Zustand, React Query, path alias, types, etc.)*

### Handoff: Task 1.3 — SQLite Schema & Rust Commands
**Assigned to:** skill:backend-engineer  
**Depends on:** 1.1

Schema and all nullable FK rules are in **CLAUDE.md § SQLite Schema**...

### Handoff: Task 1.4 — Tauri Rust CRUD Commands
**Assigned to:** skill:backend-engineer  
**Depends on:** 1.3

Implement all Tauri commands in `src-tauri/src/commands/`...

### Handoff: Task 2.1 — Zustand Stores & React Query Hooks
**Assigned to:** skill:data-layer  
**Depends on:** 1.3, 1.4

Create the full data access layer...

### Handoff: Task 2.2 — App Shell & Navigation
**Assigned to:** skill:frontend-design  
**Depends on:** 1.2, 2.1

Visual spec is in **CLAUDE.md § Visual & UX Reference → App Shell**...

### Handoff: Task 2.3 — Projects CRUD UI
**Assigned to:** skill:frontend-design  
**Depends on:** 2.2, 2.1

Projects list in sidebar, Create Project modal, Project Settings page...

### Handoff: Task 3.1 — People Page
**Assigned to:** skill:frontend-design  
**Depends on:** 2.2, 2.1

### Handoff: Task 3.2 — Sprints Page
**Assigned to:** skill:frontend-design  
**Depends on:** 2.2, 2.1

### Handoff: Task 4.1 — Task Creation Modal
**Assigned to:** skill:frontend-design  
**Depends on:** 3.1, 3.2

### Handoff: Task 4.2 — Task Detail Panel
**Assigned to:** skill:frontend-design  
**Depends on:** 4.1

### Handoff: Task 4.3 — Comments Section
**Assigned to:** skill:frontend-design  
**Depends on:** 4.2

### Handoff: Task 4.4 — File Attachments
**Assigned to:** skill:backend-engineer  
**Depends on:** 4.2, 1.3, 1.4

### Handoff: Task 4.5 — Time Tracking
**Assigned to:** skill:frontend-design  
**Depends on:** 4.2, 2.1

### Handoff: Task 5.1 — User Story Board
**Assigned to:** skill:frontend-design  
**Depends on:** Phase 4

### Handoff: Task 5.2 — Task Board
**Assigned to:** skill:frontend-design + skill:backend-engineer (backend DnD support)  
**Depends on:** Phase 4

### Handoff: Task 5.3 — Discovery Board
**Assigned to:** skill:frontend-design  
**Depends on:** Phase 4

### Handoff: Task 5.4 — Sprint Planning Board
**Assigned to:** skill:frontend-design  
**Depends on:** Phase 4, 3.2

### Handoff: Task 5.5 — Drag & drop between columns
**Assigned to:** skill:backend-engineer  
**Depends on:** 5.1–5.4

### Handoff: Tasks 6.1–6.2 — Roadmap
**Assigned to:** skill:backend-engineer  
**Depends on:** Phase 3

### Handoff: Tasks 7.1–7.4 — Reports
**Assigned to:** skill:frontend-design  
**Depends on:** Phase 5

### Handoff: Task 8.1 — Inbox Page
**Assigned to:** skill:frontend-design  
**Depends on:** 2.2, 2.1

### Handoff: Task 8.2 — Native Notifications
**Assigned to:** skill:backend-engineer  
**Depends on:** 1.1, 1.3

### Handoff: Task 8.3 — Notification Bell Badge
**Assigned to:** skill:frontend-design  
**Depends on:** 8.1, 2.2

### Handoff: Task 9.1 — Empty States, Skeletons & Toasts
**Assigned to:** skill:frontend-design  
**Depends on:** Phase 5, Phase 8

### Handoff: Task 9.2 — Keyboard Shortcuts
**Assigned to:** skill:ux-engineer  
**Depends on:** 4.1, 9.3

### Handoff: Task 9.3 — Global Search
**Assigned to:** skill:ux-engineer  
**Depends on:** 2.2, 2.1

### Handoff: Task 9.4 — App Icon, Window Title & About Page
**Assigned to:** skill:backend-engineer  
**Depends on:** 1.1

### Handoff: Task 10.1 — Shared sprint filter store + selector
**Assigned to:** skill:data-layer (+ skill:frontend-design for the select component)
**Depends on:** 2.1, 3.2

- Add `boardSprintFilter: "all" | "backlog" | number` and `setBoardSprintFilter` to `uiStore`. Default `"all"`. Reset to `"all"` when `activeProjectId` changes or when the previous selection points to a sprint that does not belong to the new project.
- Create `src/features/boards/shared/SprintFilterSelect.tsx`: a `<select>` matching the existing `SprintPlanningBoard` dropdown styling. Options: `All sprints`, `Backlog (no sprint)`, then each sprint by `sprints[]` order with `(active)` suffix on the active sprint.
- Unit-test the store: project switch resets stale selection; non-existent sprint id falls back to `"all"`.

### Handoff: Task 10.2 — Sprint filter on User Story Board
**Assigned to:** skill:frontend-design
**Depends on:** 10.1

- Render `<SprintFilterSelect />` in the header (right-aligned, same row as `<h1>`).
- Narrow stories: `t.type === "story"` then apply the active filter (`all` / `backlog` = `sprint_id === null` / numeric id = `sprint_id === id`).
- Empty-state copy when filter yields zero: `No stories in <filter label>.`

### Handoff: Task 10.3 — Task Board: sprint filter + story rows
**Assigned to:** skill:frontend-design
**Depends on:** 10.1
**Design ref:** `HIERARCHY.md` §3.2 (see screenshot in the linked discussion).

- Header: `<h1>` + `<SprintFilterSelect />`.
- **Stories are first-class rows, not hidden.** Each story matching the sprint filter renders as a collapsible row. Tasks/bugs are cards rendered *inside* the columns of their parent story's row.
- Story-row header (left → right): chevron, story type icon, `${projectKey}-${story.id}`, story title, priority icon, progress bar (`doneChildren / totalChildren`), `+ Add` button. Header is clickable (key/title) to open Task Detail Panel; chevron toggles collapse.
- Per-column sub-headers inside an expanded row: status dot, label, count of children in that status, `+` button (pre-fills `parent_id`, `sprint_id`, `status` in the Create Task modal).
- A story with zero matching children still renders (shows `0/0`).
- `Unparented` trailing pseudo-row collects tasks/bugs with `parent_id === null` that match the sprint filter; omitted entirely when empty.
- Per-row droppable IDs: `${status}:${groupKey}` (groupKey is the story id or `"unparented"`). Drag handler splits on `:` to resolve the new status; never crosses rows (changing `parent_id` is out of scope).
- Collapse state: component-local `useState` keyed by `activeProjectId`. Collapsed rows hide the column band; the header (including progress bar) stays visible.
- **DnD safety:** keep the source `TaskCard` mounted with `setNodeRef` for the entire drag (Phase 5 / Recurring Patterns). Any "ghost" placeholder must render inside the dragged card via `useDraggable().isDragging`, never as a sibling swap.
- Empty states: see `HIERARCHY.md` §3.2.9.

### Handoff: Task 10.4 — Discovery Board → backlog only
**Assigned to:** skill:frontend-design
**Depends on:** —

- Filter: `(t.type === "epic" || t.type === "story") && t.sprint_id === null`.
- Add subtitle under `<h1>`: `Backlog — stories and epics not yet assigned to a sprint.`
- Update existing Discovery Board tests to assert the `sprint_id === null` narrowing.

### Handoff: Task 10.5 — Sprint Planning backlog → stories only + backend cascade
**Assigned to:** skill:backend-engineer
**Depends on:** 1.4

- Frontend: in `SprintPlanningBoard.tsx`, narrow `backlogTasks` to `t.sprint_id === null && t.type === "story"`.
- Backend: in `src-tauri/src/commands/tasks.rs`, when `update_task` mutates `sprint_id` on a row where `type='story'`, also `UPDATE tasks SET sprint_id = ?, updated_at = ? WHERE parent_id = ?` in the same transaction.
- Watch the `Option<Option<T>>` deserialization rule (Phase 5 / Documentation Gaps) — `sprint_id` already uses `deserialize_optional_field`; do not regress.
- Rust unit tests: cascade fires on story `sprint_id` change (both set and clear); does not fire when a non-story task's `sprint_id` changes; transaction atomicity (parent + children either all updated or none).

### Handoff: Task 10.6 — Tests & DoD enforcement
**Assigned to:** skill:qa-engineer
**Depends on:** 10.1–10.5

- Verify all Definition of Done items in `HIERARCHY.md` §5.
- Vitest: store action for `setBoardSprintFilter`; pure grouping reducer used by Task Board (input flat tasks, output ordered groups); Discovery board filter.
- Re-evaluate the currently-skipped case in `src/__tests__/features/KanbanBoard.dnd.test.tsx`. If column classes (`min-h-[120px]`) or header text changed in 10.3, update `stubBoundingRects()` accordingly and unskip the regression-guard case.
- Final gate: `npx vitest run` zero failures, `tsc --noEmit` clean.

---

**Post-Phase 9 Recommendations:**
- Run full regression suite via `skill:qa-engineer`
- Final visual polish pass via `skill:frontend-polish`
- Documentation sync via `skill:docs-architect`

**Definition of Done (all tasks):** Matches CLAUDE.md constraints, agent-specific rules, passes `tsc --noEmit`, includes proper loading/empty states, and respects dark-mode-only design.