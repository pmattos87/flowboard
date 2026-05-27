# FlowBoard — Architectural & Design Decisions

> **Canonical record of "why" behind major choices.**  
> This document is established **before implementation begins**.  
> Last updated: 2026-05-21

## Decision Log

### D-001: Project Foundation — Tauri v2 + React + SQLite (2025-11)
**Status:** Accepted  
**Context:** Need a lightweight, local-first desktop project management tool for Windows.  
**Decision:** Use **Tauri v2** (Rust backend) + **React 18 + TypeScript + Vite** frontend + `tauri-plugin-sql` (SQLite).  
**Rationale:** 
- Native performance and tiny bundle size.
- True local-only data with full user control and privacy.
- Excellent Rust ↔ TypeScript interop via commands.
- Avoids Electron’s memory/ size overhead.  
**Consequences:** All data operations must go through typed Tauri commands. No direct DB access from frontend.

### D-002: Dark Mode Only (2025-11)
**Status:** Accepted  
**Context:** Modern productivity tool targeting focused work.  
**Decision:** Hard-coded **dark theme only** (`bg-gray-950`, `bg-gray-900`, `bg-gray-800`). No light mode.  
**Rationale:** Simpler maintenance, stronger visual identity, better for long sessions.  
**Consequences:** `dark` class permanently applied to `<html>`. All components designed exclusively for dark palette.

### D-003: State Management Separation (2025-12)
**Status:** Accepted  
**Context:** Complex boards with frequent updates.  
**Decision:** 
- **React Query (@tanstack/react-query)** for all data fetching, caching, and mutations.
- **Zustand** exclusively for UI state (modals, active project, filters, selections).  
**Rationale:** Clear separation of concerns. React Query is ideal for async Tauri command patterns.  
**Consequences:** Fetched data never stored in Zustand.

### D-004: UI Component Strategy (2025-11)
**Status:** Accepted  
**Context:** Need high design control and consistency.  
**Decision:** Strictly use **shadcn/ui** + **Tailwind CSS** + **Lucide React** icons. No other UI libraries.  
**Rationale:** Complete customization, excellent dark mode support, tree-shakable, and matches the detailed visual spec.  
**Consequences:** All components live in `src/components/` or feature-scoped folders.

### D-005: Drag & Drop (2025-12)
**Status:** Accepted  
**Context:** Multiple Kanban-style boards (including nested stories/tasks).  
**Decision:** `@dnd-kit/core` + `@dnd-kit/sortable`.  
**Rationale:** Modern, accessible, highly flexible, and strong React 18 support.  
**Consequences:** All drag-and-drop interactions and backend updates built around this library.

### D-006: Data Schema & Types (2025-11)
**Status:** Accepted  
**Context:** Need strong consistency between backend and frontend.  
**Decision:** Mirror SQLite schema exactly in Rust structs and TypeScript interfaces (`src/types/index.ts`).  
**Rationale:** Type safety across the entire stack and easier maintenance.  
**Consequences:** Nullable foreign keys (`Option<i64>` / `number | null`) handled explicitly everywhere.

### D-007: Labels & Attachments Storage (2025-12)
**Status:** Accepted  
**Decision:** 
- Task labels: comma-separated string in SQLite.
- Attachments: files copied to `{appDataDir}/attachments/{task_id}/` with metadata in DB.  
**Rationale:** Simplicity for local-first MVP. Easy to evolve later.  
**Consequences:** Parsing logic in frontend; file system operations in Rust backend.

### D-008: No External Services or Cloud (2025-11)
**Status:** Accepted  
**Decision:** 100% local-only. No auth, no sync, no telemetry.  
**Rationale:** Core product value is privacy, simplicity, and offline-first experience.  
**Consequences:** Feature scope limited to what works well locally.

### D-009: Per-Project Task Numbering (2026-05)
**Status:** Accepted
**Context:** `tasks.id` is a globally-unique SQLite rowid and makes a poor user-facing identifier (gaps between projects, large numbers, no project context). Users expect Jira-style keys like `P1-1`, `P1-2`.
**Decision:** Introduce a second column `tasks.task_number INTEGER NOT NULL` assigned per-project on insert, with `UNIQUE(project_id, task_number)` enforced by `idx_tasks_project_number` (migration `002_task_number.sql`). The internal primary key `tasks.id` is unchanged; all foreign keys continue to reference `tasks.id`. The UI renders keys as `{projects.key}-{tasks.task_number}`.
**Rationale:** Cleanest separation between internal identity and user-facing identity. Doesn't disturb any existing FK. Uniqueness scoped to `project_id` matches how users think about keys.
**Consequences:** `seed_demo_data` and any future bulk insert must compute the next per-project sequence. Existing rows were backfilled by the migration via a self-join count.

### D-010: Story → Child Sprint Cascade (2026-05)
**Status:** Accepted
**Context:** Phase 10 introduced the Project > Sprint > Story > Task hierarchy on boards. If a story's `sprint_id` could change independently of its children, board groupings and the Sprint Planning backlog would tear (a story in Sprint A with task children in Sprint B is meaningless to the user).
**Decision:** When `update_task` sets `tasks.sprint_id` on a row whose `type = 'story'`, the same SQL transaction also runs `UPDATE tasks SET sprint_id = ?, updated_at = ? WHERE parent_id = ?` to move all direct children. Atomic — either both update or neither.
**Rationale:** Keeps the hierarchy invariant enforced at the data layer rather than relying on the UI to remember to cascade. Cheap (one extra UPDATE per story mutation) and impossible to forget at higher layers.
**Consequences:** Story mutations now write to all of a story's children. Rust unit tests in `commands::tasks::tests` lock the cascade behavior (fires for stories, does not fire for non-story types, atomic on failure). Children of a non-story task are not cascaded — only stories cascade.

## Rejected Decisions

- **Electron** — heavier runtime and larger distribution size.
- **Any cloud backend / Supabase / Firebase** — breaks local-first promise.
- **Prisma / TypeORM** — overkill for SQLite + Tauri use case.
- **Light mode support** — unnecessary scope increase.
- **Third-party Gantt or Kanban libraries** — prefer custom control for styling and behavior.

---

**Decision Process:** All foundational decisions were made during project definition phase by the combined input of `docs-architect`, `frontend-design`, and `backend-engineer` roles. Future changes must be recorded here with status, rationale, and consequences.