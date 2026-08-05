# FlowBoard — Agent Lessons Learned

> **All agents must read this file before starting any task.**
> See CLAUDE.md § Pre-flight for the mandatory reading protocol.
>
> **Append-only.** Never edit or delete existing entries.
> Add new rows to the relevant table. If a lesson invalidates a prior
> architectural decision, also update `DECISIONS.md` with status `Superseded`.

---

## How to Append

Choose the correct table based on what happened:

| Situation | Table |
|---|---|
| You wrote code that had to be revised or reset | Execution Mistakes |
| A doc was silent or ambiguous and you guessed wrong | Documentation Gaps |
| The same mistake appeared in a second task | Recurring Patterns |

One row per incident. Be specific — vague entries help no one.

---

## Execution Mistakes

Errors an agent made during implementation that required correction or rework.

| Phase/Task | Agent | What Went Wrong | Root Cause | Fix Applied | Doc Updated? |
|---|---|---|---|---|---|
| Phase 5 / Tasks 5.2–5.4 | frontend-design | DnD cards "disappeared" on drop; DB never updated. Two prior fix attempts (optimistic cache patching, then local `statusOverrides`) failed to address the actual cause. | `KanbanColumn` (and `SprintPlanningBoard.DroppablePanel`) replaced the dragged `TaskCard` with a placeholder `<div>` while it was being dragged. That unmounted the source `TaskCard`'s `useDraggable`, clearing its `data.current = { task }` registration mid-drag. On drop, `active.data.current` was `undefined`, so reading `.task` threw before the mutation could fire. The card vanished because the handler crashed before `setStatusOverrides`/`mutate`. | Render the drag placeholder *inside* the same `TaskCard` (returned early when `useDraggable().isDragging` is true), keeping `setNodeRef` attached and `data.current` alive for the full drag lifecycle. Removed `activeTaskId` placeholder-swap from `KanbanColumn` and `DroppablePanel`. Renamed `TaskCard`'s `isDragging` prop to `isOverlay` to distinguish "I am the floating clone in DragOverlay" from `useDraggable`'s own `isDragging` (source-card drag state). | Yes — this row + Recurring Patterns row. |
| Phase 6 follow-up / fix/kanban-dnd-test-mock | claude-sonnet-4-6 | Resolution of skipped KanbanBoard DnD test (see Phase 6 row below). Two distinct scaffolding bugs, not one: (1) `PointerSensor.activators` in `@dnd-kit/core` v6 guards on `event.isPrimary && event.button === 0` before starting a drag; jsdom constructs `PointerEvent` with `isPrimary = false` by default, so the sensor returned immediately — confirmed by 0 `getBoundingClientRect` calls during drag events; (2) `@dnd-kit`'s `AnimationManager` defers state updates asynchronously, so a synchronous `expect(mockInvoke).toHaveBeenCalledWith(...)` always sees 0 calls even after the sensor was fixed. | The `className` substring (`min-h-[120px]`) and column header text mapping were correct all along — the suspected class-string drift did not apply. The failure was upstream of collision detection: the sensor never activated at all. | Added `isPrimary: true` to `fireEvent.pointerDown` (one property, no production-code change). Wrapped assertion in `waitFor`. Removed `it.skip`. 2 tests pass, 175 total pass, `tsc --noEmit` clean. See `fix/kanban-dnd-test-mock`. | Yes — this row. |
| FB-36 follow-up / fix/migration-fk-off | claude-opus-4-8 | Migration `003_status_canceled.sql` rebuilt the `tasks` table (DROP + recreate to change a CHECK constraint). On the live DB it **orphaned all 50 tasks** (`parent_id` → NULL) and cascade-deleted every `comments`/`time_logs`/`attachment`/`activity_log` row. The migration tried to protect against this with a `-- no-transaction` directive plus an in-SQL `PRAGMA foreign_keys = OFF`. Both were inert on SQLite. | `sqlx-sqlite` 0.8.6's `Migrate::apply` (`sqlx-sqlite/src/migrate.rs:136`) **always** wraps the migration in `self.begin()`/`tx.commit()` and never checks `migration.no_tx` — the `-- no-transaction` flag is honored only by the Postgres driver. Inside that transaction `PRAGMA foreign_keys` is a silent no-op (SQLite rule), so FK enforcement stayed ON (set via `.foreign_keys(true)` on the pool). `DROP TABLE tasks` then performed an implicit DELETE that fired `ON DELETE SET NULL` on the self-reference `tasks_new.parent_id REFERENCES tasks(id)` and `ON DELETE CASCADE` on the child tables. | FK enforcement must be disabled **at connect time**, before the migration transaction begins — not in the migration SQL. `db::init_pool` now opens a dedicated migration connection with `.foreign_keys(false)`, runs `sqlx::migrate!`, closes it, then builds the runtime pool with `.foreign_keys(true)`. Removed the now-redundant `migrate!` call from `lib.rs`. Migration `003` SQL was left untouched (already applied; editing it would break sqlx checksum validation) — its in-SQL PRAGMAs are now harmless no-ops. Recovery was via a user-held pre-`003` backup restored under the fixed code. | Yes — this row. |
| FB-90 / sprint gate on the detail panel | claude-opus-5 | FB-90 added the "Ready for Development" gate to the task detail panel's Sprint picker, but mirrored only the *guard* from the Sprint Planning Board — not the *status transition* that the board's drop performs on the same move. A story given a sprint from the panel kept `ready_for_development` while sitting inside the sprint. `UserStoryBoard` renders the dev-workflow `COLUMNS` and builds each column with `effectiveTasks.filter(t => t.status === col.status)`, so the story matched no column and rendered nowhere: present in the sprint on the planning board, absent from the story board, with no empty state or warning. Found by the user against staging data (MOB-8, MOB-12), not by the suite. | Treated `isSprintScheduleBlocked` as the whole of "assign a sprint". The board's drop path is two things — that guard *plus* `computeSprintDropPayload`, which moves the row between the discovery and dev lifecycles. Only the first was reused. Nothing caught it: no test asserted the `status` half of the panel's payload, and `KanbanBoard` silently omits a task whose status matches no column instead of surfacing it. | Panel now reuses `computeSprintDropPayload`, so both paths make the same lifecycle move in both directions. Status transitions inside that function are gated on `type === "story"` — the panel, unlike the board, also sees tasks and bugs, and resetting a half-finished bug to `todo` for joining a sprint would be a new bug. Tests assert the full payload (`sprint_id` + `status`) for schedule, unschedule, and a non-story. | Yes — this row, the Recurring Patterns entry below, and CHANGELOG 1.5.1. |
| Phase 6 / pre-commit verification | backend-engineer | Stale jsdom rect-mock in KanbanBoard DnD test. `src/__tests__/features/KanbanBoard.dnd.test.tsx > invokes update_task with the new status after a cross-column drag` went red. `mockInvoke` was never called — verified by re-running on commit `70894ae` (pre-Phase-6 tip) where it also fails, so the failure pre-existed Phase 6 and was not caused by the new `DndContext` in the Roadmap page. The production fix it guards (TaskCard keeps `setNodeRef` mounted during drag) is still in place. | The test scaffolding (not the production code) is the source. The test's `stubBoundingRects()` helper greps element `className` for `min-h-[120px]` to identify column drop-zones, then assigns deterministic non-zero rects per column so `@dnd-kit`'s collision detection can resolve which column the pointer is over. Some upstream change — most likely a class-string adjustment on KanbanColumn (e.g., `min-h-[140px]`, rearranged Tailwind classes, removal of `min-h-` in favor of `h-`), a change in how header text is rendered, or a `@dnd-kit` PointerSensor behavior change — has caused that grep to no longer match, so all rects collapse to the fallback 200×80 and collision detection fails silently. The test's own docstring (lines 21–25) warned of this exact category of breakage. | TEMPORARY: marked the failing case `it.skip` with an in-file `SKIPPED` comment that names the suspected culprits and points back here. The companion test in the same file ("does not invoke update_task when the card is dropped back on its own column") still passes and was left enabled. **Follow-up required:** repair the rect mock (verify which `className` substring KanbanColumn currently exposes for its drop-zone, and confirm the column header text still matches `"TO DO" / "IN PROGRESS" / "IN REVIEW" / "DONE"`), then remove `.skip` and assert the regression guard is restored before the next phase ships. | Yes — this row + in-file SKIPPED note in the test. |

---

## Documentation Gaps

Places where `CLAUDE.md`, `SCHEMA.md`, `VISUAL.md`, or `TYPES.md` was ambiguous
or silent, forcing an assumption that turned out to be wrong.

| Phase/Task | File | What Was Unclear | Assumption Made | Correct Behavior | Doc Updated? |
|---|---|---|---|---|---|
| Phase 1 / Task 1.3 | SCHEMA.md vs TYPES.md | SCHEMA.md listed `person_id` generically as nullable; TYPES.md declared `TimeLog.person_id: number` and `ActivityLog.person_id: number` (non-null). Conflict on nullability. | Surfaced the conflict to the user before writing the migration; chose TYPES.md interpretation (person_id NOT NULL on both tables, ON DELETE CASCADE). | Only `tasks.sprint_id`, `tasks.parent_id`, `tasks.assignee_id` are nullable. All other FKs are NOT NULL with CASCADE. | Yes — SCHEMA.md updated with explicit per-column FK rules. |
| Phase 5 / Sprint→Backlog DnD bug | serde-rs docs (external) | serde's default `Deserialize` for `Option<Option<T>>` was assumed to recurse — i.e., that `{"field": null}` would yield `Some(None)` and an absent field would yield `None`. It does not. Both incoming `null` and absent collapse to outer `None` because `Option<T>::deserialize` short-circuits on `null`. | The original `TaskUpdate` declared four fields as `Option<Option<T>>` (`sprint_id`, `parent_id`, `assignee_id`, `due_date`) without `#[serde(deserialize_with = ...)]`, expecting the three-state behavior for free. This silently broke any "clear to NULL" mutation — `unwrap_or(current.x)` always re-bound the existing value. | Use a custom `deserialize_optional_field` helper (`Option::<T>::deserialize(de).map(Some)`) combined with `#[serde(default, deserialize_with = "deserialize_optional_field")]` on each `Option<Option<T>>` field. Added Rust unit tests in `commands::tasks::tests` to lock the absent/null/value three-state behavior. | Yes — this row + helper docstring in `src-tauri/src/commands/tasks.rs`. |
| Phase 7 / open-file button | Tauri v2 capability schema (`desktop-schema.json`) | The schema describes `"opener:allow-open-path"` as *"enables the open_path command without any pre-configured scope."* This was interpreted as "no scope is required." | Used the bare string form `"opener:allow-open-path"` in `capabilities/default.json`. The command was registered but the runtime path-scope validator rejected every call with *"Not allowed to open path"* — same silent failure as `.catch(console.error)` swallowed the error. | **"Without any pre-configured scope" means the path allowlist is empty, not absent.** Any Tauri v2 plugin permission that touches the filesystem must use the scoped object form: `{ "identifier": "opener:allow-open-path", "allow": [{ "path": "$HOME/**" }] }`. Same rule applies to `fs:allow-stat` and all analogous permissions. Always use the object form for filesystem-touching permissions. | Yes — this row. |

---

## Recurring Patterns

Anti-patterns that appeared in more than one task. Entries here are escalated
from the tables above once a pattern is confirmed across two or more incidents.

### Never unmount a `@dnd-kit` draggable while it is being dragged

The same bug shipped in two board components (`KanbanColumn` for status boards and `DroppablePanel` in `SprintPlanningBoard`) before being caught in Phase 5. Both swapped the source `TaskCard` for a placeholder `<div>` based on `task.id === activeTaskId`. That unmounts the draggable mid-drag; its `data.current` registration is cleared; `handleDragEnd` then sees `active.data.current === undefined` and either crashes or aborts. The card vanishes from the board and the mutation never fires.

**Rule:** When you need a "ghost" placeholder in the source slot, render it *inside* the draggable component (the one that owns `setNodeRef` from `useDraggable`), gated on `useDraggable().isDragging` — not by swapping the draggable out for a sibling. The DragOverlay holds the floating clone; the source's `setNodeRef` element must stay mounted with its data attached until drop.

### A story's `sprint_id` and `status` move together — every path must apply both

Confirmed twice in the FB-46/90/91 branch, in opposite directions:

1. **Unscheduling via the board.** Dropping a story onto a sprint reset its status to `todo` (FB-85), but dragging it back out left that status in place. The unscheduled row lists only `ready_for_development`, so a story dragged in and straight back out vanished from the board.
2. **Scheduling via the detail panel.** The panel's Sprint picker wrote `sprint_id` alone, so the story stayed at `ready_for_development` inside a sprint and rendered in no column on the User Story Board.

Both are the same defect: `sprint_id` decides which *board* a story appears on, `status` decides which *column* — and the two lifecycles (discovery: `refining` / `ready_for_development`; dev: `todo` / `in_progress` / …) do not overlap. Writing one without the other strands the row in a combination no view renders.

**Rule:** any code path that changes a story's `sprint_id` must go through `computeSprintDropPayload` rather than patching `sprint_id` directly. It owns both transitions (backlog → sprint sets `todo`; sprint → backlog restores `ready_for_development`) and is gated on `type === "story"` so non-story rows keep their status.

**Still open:** deleting a sprint clears `sprint_id` via `ON DELETE SET NULL` in SQL, which cannot run this transition. Those stories keep their dev status and land in the Discovery `BACKLOG` column rather than the planning row. Currently intended (FB-91 notes it), but it is the same asymmetry and worth revisiting if it confuses users.

**Diagnostic note:** `KanbanBoard` filters each column by exact status and silently drops anything that matches none. A story "disappearing" from a board is almost always a status/column mismatch, not a filter or query bug.

---

## Reading Protocol (enforced by CLAUDE.md)

Before starting any task:

1. Read this file in full.
2. Identify any entries relevant to your assigned task's scope or agent role.
3. In your task plan, explicitly state: **"No relevant lessons"** or list the
   lessons that apply and how you will avoid repeating them.

Skipping this step is a Definition of Done violation.