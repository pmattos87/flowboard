# FlowBoard — Build Plan

**This file contains only the phased task list and agent handoff messages.**

---

## Phased Task List

### Phase 1 — Scaffold & Infrastructure
> **Git Setup:** Ensure you are on `phase/1-infrastructure` before beginning.
- **Task 1.1** Init Tauri v2 + React + TypeScript + Vite project → `backend-engineer`
- **Task 1.2** Configure Tailwind, shadcn/ui, Zustand, React Query, `@/` alias → `backend-engineer`
- **Task 1.3** Initialize SQLite schema with migrations → `backend-engineer`
- **Task 1.4** Tauri Rust CRUD commands for all entities → `backend-engineer`
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
- **Task 4.4** File attachments → `backend-engineer`
- **Task 4.5** Time tracking → `skill:frontend-design`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/4-task-engine`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v0.4-tasks -m "Phase 4 Complete: Core task CRUD, commenting, and file mechanics" && git push origin v0.4-tasks`

### Phase 5 — Board Views
> **Git Setup:** git checkout main && git pull && git checkout -b phase/5-boards
- **Task 5.1** User Story Board → `skill:frontend-design`
- **Task 5.2** Task Board → `skill:frontend-design` + `backend-engineer` (DnD)
- **Task 5.3** Discovery Board → `skill:frontend-design`
- **Task 5.4** Sprint Planning Board → `skill:frontend-design`
- **Task 5.5** Drag & drop between columns → `backend-engineer`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/5-boards`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v0.5-boards -m "Phase 5 Complete: Interactive agile board views with DnD tracking" && git push origin v0.5-boards`

### Phase 6 — Roadmap
> **Git Setup:** git checkout main && git pull && git checkout -b phase/6-roadmap
- **Task 6.1** Gantt-style roadmap → `backend-engineer`
- **Task 6.2** Draggable bars + today indicator → `backend-engineer`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/6-roadmap`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v0.6-roadmap -m "Phase 6 Complete: Gantt roadmap timeline visualizer" && git push origin v0.6-roadmap`

### Phase 7 — Reports
> **Git Setup:** git checkout main && git pull && git checkout -b phase/7-analytics
- **Task 7.1–7.4** All charts (Burndown, Velocity, Status, Workload) → `skill:frontend-design`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/7-analytics`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v0.7-reports -m "Phase 7 Complete: Burndown and analytics reporting dashboards" && git push origin v0.7-reports`

### Phase 8 — Inbox & Notifications
> **Git Setup:** git checkout main && git pull && git checkout -b phase/8-notifications
- **Task 8.1** Inbox page → `skill:frontend-design`
- **Task 8.2** Native OS notifications → `backend-engineer`
- **Task 8.3** Notification bell badge → `skill:frontend-design`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/8-notifications`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v0.8-alerts -m "Phase 8 Complete: Notification center and native OS toast messaging" && git push origin v0.8-alerts`

### Phase 9 — Polish & UX
> **Git Setup:** git checkout main && git pull && git checkout -b phase/9-polish
- **Task 9.1** Empty states, loading skeletons, error toasts → `skill:frontend-design`
- **Task 9.2** Keyboard shortcuts → `skill:ux-engineer`
- **Task 9.3** Global search → `skill:ux-engineer`
- **Task 9.4** App icon, window title, about page → `backend-engineer`
> **Phase Exit Criteria:** Push the phase branch (`git push origin phase/9-polish`), open a Pull Request into `main`, and merge it via the GitHub UI. After merge: `git checkout main && git pull && git tag -a v1.0.0 -m "FlowBoard MVP Launch Release" && git push origin v1.0.0`

---

## Agent Handoff Messages

### Handoff: Task 1.1 — Project Scaffold
**Assigned to:** backend-engineer  
**Depends on:** —

- `create-tauri-app` with React + TypeScript + Vite template
- Frontend deps: `tailwindcss`, `@tailwindcss/vite`, `shadcn-ui`, `zustand`, `@tanstack/react-query`, `@dnd-kit/core`, `@dnd-kit/sortable`, `recharts`, `lucide-react`, `clsx`, `tailwind-merge`
- Tauri plugins: `tauri-plugin-sql` (SQLite feature), `tauri-plugin-fs`, `tauri-plugin-notification`
- Tailwind `darkMode: 'class'`; apply `dark` class to `<html>` permanently
- Vite `@/` → `src/` alias mirrored in `tsconfig.json`
- Output: running skeleton confirming `bg-gray-950` dark background

### Handoff: Task 1.2 — Frontend Tooling Configuration
**Assigned to:** backend-engineer  
**Depends on:** 1.1

Configure all frontend tooling...

*(Configuration details remain as in previous version — Tailwind, shadcn/ui, Zustand, React Query, path alias, types, etc.)*

### Handoff: Task 1.3 — SQLite Schema & Rust Commands
**Assigned to:** backend-engineer  
**Depends on:** 1.1

Schema and all nullable FK rules are in **CLAUDE.md § SQLite Schema**...

### Handoff: Task 1.4 — Tauri Rust CRUD Commands
**Assigned to:** backend-engineer  
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
**Assigned to:** backend-engineer  
**Depends on:** 4.2, 1.3, 1.4

### Handoff: Task 4.5 — Time Tracking
**Assigned to:** skill:frontend-design  
**Depends on:** 4.2, 2.1

### Handoff: Task 5.1 — User Story Board
**Assigned to:** skill:frontend-design  
**Depends on:** Phase 4

### Handoff: Task 5.2 — Task Board
**Assigned to:** skill:frontend-design + backend-engineer (backend DnD support)  
**Depends on:** Phase 4

### Handoff: Task 5.3 — Discovery Board
**Assigned to:** skill:frontend-design  
**Depends on:** Phase 4

### Handoff: Task 5.4 — Sprint Planning Board
**Assigned to:** skill:frontend-design  
**Depends on:** Phase 4, 3.2

### Handoff: Task 5.5 — Drag & drop between columns
**Assigned to:** backend-engineer  
**Depends on:** 5.1–5.4

### Handoff: Tasks 6.1–6.2 — Roadmap
**Assigned to:** backend-engineer  
**Depends on:** Phase 3

### Handoff: Tasks 7.1–7.4 — Reports
**Assigned to:** skill:frontend-design  
**Depends on:** Phase 5

### Handoff: Task 8.1 — Inbox Page
**Assigned to:** skill:frontend-design  
**Depends on:** 2.2, 2.1

### Handoff: Task 8.2 — Native Notifications
**Assigned to:** backend-engineer  
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
**Assigned to:** backend-engineer  
**Depends on:** 1.1

---

**Post-Phase 9 Recommendations:**
- Run full regression suite via `skill:qa-engineer`
- Final visual polish pass via `skill:frontend-polish`
- Documentation sync via `skill:docs-architect`

**Definition of Done (all tasks):** Matches CLAUDE.md constraints, agent-specific rules, passes `tsc --noEmit`, includes proper loading/empty states, and respects dark-mode-only design.