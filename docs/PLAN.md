# FlowBoard — Build Plan

**This file contains only the phased task list and agent handoff messages.**

**Status:** Live at **v1.4.0** as a local-first Tauri desktop app. The 10-phase MVP shipped as v1.0.0 (2026-05-27); v1.1.0 → v1.4.0 added post-MVP refinements (FB-50/51/53, etc.). The **FB-6 hosted web-app migration** (Phases 11–15, below) is **planned but not started** — see the epic at the end of this file.

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

---
---

# Epic: FB-6 — Client Access (Hosted Web App Migration)

> **Design doc:** [`FB-6-CLIENT-ACCESS.md`](./FB-6-CLIENT-ACCESS.md) — the locked decisions, architecture diagram, reuse seam, gotchas, and verification matrix. Read it in full before starting any phase below.
> **Source story:** FlowBoard `FB-6` "Acesso a clientes" (story, id 13).
> **Status:** PLAN ONLY — not started in code (verified 2026-06-10). FlowBoard is live at v1.3.0 as a local-first Tauri app.

**What this is:** A full-stack migration from the single-user, local-first Tauri desktop app to a **hosted, multi-tenant web app**. The Tauri shell is **retired**; the single source of truth moves to a **self-hosted Supabase** stack (Postgres + Auth + Row-Level Security) running in Docker on a **Hostinger VPS**, with the React/Vite SPA served by nginx. Owners have full edit access in the browser; clients get **scoped read + limited write** access to only their assigned projects (boards/status, roadmap/Gantt, comments & people — **time logs and story points hidden**).

> **Client access is NOT read-only** (clarified 2026-06-17, supersedes the "read-only" decision in `FB-6-CLIENT-ACCESS.md`). Within their assigned projects, clients **can write comments, add attachments, and create stories**. The exact write boundaries (which fields, edit vs. create-only, which entity types) are **TBD — to be refined before Phase 13 build**. The `time_logs` / `story_points` hiding decision is separate and still stands. The design doc's "read-only" framing and "Out of scope" §  must be reconciled when it is vendored into the repo (Task 11.1).

**⚠️ Supersedes CLAUDE.md non-negotiables.** The "local-only / no-auth / no-server / Tauri-commands-only" constraints no longer hold after this epic. Rewriting those docs is the first task (Phase 11 / Workstream 0), not an afterthought.

**Why it's tractable (the reuse seam):** All data access funnels through **one file — `src/lib/commands.ts`** (~30 thin `invoke()` wrappers behind React Query hooks). Re-point that seam at `supabase-js`, keep the same function signatures and return types (`src/types/index.ts`, IDs stay numeric `bigint`), and the entire UI above it (boards, modals, charts, roadmap, DnD) keeps working. Estimated solo effort: **~2–4 weeks**.

> **Workstream → Phase map** (workstream numbers from the design doc): WS0+WS1 → Phase 11 · WS3 → Phase 12 · WS2+WS4 → Phase 13 · WS5+WS6+WS7 → Phase 14 · WS8 → Phase 15. Sequencing follows the doc's "Suggested sequencing" §.

> **Branching model (per [`DECISIONS.md`](./DECISIONS.md) D-011):** `main` stays the **stable desktop app** (frozen at tag `v1.4.0`). All FB-6 work happens on a long-lived **integration branch `epic/fb-6-web`**, forked from `main` at the start of Phase 11. Each phase branches off and PRs back into `epic/fb-6-web` — **not `main`**. The intermediate `v2.0-*` tags are cut on `epic/fb-6-web`. **Only the completed migration merges `epic/fb-6-web → main`** (the final `v2.0.0` release, Phase 15). Branches are not created yet.

## Phased Task List — FB-6

### Phase 11 — Docs Reset & Supabase Schema (WS0 + WS1)
> **Git Setup:** Create the integration branch once: `git checkout main && git pull && git checkout -b epic/fb-6-web && git push -u origin epic/fb-6-web`. Then the phase branch: `git checkout -b phase/11-supabase-schema`.
- **Task 11.1** Constraints reset: rewrite CLAUDE.md "Non-Negotiable Constraints", add a `DECISIONS.md` pivot entry, and vendor the design doc into `docs/FB-6-CLIENT-ACCESS.md` → `skill:docs-architect`
- **Task 11.2** Port `SCHEMA.md` to Postgres migrations (`projects, people, sprints, tasks, comments, time_logs, attachments, activity_log`); FK `ON DELETE CASCADE/SET NULL` rules carry over; keep numeric IDs and `UNIQUE(project_id, task_number)` → `skill:backend-engineer`
- **Task 11.3** Re-implement Rust server-side logic as Postgres triggers/functions: `task_number` per-project sequence (`BEFORE INSERT`), `updated_at` auto-touch, story→child `sprint_id` cascade (atomic) → `skill:backend-engineer`
- **Task 11.4** Add multi-tenancy tables: `profiles` (`id`=auth.uid, `role` owner|client, display name) and `client_project_access` (`profile_id`, `project_id`) → `skill:backend-engineer`
- **Task 11.5** Tests: pgTAP/SQL unit tests for each trigger/function (numbering, touch, cascade set+clear, atomicity) mirroring the existing Rust cascade tests → `skill:qa-engineer`
> **Phase Exit Criteria:** A local self-hosted Supabase project mirrors the current data shape with all server-side logic reproduced and tested. Push `phase/11-supabase-schema`, open a PR into `epic/fb-6-web`, merge via GitHub UI. After merge: `git checkout epic/fb-6-web && git pull && git tag -a v2.0-schema -m "FB-6 Phase 11: Postgres schema + server-side logic ported to Supabase" && git push origin v2.0-schema`

### Phase 12 — Data-Layer Swap to Supabase (WS3)
> **Git Setup:** git checkout epic/fb-6-web && git pull && git checkout -b phase/12-datalayer-swap
- **Task 12.1** Add `@supabase/supabase-js`; create `src/lib/supabase.ts` (client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`) → `skill:data-layer`
- **Task 12.2** Re-implement all ~30 `src/lib/commands.ts` wrappers against `supabase.from(...)`/`supabase.rpc(...)` with **identical signatures and return types**; RPC for the cascade + seed helpers → `skill:data-layer`
- **Task 12.3** Attachments: move from `tauri-plugin-fs` on-disk `filepath` to **Supabase Storage** (store object path; `openAttachment` → signed URL); upload path must support client writes (see Phase 13), not owner-only → `skill:backend-engineer`
- **Task 12.4** Re-point the test suite: mock the Supabase client instead of `invoke` in `src/__tests__/lib/commands.test.ts` and hook tests; verify `src/hooks/*.ts` unchanged → `skill:qa-engineer`
> **Phase Exit Criteria:** Owner app runs end-to-end against Supabase (no client features yet); `npx vitest run` green, `tsc --noEmit` clean. Push `phase/12-datalayer-swap`, open a PR into `epic/fb-6-web`, merge via GitHub UI. After merge: `git checkout epic/fb-6-web && git pull && git tag -a v2.0-datalayer -m "FB-6 Phase 12: commands.ts seam re-pointed at Supabase; owner app on server DB" && git push origin v2.0-datalayer`

### Phase 13 — Auth & Multi-Tenancy / RLS + Role Split (WS2 + WS4)
> **Git Setup:** git checkout epic/fb-6-web && git pull && git checkout -b phase/13-auth-rls
- **Task 13.1** Enable Supabase email/password auth; seed the single owner account; document client-account provisioning → `skill:backend-engineer`
- **Task 13.2** RLS policies: owner = full read/write; client = read on rows whose `project_id` ∈ their `client_project_access`, **plus scoped write** (insert comments/attachments, create stories) within those same projects; deny writes outside assigned projects and on out-of-scope fields/entities (exact boundaries TBD); **`time_logs` denied to clients entirely** → `skill:backend-engineer`
- **Task 13.3** `story_points` column hiding: expose clients a `tasks_client` view that omits `story_points` (or column GRANTs) for reads, and ensure client story-creation inserts never set `story_points`; owner uses the base table — finalize the choice here → `skill:backend-engineer`
- **Task 13.4** Login page + Supabase session handling (auth listener, sign-out); gate the router in `src/App.tsx` behind a session → `skill:frontend-design`
- **Task 13.5** Role-aware UI: owner → existing full `AppShell`; client → scoped shell (boards/status, roadmap/Gantt, comments & people) that **exposes** the comment box, attachment upload, and a constrained story-creation flow (no story-point field), but **hides** time-tracking, settings/seed/staging tooling, and any owner-only edit/DnD surfaces (exact write surface TBD); project switcher scoped to accessible projects → `skill:frontend-design`
- **Task 13.6** Owner-only client-management screen: create client accounts and toggle their `client_project_access` → `skill:frontend-design`
- **Task 13.7** Tests: automated RLS integration tests with two sessions (owner + client) — client **can** read and perform allowed writes (comment, attachment, create story) in assigned projects, **cannot** read or write others, cannot write out-of-scope fields/entities, never receives `time_logs`/`story_points` → `skill:qa-engineer`
> **Phase Exit Criteria:** Clients can log in, see only their assigned projects, and perform the allowed writes (comment, attachment, create story) there but nowhere else; RLS proven by automated two-session tests. Push `phase/13-auth-rls`, open a PR into `epic/fb-6-web`, merge via GitHub UI. After merge: `git checkout epic/fb-6-web && git pull && git tag -a v2.0-auth -m "FB-6 Phase 13: auth, RLS multi-tenancy, owner/client role split" && git push origin v2.0-auth`

### Phase 14 — Realtime, Tauri Retirement & Data Migration (WS5 + WS6 + WS7)
> **Git Setup:** git checkout epic/fb-6-web && git pull && git checkout -b phase/14-realtime-migrate
- **Task 14.1** Subscribe to Supabase Realtime on tasks/sprints/comments and invalidate matching React Query keys (`taskKeys.all`, …); fallback refetch-on-focus + interval; replaces the desktop `notify()` flow → `skill:data-layer`
- **Task 14.2** Retire Tauri: remove `src-tauri/`, Tauri plugins, and all remaining `@tauri-apps/*` imports (`commands.ts`/`notifications.ts`/`image.ts`); replace `isStagingBuild`/`seedDemoData` desktop hooks with env-based equivalents or drop → `skill:backend-engineer`
- **Task 14.3** One-time migration script: read existing local SQLite and insert into Supabase **preserving IDs** (FKs/`task_number` keys stay stable); upload attachment files to Storage → `skill:backend-engineer`
- **Task 14.4** Tests: verify row counts and `{key}-{task_number}` task keys match between old SQLite and Supabase; confirm a live update appears when the owner changes a task → `skill:qa-engineer`
> **Phase Exit Criteria:** Live updates work, the Tauri shell is gone, and existing data is migrated with matching keys/counts. Push `phase/14-realtime-migrate`, open a PR into `epic/fb-6-web`, merge via GitHub UI. After merge: `git checkout epic/fb-6-web && git pull && git tag -a v2.0-migration -m "FB-6 Phase 14: realtime, Tauri retired, local data migrated" && git push origin v2.0-migration`

### Phase 15 — Hosting & Deployment (Hostinger VPS) (WS8)
> **Git Setup:** git checkout epic/fb-6-web && git pull && git checkout -b phase/15-hosting
- **Task 15.1** Provision the VPS (KVM 2 floor / KVM 4 headroom); install Docker + docker-compose; run the self-hosted Supabase stack; lock down ports (only nginx + SSH exposed); firewall + basic uptime monitoring → `skill:backend-engineer`
- **Task 15.2** nginx reverse proxy for the 5-app fleet: route `flowboard.<domain>` (and the other 4 apps) to their services; build the Vite SPA to static and serve it → `skill:backend-engineer`
- **Task 15.3** SSL via Certbot/Let's Encrypt with auto-renew cron → `skill:backend-engineer`
- **Task 15.4** Backups (must-build — VPS has none): scheduled `pg_dump` via cron + off-site copy, with a **tested restore** → `skill:backend-engineer`
- **Task 15.5** Outbound email: use a free SMTP relay (Mailgun/SendGrid/Brevo) for auth-email deliverability rather than the VPS IP → `skill:backend-engineer`
- **Task 15.6** Deploy smoke test + DoD: owner and client both log in on the hosted URL; manual client walkthrough (only assigned projects, no edit controls/DnD/time/points, live update on owner edit); CI keeps `tsc --noEmit` + Vitest green → `skill:qa-engineer`
> **Phase Exit Criteria:** Hosted FlowBoard is live behind nginx+SSL with automated tested backups; owner + client log in on the public URL. Push `phase/15-hosting`, open a PR into `epic/fb-6-web`, merge via GitHub UI. **Then promote the completed migration to trunk** (the one and only `main`-bound merge per D-011): open a PR `epic/fb-6-web → main`, merge it, then tag the release on `main`: `git checkout main && git pull && git tag -a v2.0.0 -m "FB-6 Launch: hosted multi-tenant FlowBoard web app on Hostinger VPS" && git push origin v2.0.0`. (`main` now becomes the hosted web app; the desktop line remains recoverable from tag `v1.4.0`.)

---

## Agent Handoff Messages — FB-6

### Handoff: Task 11.1 — Constraints reset & doc vendoring
**Assigned to:** skill:docs-architect
**Depends on:** —

- Rewrite CLAUDE.md § "Non-Negotiable Constraints": local-only/no-auth/no-server/Tauri-commands-only no longer hold. New constraints: hosted Supabase backend, RLS-enforced access control, owner/client roles, **project-scoped clients with limited write** (comments, attachments, story creation — not read-only), secrets discipline (only the anon key ships to the browser — **all** access control enforced by RLS, never the client).
- Add a `DECISIONS.md` entry recording the pivot to hosted/Supabase/self-hosted-VPS and the rationale (cost, one box for the 5-app fleet, owning the ops).
- Copy the design doc into the repo at `docs/FB-6-CLIENT-ACCESS.md` (currently only in the 2nd Brain vault) and **reconcile its "read-only" framing + "Out of scope" § with the 2026-06-17 clarification** (clients can write comments/attachments/stories; exact limits TBD).

### Handoff: Tasks 11.2–11.4 — Supabase schema & server-side logic
**Assigned to:** skill:backend-engineer
**Depends on:** 11.1
**Design ref:** `FB-6-CLIENT-ACCESS.md` §1 (Supabase schema).

- Port every table from `SCHEMA.md` to Postgres migrations; carry over FK `ON DELETE CASCADE/SET NULL`. Keep IDs numeric (`bigint`, not UUID) so `src/types/index.ts` stays stable. Keep `UNIQUE(project_id, task_number)`.
- Reproduce the three Rust behaviors faithfully (or boards/sprints silently drift): `task_number` per-project sequence as a `BEFORE INSERT` trigger (`MAX(task_number)+1` scoped to `project_id`); `updated_at` auto-touch trigger; story→child `sprint_id` cascade as an atomic trigger/`rpc`.
- New tables: `profiles` (`id`=auth.uid, `role`='owner'|'client', display name) and `client_project_access` (`profile_id`, `project_id`).

### Handoff: Task 11.5 — Schema/trigger tests
**Assigned to:** skill:qa-engineer
**Depends on:** 11.2–11.4

- SQL/pgTAP unit tests mirroring the existing Rust cascade tests: numbering increments per project; `updated_at` touches on update; cascade fires on story `sprint_id` set **and** clear, does **not** fire for non-story tasks, and is atomic (parent + children all-or-nothing).

### Handoff: Tasks 12.1–12.2 — Data-layer swap
**Assigned to:** skill:data-layer
**Depends on:** Phase 11
**Design ref:** `FB-6-CLIENT-ACCESS.md` §3 + "The reuse seam".

- Add `@supabase/supabase-js`; create `src/lib/supabase.ts` from env vars.
- Re-implement all ~30 wrappers in `src/lib/commands.ts` against `supabase.from(...)`/`supabase.rpc(...)`. **Same signatures, same return types** — `src/hooks/*.ts` must remain unchanged. Use RPC for the cascade and any seed helpers.

### Handoff: Task 12.3 — Attachments → Supabase Storage
**Assigned to:** skill:backend-engineer
**Depends on:** 12.1

- Move attachments off the local filesystem (`tauri-plugin-fs`, on-disk `filepath`) to Supabase Storage. Store the object path; `openAttachment` returns a signed URL. **Clients can upload attachments within their assigned projects** (Storage RLS + bucket policy must permit scoped client writes, gated by Phase 13 RLS — not owner-only).

### Handoff: Task 12.4 — Re-point test suite
**Assigned to:** skill:qa-engineer
**Depends on:** 12.2

- Mock the Supabase client instead of `invoke` in `src/__tests__/lib/commands.test.ts` and the hook tests (the ~231-test baseline mocks `invoke`). Final gate: `npx vitest run` green, `tsc --noEmit` clean — owner app runs end-to-end on Supabase.

### Handoff: Tasks 13.1–13.3 — Auth, RLS & column hiding
**Assigned to:** skill:backend-engineer
**Depends on:** Phase 11, Phase 12
**Design ref:** `FB-6-CLIENT-ACCESS.md` §2 + gotchas 1, 3, 6.

- Enable email/password auth; seed the single owner. **`people` is content (assignees/authors), not login accounts** — keep distinct from client logins mapped via `client_project_access`.
- RLS: owner full read/write; client read on `project_id` ∈ their `client_project_access`, **plus scoped write** — insert comments, insert attachments, and create stories **within those projects only**. Deny writes outside assigned projects and on out-of-scope fields/entities. `time_logs` denied to clients entirely. **Exact write boundaries are TBD (clarified 2026-06-17, not yet finalized) — confirm with the owner before building these policies.**
- `story_points`: RLS can't hide a column — expose a `tasks_client` view omitting `story_points` (or column GRANTs) for reads, and ensure client story inserts never set `story_points`; owner reads the base table. Finalize the choice here.

### Handoff: Tasks 13.4–13.6 — Auth flow & role-split UI
**Assigned to:** skill:frontend-design
**Depends on:** 13.1–13.3
**Design ref:** `FB-6-CLIENT-ACCESS.md` §4.

- Login page + session handling (auth listener, sign-out); gate the `src/App.tsx` router behind a session.
- Owner → existing full `AppShell`/routes. Client → scoped shell: boards/status, roadmap/Gantt, comments & people. **Expose** the comment box, attachment upload, and a constrained story-creation flow (no story-point field). **Hide** time-tracking UI, story-point fields, settings/seed/staging tooling, and any owner-only edit/DnD surfaces. (Exact client write surface is TBD — keep the gating data-driven so it's easy to tighten/loosen.) Project switcher scoped to accessible projects.
- Owner-only client-management screen: create client accounts and toggle their `client_project_access`.

### Handoff: Task 13.7 — RLS integration tests
**Assigned to:** skill:qa-engineer
**Depends on:** 13.1–13.6

- Automated tests with two Supabase sessions (owner + client): client **can** read assigned projects and perform allowed writes there (insert comment, insert attachment, create story); **cannot** read or write other projects; **cannot** write out-of-scope fields/entities (e.g. set `story_points`, edit owner-only fields, touch `time_logs`); never receives `time_logs`/`story_points` on reads.

### Handoff: Task 14.1 — Realtime live updates
**Assigned to:** skill:data-layer
**Depends on:** Phase 13
**Design ref:** `FB-6-CLIENT-ACCESS.md` §5.

- Subscribe to Supabase Realtime on tasks/sprints/comments; invalidate the matching React Query keys (`taskKeys.all`, etc.). Fallback: refetch-on-focus + interval. Replaces the desktop `notify()` flow.

### Handoff: Task 14.2 — Retire Tauri
**Assigned to:** skill:backend-engineer
**Depends on:** Phase 12 (data seam off Tauri)
**Design ref:** `FB-6-CLIENT-ACCESS.md` §6.

- Remove `src-tauri/`, Tauri plugins, and all remaining `@tauri-apps/*` imports (now only in `commands.ts`/`notifications.ts`/`image.ts`). Replace `isStagingBuild`/`seedDemoData` desktop hooks with env-based equivalents or drop.

### Handoff: Tasks 14.3–14.4 — Data migration
**Assigned to:** skill:backend-engineer (+ skill:qa-engineer for verification)
**Depends on:** Phase 11, 12.3
**Design ref:** `FB-6-CLIENT-ACCESS.md` §7.

- One-time script: read existing local SQLite (`tasks`, `projects`, …) → insert into Supabase **preserving IDs** so FKs and `task_number` keys stay stable; upload attachment files to Storage.
- Verify: row counts and `{key}-{task_number}` task keys match between old SQLite and Supabase.

### Handoff: Tasks 15.1–15.5 — Hosting & infra
**Assigned to:** skill:backend-engineer
**Depends on:** Phase 12, Phase 13
**Design ref:** `FB-6-CLIENT-ACCESS.md` §8 + gotchas 7, 8.

- Provision the Hostinger VPS (KVM 2 floor / KVM 4 headroom); Docker + docker-compose; run self-hosted Supabase; expose only nginx + SSH; firewall + basic monitoring.
- nginx reverse proxy for the 5-app fleet (route `flowboard.<domain>` + 4 others; serve the static Vite build). SSL via Certbot with auto-renew cron.
- **Backups are non-optional (VPS has none):** scheduled `pg_dump` + off-site copy with a tested restore. Outbound auth-email via a free SMTP relay (Mailgun/SendGrid/Brevo), not the VPS IP.
- **Ops ownership:** OS + Supabase stack patching are yours; budget recurring time.

### Handoff: Task 15.6 — Deploy smoke test & DoD
**Assigned to:** skill:qa-engineer
**Depends on:** 15.1–15.5

- Owner + client both log in on the hosted URL. Manual client walkthrough: only assigned projects' boards/roadmap/comments; no edit controls, DnD, time, or points; live update appears when the owner changes a task. CI keeps `tsc --noEmit` + Vitest green.

---

**FB-6 Definition of Done (all phases):** Access control enforced entirely by RLS (never the client); owner parity preserved (`npx vitest run` green, `tsc --noEmit` clean); clients are project-scoped with their allowed writes (comments, attachments, story creation) working **only** in assigned projects and all out-of-scope reads/writes denied, with `time_logs`/`story_points` never exposed; automated, off-site, restore-tested backups in place; CLAUDE.md/DECISIONS.md reflect the hosted pivot.