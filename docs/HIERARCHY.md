# FlowBoard — Hierarchy Improvements (Phase 10)

**Status:** Planned
**Branch (proposed):** `phase/10-hierarchy`
**Owner agents:** `skill:frontend-design`, `skill:data-layer`

---

## 1. Problem Statement

FlowBoard currently treats tasks, stories, epics, and bugs as a flat list filtered only by project. The intended product hierarchy is:

```
Project  >  Sprint  >  Story  >  Task / Bug
```

The boards do not yet reflect this hierarchy:

| Symptom | Today | Desired |
|---|---|---|
| Task Board has no sprint filter | Shows every task in the project | Sprint dropdown (`All` / `Backlog` / each sprint) |
| User Story Board has no sprint filter | Shows every story in the project | Sprint dropdown (same as above) |
| Tasks in the Task Board are flat | One big kanban of every task/bug | Tasks grouped by parent story; each group collapsible |
| Discovery Board shows everything | All stories + epics regardless of sprint | Only stories/epics in the backlog (`sprint_id IS NULL`) |
| Sprint Planning backlog is overly broad | Any task with `sprint_id IS NULL` | Only stories with `sprint_id IS NULL` — the same backlog Discovery shows |

---

## 2. Goals

1. Make the **sprint** the primary unit of work-in-progress slicing on the Task and User Story boards.
2. Make the **story** the primary unit of grouping for tasks/bugs on the Task Board.
3. Make the **Discovery → Backlog → Sprint** flow a single, consistent pipeline:
   - A story lives in the **Discovery Board** while `sprint_id IS NULL`.
   - The **Sprint Planning Board** moves it from backlog into a sprint (existing DnD).
   - Once assigned, it leaves Discovery automatically (because the filter excludes it) and appears in User Story Board / Task Board under the chosen sprint.

---

## 3. Scope of Changes

### 3.1 Shared: sprint filter in `uiStore`

Add a single piece of UI state shared by Task Board and User Story Board.

```ts
// src/stores/uiStore.ts
type SprintFilter = "all" | "backlog" | number; // number = sprint id

boardSprintFilter: SprintFilter;
setBoardSprintFilter: (f: SprintFilter) => void;
```

- Default: `"all"`.
- Resets to `"all"` when `activeProjectId` changes (selected sprint may not belong to the new project).
- **Reuse the existing `selectedSprintId`** only if it already matches a sprint in the current project; otherwise reset.

> **Note:** The Sprint Planning Board keeps its own `selectedSprintId` — it represents a different concept (which sprint you are planning into) and must not be coupled to the read-only filter on other boards.

### 3.2 Task Board — sprint filter + story grouping

**File:** `src/features/boards/TaskBoard.tsx` (and a new `TaskBoardGroupedKanban` component).

#### 3.2.1 Sprint dropdown

Render a `<select>` in the page header, identical styling to `SprintPlanningBoard`'s dropdown:

```
[ Task Board ]                        [Sprint: All sprints ▾]
```

Options: `All sprints`, `Backlog (no sprint)`, then each sprint by name (suffix `(active)` for the active one). Bound to `uiStore.boardSprintFilter`.

#### 3.2.2 Filtering rules

Stories are **first-class rows** on the Task Board — they are the group headers themselves, not hidden. Tasks/bugs render as cards *inside* an expanded story row.

```ts
// Stories drive grouping. Apply sprint filter to the story set.
const stories = allTasks
  .filter(t => t.type === "story")
  .filter(applySprintFilter);

// Tasks/bugs render as cards inside the columns of their parent story's row.
const children = allTasks.filter(
  t => (t.type === "task" || t.type === "bug")
);

// Unparented bucket: tasks/bugs with parent_id === null that still match the
// sprint filter. Rendered as one trailing pseudo-row whose header reads
// "Unparented" (no key, no progress bar).
const unparented = children
  .filter(t => t.parent_id === null)
  .filter(applySprintFilter);
```

> A story with zero matching child tasks is **still shown** as a collapsible row (matches the screenshot — FB-106 displays with `0/0`). It always appears as long as it passes the sprint filter.

#### 3.2.3 Grouping layout

The board is a vertically-stacked list of **story rows**. Each row is a fixed-height header strip; when expanded it reveals the four status columns underneath.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▼  📑 FB-101  Drag-and-drop between columns  ⇧            [▓▓░] 0/3   + Add  │  ← expanded header
│ ┌──────────────┬──────────────┬──────────────┬────────────────────────────┐  │
│ │ • TO DO  2 + │ • IN PROG  1 + │ • IN REV  0 + │ • DONE  0  +              │  │  ← per-column sub-header
│ │ [card]       │ [card]         │ Drop tasks    │ Drop tasks                │  │
│ │ [card]       │                │ here          │ here                      │  │
│ └──────────────┴──────────────┴──────────────┴────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▶  📑 FB-104  Quick-create task from column  =            [▓▓▓] 2/2   + Add  │  ← collapsed, progress still shown
└──────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▶  📑 FB-106  Keyboard shortcuts (C to create)  ▾         [░░░] 0/0   + Add  │
└──────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▼  Unparented                                                                │  ← trailing pseudo-row, only if non-empty
│ ┌──────────────┬──────────────┬──────────────┬────────────────────────────┐  │
│ │ ...                                                                       │  │
│ └──────────────┴──────────────┴──────────────┴────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### 3.2.4 Story-row header anatomy

Left → right:

| Element | Source / behavior |
|---|---|
| Chevron `▶` / `▼` | Toggles collapse for this row. |
| Type icon | Story-type icon (green bookmark in screenshot). |
| Key | `${projectKey}-${story.id}` (e.g. `FB-101`). Clickable → opens Task Detail Panel for the story. |
| Title | `story.title`. Clickable → same as key. |
| Priority icon | Existing priority glyph (⇧ high, = medium, etc.). |
| Progress bar | `done / total` over children matching the current sprint filter. Bar fill ratio = `doneCount / totalCount`; renders even when total is 0 (empty bar, label `0/0`). |
| `+ Add` button | Opens the Create Task modal pre-filled with `parent_id = story.id` and `sprint_id = story.sprint_id`. |

Story rows are **not draggable** — they have a status of their own but it is edited via the detail panel, not by dragging the header. Only the cards inside the columns are draggable.

#### 3.2.5 Per-column sub-headers (inside an expanded story row)

Each of the four columns inside an expanded story row has its own mini-header:

| Element | Behavior |
|---|---|
| Status dot | Reuse existing column `dotClass`. |
| Label | `TO DO` / `IN PROGRESS` / `IN REVIEW` / `DONE`. |
| Count | Children of this story in this status. |
| `+` button | Opens Create Task modal pre-filled with `parent_id = story.id`, `sprint_id = story.sprint_id`, `status = <this column>`. |

Empty columns render the existing `Drop tasks here` placeholder.

#### 3.2.6 Group ordering & visibility

- Story rows ordered by `story.id` ascending (stable across renders).
- `Unparented` pseudo-row appears last, **only if** it has at least one matching child (no header rendered when empty).
- Every story that passes the sprint filter is shown — even with zero children — because the user may want to add children to it from the row's `+ Add` button.

#### 3.2.7 Collapse/expand state

Local to the Task Board page. Component-local `useState` keyed by `activeProjectId`:

```ts
const [collapsedStoryGroups, setCollapsedStoryGroups] =
  useState<Set<number | "unparented">>(new Set());
```

- Default: all expanded.
- A collapsed group renders only its header row (height collapses; child columns are unmounted).
- The drop zones inside a collapsed group are **not rendered**, so DnD targets shrink to expanded groups only.
- The progress bar in the header remains visible whether collapsed or expanded.

#### 3.2.8 DnD inside grouped layout — **critical**

This is where the Phase 5 lesson bites. The grouping changes how cards are rendered, **but the source `TaskCard` must remain mounted with its `setNodeRef` attached for the entire drag**.

Concrete rules:

1. Each group renders **its own four `useDroppable` zones** with unique IDs of the form `${status}:${groupKey}`. The drag handler resolves the dropped status by splitting on `:`.
2. The dragged card stays in its source group while being dragged — **do not** swap it for a placeholder div in a different DOM node (this is exactly the Phase 5 bug). The `DragOverlay` continues to render the floating clone.
3. Dropping onto a column in a different group changes only `status` (parent_id is unchanged); to move a task between stories, edit it from the task detail panel — out of scope here.

#### 3.2.9 Empty states

- No project selected → existing message.
- Project selected, **zero stories** match the sprint filter and no unparented children either → `No tasks in <filter label>. Try a different sprint or create a story.`
- Stories present but none of them has children matching the filter → stories still render as collapsible rows with `0/0` progress; no special empty-state copy.

### 3.3 User Story Board — sprint filter

**File:** `src/features/boards/UserStoryBoard.tsx`.

Reuse the same `uiStore.boardSprintFilter` and the same dropdown component (extract to `src/features/boards/shared/SprintFilterSelect.tsx` so Task Board and User Story Board share it).

Filtering after sprint filter applies:

```ts
const stories = allTasks
  .filter(t => t.type === "story")
  .filter(applySprintFilter);
```

No grouping change — User Story Board stays as one flat kanban.

### 3.4 Discovery Board — narrow to backlog

**File:** `src/features/boards/DiscoveryBoard.tsx`.

```ts
const tasks = (allTasks ?? []).filter(
  t => (t.type === "epic" || t.type === "story") && t.sprint_id === null,
);
```

Add a short subtitle under the header: `Backlog — stories and epics not yet assigned to a sprint.`

No new DnD; existing status-column DnD is unchanged.

### 3.5 Sprint Planning Board — backlog panel narrows to stories

**File:** `src/features/boards/SprintPlanningBoard.tsx`.

Change:

```ts
const backlogTasks = (allTasks ?? []).filter(t => t.sprint_id === null);
```

to:

```ts
const backlog = (allTasks ?? []).filter(
  t => t.sprint_id === null && t.type === "story",
);
```

`sprintTasks` keeps existing behavior (every task already assigned to the selected sprint), so child tasks/bugs auto-follow when their parent story is moved into a sprint — provided we wire that propagation in 3.6.

### 3.6 Backend / data: child propagation on story sprint change

When a story is moved into or out of a sprint, its child tasks/bugs should move with it. Two options:

**Option A (preferred — backend):** When `update_task` mutates `sprint_id` on a row where `type='story'`, also `UPDATE tasks SET sprint_id = ? WHERE parent_id = ?` in the same transaction.

- Pros: single source of truth, fires correctly regardless of caller.
- Cons: changes `update_task` semantics slightly; needs Rust unit test covering the cascade.

**Option B (frontend):** The `useUpdateTask` mutation, on success for a story sprint change, fires a follow-up bulk update on children.

- Pros: no backend change.
- Cons: races, partial failures, and any future caller bypasses it.

**Decision:** go with **Option A**. New Rust tests:

- `propagates_sprint_id_to_children_when_story_moved`
- `does_not_propagate_when_non_story_sprint_changed`
- `does_not_clobber_grandchildren` (sub-tasks below a task don't currently exist, but defend the assumption)

### 3.7 React Query cache invalidation

`useUpdateTask` already invalidates the project's task list on success — that single invalidation covers the propagation in 3.6, so no extra hook work is required.

---

## 4. Open Questions

1. **Story-row column widths.** Per the screenshot, each story row has its own column strip (no shared top-of-board header). Columns are width-aligned across rows via a single CSS grid template applied uniformly to every row's column container. Recommend **uniform per-row** grid (not a single shared strip) so a collapsed row collapses entirely, including its column header band.
2. **Sprint filter scope.** Should the same filter selection appear on the Sprint Planning Board too? Recommend **no** — Sprint Planning's sprint dropdown means "which sprint am I planning into," which is a different verb than "which sprint am I viewing."
3. **Backlog item ordering** (Discovery + Sprint Planning backlog). Today it's by id; the hierarchy work is a natural moment to add manual ordering. Recommend **deferring** to a follow-up; nothing here depends on it.
4. **Where is the story's own status shown on the Task Board?** The header shows progress over children, not the story's own `status`. The story's status is editable only via the detail panel. Confirm this is OK — alternative is to color the chevron / type icon by story status.

---

## 5. Definition of Done

1. Sprint filter visible on Task Board and User Story Board; selecting `Backlog`, `All`, or any sprint correctly narrows the board.
2. Task Board displays one collapsible row per story (matching the screenshot layout: chevron, type icon, key, title, priority, progress bar, `+ Add`). Each row contains four per-column sub-headers with their own count and `+` add button. Cards drag between status columns within a row without disappearing (Phase 5 regression guard).
3. Per-row `+ Add` opens the Create Task modal pre-filled with `parent_id = story.id` and `sprint_id = story.sprint_id`; per-column `+` additionally pre-fills `status`.
4. Stories with zero matching children still render as rows with `0/0` progress.
5. Discovery Board shows only stories/epics with `sprint_id IS NULL`.
6. Sprint Planning Board's backlog panel shows only stories with `sprint_id IS NULL`. Dragging a story into the sprint also moves its child tasks/bugs into the sprint (verified by query after drag).
7. Backend has Rust unit tests covering the child-propagation cascade in `src-tauri/src/commands/tasks.rs`.
8. Frontend has Vitest coverage for: the sprint filter store action; the grouping reducer (input: flat tasks; output: ordered story rows + `Unparented` bucket); DiscoveryBoard's narrowed filter.
9. The existing skipped `KanbanBoard.dnd.test.tsx` rect-mock issue is **not** made worse — if any `KanbanColumn` class string changes, re-evaluate that test before merging.
10. `npx vitest run` exits with zero failures. `tsc --noEmit` is clean.
11. All work merged on `phase/10-hierarchy` and tagged `v0.10-hierarchy` (or rolled into the existing `v0.10` if it has not yet been cut).

---

## 6. Relevant Lessons Applied

- **`@dnd-kit` source unmount during drag** (Phase 5 / Recurring Patterns). The grouped Task Board introduces multiple drop zones per row, but the source card must keep its `setNodeRef` attached for the full drag lifecycle. Drop placeholders, if any, render *inside* the dragged `TaskCard` (gated on `useDraggable().isDragging`), never as a sibling swap.
- **`KanbanBoard.dnd.test.tsx` rect-mock fragility** (Phase 6 / Execution Mistakes). Any change to `KanbanColumn`'s `min-h-[120px]` class — or to the column header text — must be reflected in the test's `stubBoundingRects()` helper *in the same commit*.
- **`Option<Option<T>>` deserialization** (Phase 5 / Documentation Gaps). If 3.6 introduces new optional clearable fields on `TaskUpdate`, they must use the `deserialize_optional_field` helper. The existing `sprint_id` field already does; no new clearable fields are anticipated.
