# Plan — Repair the Skipped KanbanBoard DnD Regression Test

> **Status:** Not started.
> **Owner:** TBD (assign before Phase 7 ships).
> **Source of truth:** `docs/LESSONS.md` → Execution Mistakes → "Stale jsdom rect-mock in KanbanBoard DnD test".

This document is a **plan only**. Do not execute steps below without explicit
instruction from the user. The plan is sequenced as an investigation first,
then a repair, then a verification — do not skip to the repair before the
investigation has confirmed the actual root cause.

---

## Goal

Restore `src/__tests__/features/KanbanBoard.dnd.test.tsx > "invokes update_task
with the new status after a cross-column drag"` to a passing, un-skipped state.
The production code it guards (the rule from `LESSONS.md` → "Never unmount a
`@dnd-kit` draggable while it is being dragged") must remain unchanged — the
repair is in the **test scaffolding only**.

Success criteria:

1. The `it.skip` on line 116 of the test file is removed.
2. `npx vitest run src/__tests__/features/KanbanBoard.dnd.test.tsx` reports
   two passing tests, zero skipped, zero failing.
3. The full suite still passes: `npx vitest run` exits clean.
4. The `LESSONS.md` row referencing this follow-up is updated with the
   resolution (the existing row stays — `LESSONS.md` is append-only — but a
   note can be added that points at the resolving commit).

---

## What is known going in

- The failure exists at commit `70894ae` (tip of `phase/5-boards`, before any
  Phase 6 work). It is **not** caused by the new `DndContext` in the Roadmap
  page. This is documented in the `LESSONS.md` entry.
- The current `KanbanColumn` drop-zone className still contains the literal
  substring `min-h-[120px]` (`src/features/boards/shared/KanbanColumn.tsx:40`),
  so the suspected "class-string drift" hypothesis from the lesson **does not
  obviously apply**. This must be verified empirically, not assumed away.
- The companion test in the same file ("does not invoke update_task when the
  card is dropped back on its own column") still passes. That means
  `renderBoard`, the rect mock, and the basic `DndContext` wiring are all
  reachable; the failure is specific to the cross-column collision path.

---

## Phase 1 — Reproduce and diagnose

Do these in order. Each step has a verification check; do not move to the
next step until the check passes.

### 1.1 Reproduce the failure on a clean tree

```
git checkout main && git pull
npx vitest run src/__tests__/features/KanbanBoard.dnd.test.tsx
```

Expected: one skipped, one passing. Now temporarily un-skip the test in the
working tree (do not commit) by changing `it.skip(` → `it(` on line 116 and
re-run.

**Verify:** The test fails with `mockInvoke` never having been called.
Capture the exact failure output. If the failure shape is different from
what `LESSONS.md` describes, **stop and reassess** — the lesson may be stale.

### 1.2 Confirm which element the mock is actually matching

Inside the test, before the `pointerDown`, add temporary diagnostic logging
(do not commit):

```ts
const allDropZones = document.querySelectorAll('[class*="min-h-"]');
console.log("dropzones found:", allDropZones.length);
allDropZones.forEach((el, i) => {
  console.log(i, (el as HTMLElement).className);
  console.log("  rect:", (el as HTMLElement).getBoundingClientRect());
});
```

**Verify:** Confirm whether the mock's `cls.includes("min-h-[120px]")` branch
is actually hit for the four KanbanColumn drop zones. There are three
possible outcomes; each routes to a different sub-plan:

- **A. The branch IS hit and returns the column-specific rects.** Then the
  problem is downstream of the rect mock — most likely in `@dnd-kit`'s
  collision detection algorithm, sensor activation, or the pointer event
  sequence. Go to Phase 2A.
- **B. The branch is NOT hit (the className substring no longer matches).**
  Then the lesson's primary hypothesis is correct after all and the className
  needle has drifted in some non-obvious way (e.g. Tailwind class ordering,
  arbitrary-value escaping). Go to Phase 2B.
- **C. The branch IS hit but the header-text lookup returns the wrong status.**
  Then the column header DOM structure has changed (e.g. the `span.uppercase`
  selector or the literal `"TO DO" / "IN PROGRESS" / …` strings). Go to
  Phase 2C.

### 1.3 Confirm the pointer event sequence actually triggers PointerSensor

If outcome A above, also instrument `handleDragStart` and `handleDragEnd` in
`src/features/boards/shared/KanbanBoard.tsx` with a `console.log` (do not
commit) and re-run the un-skipped test.

**Verify:** Is `handleDragStart` called? Is `handleDragEnd` called? Is
`over` null at drop time? This tells you whether the failure is:

- before drag activation (sensor never fires) →  Phase 2A.i
- after activation but before drop resolution (drop misses collision) → Phase 2A.ii
- after drop but the handler bails on `task.status === newStatus` → Phase 2A.iii

---

## Phase 2 — Repair

Execute exactly one of the sub-paths below, based on Phase 1 findings.
**Do not blend paths.** If two paths seem applicable, return to Phase 1 and
re-diagnose — the failure has a single root cause.

### Phase 2A — Rect mock is fine; collision / sensor pipeline is the issue

Sub-paths:

- **2A.i (sensor never activates):** The `PointerSensor` uses
  `activationConstraint: { distance: 5 }`. jsdom's pointer event behavior may
  have changed in a recent upgrade and the synthesized events no longer carry
  the deltas the sensor expects. Options:
  - Add an intermediate `pointerMove` with a larger delta, or
  - Switch the test to `dnd-kit`'s test utilities (e.g. drive via
    `KeyboardSensor` with arrow keys, which is jsdom-friendly), or
  - Lower `activationConstraint.distance` for tests (least preferred —
    modifies production code for test convenience).
  Preferred fix: try the larger-delta intermediate move first.

- **2A.ii (collision detection picks the wrong column):** The default
  `closestCenter` algorithm may be resolving to `todo` because the source
  card's own rect (mock returns 200×80 at origin) sits inside the `todo`
  column's rect. Fix by either:
  - Giving the source card a rect that does NOT overlap any column, or
  - Switching the `DndContext` to `closestCorners` or `pointerWithin` in
    production (requires a justification commit), or
  - Adjusting `COLUMN_X` so the gap between columns is larger than the card.
  Preferred: adjust the source-card rect in the mock to sit at e.g. y=-200
  (outside all columns), keeping production untouched.

- **2A.iii (handler bails):** Inspect why `over.id` resolves to the source
  column. Likely overlap with the source card rect — see 2A.ii.

### Phase 2B — Mock's className matcher no longer hits

Update the rect mock's drop-zone selector. Prefer a stable selector that does
not depend on a Tailwind arbitrary-value string. Two options:

- **B.1 — Use the droppable's `data-` attribute (preferred).** `@dnd-kit`'s
  `useDroppable` attaches metadata via `setNodeRef`, but does not by default
  add a stable `data-droppable-id` attribute. Add one explicitly in
  `KanbanColumn.tsx` — e.g. `<div ref={setNodeRef} data-column-status={status} …>`
  — and have the mock match on `el.dataset.columnStatus`. This is a tiny
  production change (a single data attribute) but pays off by making the test
  scaffolding resilient to all future class-string churn.

- **B.2 — Match on a different className substring.** If a production change
  is undesirable, identify a stable substring of the current className (e.g.
  `"rounded-lg"` combined with parent-header lookup) and update the mock.
  Riskier — drifts again the next time Tailwind classes are touched.

Recommend B.1.

### Phase 2C — Column header DOM structure has changed

Update the mock's header-text lookup. Same data-attribute principle as 2B.1:
add `data-column-status={status}` on the drop-zone, read it directly, skip
the `parentElement.querySelector("span.uppercase")` hop entirely.

---

## Phase 3 — Verify

Run, in order:

1. `npx vitest run src/__tests__/features/KanbanBoard.dnd.test.tsx` — both
   tests pass, none skipped.
2. `npx vitest run` — full suite still green.
3. `npx tsc --noEmit` — no type errors introduced by any production change.
4. Manual drag-and-drop sanity check in `tauri dev`: pick a task on the Task
   Board, drag it from TO DO to IN PROGRESS, confirm the DB updates. (The
   skipped test was guarding this exact flow; a passing test alone is not
   sufficient — confirm the production behavior still works.)

Then:

5. Remove all temporary diagnostic `console.log` statements added in Phase 1.
6. Commit the fix on a short-lived branch named `fix/kanban-dnd-test-mock`
   with semantic prefix `fix(ui):` if only the test file changed, or
   `fix(ui):` plus a separate `feat(ui):` commit if a `data-column-status`
   attribute was added to `KanbanColumn`.
7. Open PR into `main`. PR body must reference `docs/LESSONS.md` and this
   plan file.

---

## Notes on what NOT to do

- **Do not delete the `it.skip`'d test.** It guards a real production
  invariant (TaskCard's `useDraggable` data registration must survive a
  drag). Deleting it would silently un-protect that invariant.
- **Do not weaken the assertion** to make the test pass faster. The
  assertion that `mockInvoke` was called with `status: "in_progress"` is the
  whole point of the test.
- **Do not "fix" by modifying `handleDragEnd` to swallow errors.** The
  original bug was a silent abort in that handler; making it more silent
  would re-create the failure mode.
- **Do not upgrade `@dnd-kit` as part of this fix.** If a `@dnd-kit` upgrade
  is the right answer, it belongs in a separate, isolated PR with its own
  full-suite regression sweep.

---

## Estimated effort

- Phase 1 (diagnose): 30–60 min.
- Phase 2 (repair): 15–45 min depending on which sub-path applies.
- Phase 3 (verify): 15 min.

Total: ~1–2 hours for an agent familiar with the codebase.
