# FlowBoard — Project Reference (CLAUDE.md)

> **Canonical reference for all agents and skills.**

---

## What This Project Is

FlowBoard is a **single-user, local-first desktop project management application** inspired by Jira. Built with **Tauri v2 + React 18 + TypeScript + Vite**, targeting Windows. All data is stored in a local SQLite database via `tauri-plugin-sql`. No server, no authentication, no cloud sync.

### Logo Assets
Primary logo: `/assets/logo.png`
Logo with no background: `/assets/logo_background.png`

---

## Coding Behavior Guidelines

### 0. Pre-flight (do this before every task)
- Read `/docs/LESSONS.md` in full.
- Check if any entry is relevant to this task's scope.
- If yes, state which lessons apply and how you'll avoid repeating them. 

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Desktop shell | Tauri v2 (Rust backend) |
| Frontend framework | React 18 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS (`darkMode: 'class'`) + shadcn/ui |
| Global state | Zustand (UI state only — modals, filters, selections) |
| Async / cache | React Query (@tanstack/react-query) |
| Database | SQLite via `tauri-plugin-sql` |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Charts | Recharts |
| Icons | Lucide React |
| File storage | Local filesystem via `tauri-plugin-fs` (paths saved in SQLite) |
| Notifications | `tauri-plugin-notification` (native OS) |
| Path aliases | `@/` → `src/` |

**Do not introduce alternative libraries for any of the above without explicit approval.**

---

## Non-Negotiable Constraints

1. **Dark mode only.** Default and only theme. Background palette: `bg-gray-950` (sidebar), `bg-gray-900` (main content), `bg-gray-800` (cards/surfaces). No light-mode toggle.
2. **Local-only data.** No HTTP calls to external servers. No auth, no user accounts.
3. **TypeScript strict mode.** All frontend code must be fully typed. No `any` unless unavoidable and commented.
4. **Tauri commands are the only data access layer.** React never reads SQLite directly — always calls a typed Tauri command and receives JSON back.
5. **React Query manages all server state.** Zustand is for UI state only. Do not store fetched data in Zustand.
6. **`@dnd-kit` for all drag-and-drop.** No other DnD library.

---

**Database Schema:** See `SCHEMA.md` for the complete SQLite table definitions and rules.
**TypeScript Types:** See `TYPES.md`
**Visual & UX Reference:** See `VISUAL.md`

---

## Git Workflow & Repository Rules

### 1. Branching Strategy
- **Never code directly on `main` or `dev`.**
- Always verify your active branch before editing files. 
- Create/use short-lived feature or phase branches named: `[phase-number]/[task-number]-[short-description]` (e.g., `phase-1/task-4.4-file-attachments`).

### 2. Commit Message Naming Conventions
Commits must be granular (one per sub-task) and use the following semantic prefixes:
- `feat(rust/sqlite/tauri):` for Rust backend, SQLite schema, or Tauri command changes.
- `feat(ui):` for React components, Tailwind styling, or UI state layout.
- `feat(data):` for Zustand stores, React Query hooks, or data layer wrappers.
- `fix(scope):` for bug fixes (specify `ui`, `tauri`, or `data`).
- `chore(repo):` for updating configuration files, dependencies, or `.md` files.

*Example:* `feat(sqlite): init sqlite schema and migration helpers (task 1.3)`

### 3. Agent Safety & Error Recovery Rule

- If a command execution fails (`tsc` throws compilation errors, or a test breaks) and cannot be resolved cleanly within 2 iterations, the agent must stop, notify the user, and **must not** commit broken code. If instructed to abort, use `git reset --hard HEAD` to restore the last clean commit state.
- Any task that triggers the 2-iteration error recovery rule (git reset --hard) 
MUST produce a LESSONS.md entry before the task is re-attempted.
- If a LESSONS.md entry invalidates a prior decision, also update DECISIONS.md.

---

## File & Folder Conventions

```
src/
  components/      # Reusable UI components
  features/        # Feature-scoped modules (board/, sprints/, tasks/, …)
  hooks/           # React Query hooks (useProjects, useTasks, …)
  stores/          # Zustand stores (uiStore.ts, filterStore.ts, …)
  lib/             # Shared utilities, Tauri command wrappers
  types/           # TypeScript interfaces (mirrors schema above)
src-tauri/
  src/
    commands/      # One file per entity (projects.rs, tasks.rs, …)
    db/            # Schema init & migration helpers
    main.rs
```

---

## Agent Registry

**Directory:**  `docs/agents/`

| Agent | File | Primary Focus | Model | Rationale |
|-------|------|---------------|-------|-----------|
| `skill:frontend-design` | [frontend-design.md](./frontend-design.md) | All React UI, layouts, boards, charts, modals | `claude-sonnet-4-6` | Well-specified execution tasks; broad output volume across phases |
| `skill:backend-engineer` | [backend-engineer.md](./backend-engineer.md) | Rust backend, Tauri, SQLite, Gantt, file I/O | `claude-opus-4-7` | Rust/Tauri architecture, SQLite schema design, complex file I/O — high-judgment, hard-to-reverse decisions |
| `skill:data-layer` | [data-layer.md](./data-layer.md) | Zustand, React Query, command wrappers, caching | `claude-opus-4-7` | Load-bearing layer; React Query/Zustand separation errors propagate to every subsequent phase |
| `skill:ux-engineer` | [ux-engineer.md](./ux-engineer.md) | Keyboard shortcuts, search, command palette, accessibility | `claude-sonnet-4-6` | Interaction patterns are well-scoped in handoffs |
| `skill:qa-engineer` | [qa-engineer.md](./qa-engineer.md) | Testing, Definition of Done enforcement | `claude-opus-4-7` | Requires holistic reasoning across the full codebase to assess correctness |
| `skill:frontend-polish` | [frontend-polish.md](./frontend-polish.md) | Animations, micro-interactions, a11y, final polish | `claude-sonnet-4-6` | Refinement work on already-existing components |
| `skill:docs-architect` | [docs-architect.md](./docs-architect.md) | Documentation & type synchronization | `claude-sonnet-4-6` | Documentation and type sync — low ambiguity |

**Usage:** When handing off work, attach the relevant agent file(s) + the main `CLAUDE.md`. Always invoke each agent with its assigned model above — do not substitute models without explicit approval.

---

## Testing Strategy

### Testing Scope
- **Unit Tests** (`__tests__/`) – Vitest + React Testing Library
  - All React Query hooks
  - Zustand stores
  - Individual UI components (especially boards and modals)
- **Integration Tests**
  - Full create → update → delete flows
  - Drag & drop simulation (where possible)
  - Tauri command roundtrips (mocked)
- **Manual Regression Testing** (mandatory after Phase 5)
  - All four board views
  - Drag & drop across columns and stories
  - Task Detail panel real-time updates
  - Dark mode visual consistency

### Tools
- Vitest + React Testing Library + `@testing-library/jest-dom`
- Playwright (optional for E2E after MVP)
- TypeScript `tsc --noEmit` + ESLint in CI

### Quality Gates (per task)
1. All new code covered by appropriate tests (where feasible)
2. `tsc --noEmit` passes with zero errors
3. No visual regressions in dark mode
4. All Tauri commands return proper typed responses
5. React Query cache behaves correctly after mutations

---

## Definition of Done (per task)

1. Feature renders correctly in dark mode without layout breaks.
2. All Tauri commands called through typed wrappers in `src/lib/`.
3. React Query cache invalidated after every mutation.
4. No TypeScript errors (`tsc --noEmit` passes).
5. Feature matches the visual reference in this document or its specific handoff prompt.
6. **Automated test suite passes:** `npx vitest run` exits with zero failures. New behavior must be covered by a test in `src/__tests__/`.
7. **Git Verification:** Code compiles, tests pass, and changes are committed to the local feature/phase branch using proper semantic commit prefixes. Never leave unstaged changes upon task completion.
8. **Lessons log:** If this task required a `git reset`, a constraint violation was caught in review, or a doc gap forced a guess — append one row to `LESSONS.md` before committing. If nothing went wrong, skip it.

---