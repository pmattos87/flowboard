# FlowBoard — Progress

**Last Updated:** June 17, 2026

**Status:** v1.4.0 shipped — 2026-06-17 (desktop app, frozen as the stable line at tag `v1.4.0`)
**Overall Completion:** 31/31 tasks shipped across Phases 1–10; point releases 1.1.0–1.4.0 added standalone features (project logos FB-41, attachment BLOB storage, board refresh, sidebar DnD FB-51, sprint ordering FB-50, themed scrollbars FB-53)
**Next:** Epic FB-6 — hosted web-app migration (Phases 11–15, **plan only — not started**)

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

## Epic FB-6 — Client Access (Hosted Web App Migration)
> Design doc: [`FB-6-CLIENT-ACCESS.md`](./FB-6-CLIENT-ACCESS.md) · Plan: [`PLAN.md`](./PLAN.md) Phases 11–15 · Branching: [`DECISIONS.md`](./DECISIONS.md) D-011
> **Status:** PLAN ONLY — not started in code. Migrates the local-first Tauri desktop app to a hosted, multi-tenant Supabase web app. All work happens on the long-lived `epic/fb-6-web` integration branch (not yet created); only the completed migration merges back to `main` as `v2.0.0`. The desktop line stays recoverable at tag `v1.4.0`.

### Phase 11 — Docs Reset & Supabase Schema (WS0 + WS1)
- [ ] **11.1** Constraints reset: rewrite CLAUDE.md non-negotiables, add `DECISIONS.md` pivot entry, vendor design doc → `skill:docs-architect`
- [ ] **11.2** Port `SCHEMA.md` to Postgres migrations with FK cascade rules + numeric IDs → `skill:backend-engineer`
- [ ] **11.3** Re-implement Rust server-side logic as Postgres triggers/functions (task numbering, `updated_at`, story→child sprint cascade) → `skill:backend-engineer`
- [ ] **11.4** Multi-tenancy tables: `profiles` + `client_project_access` → `skill:backend-engineer`
- [ ] **11.5** pgTAP/SQL unit tests for each trigger/function → `skill:qa-engineer`
> Exit: local self-hosted Supabase mirrors current data shape with logic ported & tested. Tag `v2.0-schema` on `epic/fb-6-web`.

### Phase 12 — Data-Layer Swap to Supabase (WS3)
- [ ] **12.1** Add `@supabase/supabase-js`; create `src/lib/supabase.ts` client → `skill:data-layer`
- [ ] **12.2** Re-implement all ~30 `src/lib/commands.ts` wrappers against Supabase with identical signatures → `skill:data-layer`
- [ ] **12.3** Attachments → Supabase Storage (object path + signed URL; client-writable) → `skill:backend-engineer`
- [ ] **12.4** Re-point test suite: mock Supabase client instead of `invoke`; hooks unchanged → `skill:qa-engineer`
> Exit: owner app runs end-to-end against Supabase; Vitest green, `tsc --noEmit` clean. Tag `v2.0-datalayer`.

### Phase 13 — Auth & Multi-Tenancy / RLS + Role Split (WS2 + WS4)
- [ ] **13.1** Enable email/password auth; seed owner account; document client provisioning → `skill:backend-engineer`
- [ ] **13.2** RLS policies: owner full access; client scoped read + scoped write; `time_logs` denied to clients → `skill:backend-engineer`
- [ ] **13.3** `story_points` hiding via `tasks_client` view or column GRANTs → `skill:backend-engineer`
- [ ] **13.4** Auth UI: login/session handling → `skill:frontend-design`
- [ ] **13.5** Role-aware UI: owner full `AppShell`; client scoped shell (no time/points/settings/DnD) → `skill:frontend-design`
- [ ] **13.6** Owner-only client-management screen (accounts + `client_project_access` toggles) → `skill:frontend-design`
- [ ] **13.7** Two-session RLS integration tests (owner + client) → `skill:qa-engineer`
> Exit: clients log in, see only assigned projects, perform allowed writes there only; RLS proven by tests. Tag `v2.0-auth`.

### Phase 14 — Realtime, Tauri Retirement & Data Migration (WS5 + WS6 + WS7)
- [ ] **14.1** Supabase Realtime subscriptions → invalidate matching React Query keys → `skill:data-layer`
- [ ] **14.2** Retire Tauri: remove `src-tauri/`, plugins, all `@tauri-apps/*` imports → `skill:backend-engineer`
- [ ] **14.3** One-time migration script: local SQLite → Supabase preserving IDs; upload attachments to Storage → `skill:backend-engineer`
- [ ] **14.4** Tests: row counts + task keys match; live update verified → `skill:qa-engineer`
> Exit: live updates work, Tauri shell gone, data migrated with matching keys/counts. Tag `v2.0-migration`.

### Phase 15 — Hosting & Deployment (Hostinger VPS) (WS8)
- [ ] **15.1** Provision VPS; Docker + self-hosted Supabase; lock down ports; firewall + uptime monitoring → `skill:backend-engineer`
- [ ] **15.2** nginx reverse proxy for the 5-app fleet; build & serve Vite SPA static → `skill:backend-engineer`
- [ ] **15.3** SSL via Certbot/Let's Encrypt with auto-renew → `skill:backend-engineer`
- [ ] **15.4** Backups: scheduled `pg_dump` + off-site copy with tested restore → `skill:backend-engineer`
- [ ] **15.5** Outbound email via free SMTP relay for auth deliverability → `skill:backend-engineer`
- [ ] **15.6** Deploy smoke test + DoD: owner & client log in on hosted URL; client walkthrough → `skill:qa-engineer`
> Exit: hosted FlowBoard live behind nginx+SSL with tested backups. **Promote `epic/fb-6-web → main`** (the one `main`-bound merge) and tag `v2.0.0` on `main`.

---

## Current Focus / In Progress
- None in code — desktop app stable at v1.4.0 on `main`. Epic FB-6 (Phases 11–15) is **planned but not started**; `epic/fb-6-web` branch not yet created. Next action is Phase 11 / Task 11.1 (docs constraints reset).

## Blockers / Notes
- FB-6 client write boundaries (which fields, edit vs. create-only, which entities) are **TBD — to be refined before Phase 13 build** (see PLAN.md FB-6 intro).
- Test/typecheck baseline green as of v1.4.0 release.

## Recent Completions
- 1.1.0–1.4.0 point releases (project logos FB-41, attachment BLOB storage, board refresh buttons, sidebar project DnD FB-51, sprint section ordering FB-50, dark-theme scrollbars FB-53)
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
