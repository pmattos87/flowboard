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

---

## Documentation Gaps

Places where `CLAUDE.md`, `SCHEMA.md`, `VISUAL.md`, or `TYPES.md` was ambiguous
or silent, forcing an assumption that turned out to be wrong.

| Phase/Task | File | What Was Unclear | Assumption Made | Correct Behavior | Doc Updated? |
|---|---|---|---|---|---|
| Phase 1 / Task 1.3 | SCHEMA.md vs TYPES.md | SCHEMA.md listed `person_id` generically as nullable; TYPES.md declared `TimeLog.person_id: number` and `ActivityLog.person_id: number` (non-null). Conflict on nullability. | Surfaced the conflict to the user before writing the migration; chose TYPES.md interpretation (person_id NOT NULL on both tables, ON DELETE CASCADE). | Only `tasks.sprint_id`, `tasks.parent_id`, `tasks.assignee_id` are nullable. All other FKs are NOT NULL with CASCADE. | Yes — SCHEMA.md updated with explicit per-column FK rules. |

---

## Recurring Patterns

Anti-patterns that appeared in more than one task. Entries here are escalated
from the tables above once a pattern is confirmed across two or more incidents.

### Never unmount a `@dnd-kit` draggable while it is being dragged

The same bug shipped in two board components (`KanbanColumn` for status boards and `DroppablePanel` in `SprintPlanningBoard`) before being caught in Phase 5. Both swapped the source `TaskCard` for a placeholder `<div>` based on `task.id === activeTaskId`. That unmounts the draggable mid-drag; its `data.current` registration is cleared; `handleDragEnd` then sees `active.data.current === undefined` and either crashes or aborts. The card vanishes from the board and the mutation never fires.

**Rule:** When you need a "ghost" placeholder in the source slot, render it *inside* the draggable component (the one that owns `setNodeRef` from `useDraggable`), gated on `useDraggable().isDragging` — not by swapping the draggable out for a sibling. The DragOverlay holds the floating clone; the source's `setNodeRef` element must stay mounted with its data attached until drop.

---

## Reading Protocol (enforced by CLAUDE.md)

Before starting any task:

1. Read this file in full.
2. Identify any entries relevant to your assigned task's scope or agent role.
3. In your task plan, explicitly state: **"No relevant lessons"** or list the
   lessons that apply and how you will avoid repeating them.

Skipping this step is a Definition of Done violation.