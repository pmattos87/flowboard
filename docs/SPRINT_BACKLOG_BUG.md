# Sprint → Backlog DnD: card snaps back

## Status
**Open.** Root cause identified, fix not yet applied. See [Fix Plan](#fix-plan) below.

---

## Symptom

On the **Sprint Planning Board**, dragging a card from the **Sprint** panel to the **Backlog** panel:
- The card visibly returns to the Sprint panel on drop (no visible change).
- After a full app reload, the card is still in the Sprint panel — the DB was never updated.

**Inverse direction works:** Dragging a card from Backlog into Sprint correctly sets `sprint_id` and persists. The bug is one-way (clearing sprint_id, not setting it).

The status-board DnD bug fixed in this branch (placeholder unmount) is unrelated — that one made cards *disappear*. This bug leaves the card visible but unchanged.

---

## Reproduction

1. Open FlowBoard, select a project with at least one active sprint that has a task assigned.
2. Navigate to **Sprint Planning Board**.
3. Drag any task card from the right "Sprint" panel into the left "Backlog" panel and drop.
4. Observe: the card snaps back to the Sprint panel.
5. Reload the app (Ctrl+R or restart). The task still has `sprint_id != null`.

---

## Root Cause

`src-tauri/src/commands/tasks.rs`, line 180:

```rust
.bind(payload.sprint_id.unwrap_or(current.sprint_id))
```

where `TaskUpdate.sprint_id: Option<Option<i64>>` (line 45). The intent of the double-Option is to distinguish three states:

| Caller intent       | Desired JSON         | Desired Rust value |
|---------------------|----------------------|--------------------|
| Don't touch         | field absent         | `None`             |
| Set to a sprint     | `"sprint_id": 7`     | `Some(Some(7))`    |
| Clear (move to backlog) | `"sprint_id": null` | `Some(None)`    |

**The problem:** serde's *default* `Deserialize` impl for `Option<T>` treats incoming `null` as `None` at the outer layer — it does **not** recurse into `Option<Option<i64>>` to produce `Some(None)`. So both "field absent" and `"sprint_id": null` deserialize to outer `None`, and `unwrap_or(current.sprint_id)` keeps the existing value.

The frontend `SprintPlanningBoard.handleDragEnd` correctly sends `{ id, payload: { sprint_id: null } }` when dragging to the Backlog (`SprintPlanningBoard.tsx:131`), but Rust never sees `Some(None)` — it always sees `None`, and the UPDATE writes back the current sprint_id unchanged.

### Why the test suite didn't catch this
- No existing test exercises a Tauri-command round-trip for `update_task` with `sprint_id: null`.
- The frontend `SprintPlanningBoard.test.tsx` only verifies rendering, not the drag → mutation payload path.

### Other fields with the same latent issue
`TaskUpdate` declares three more `Option<Option<T>>` fields, all subject to the same bug:
- `parent_id: Option<Option<i64>>`
- `assignee_id: Option<Option<i64>>`
- `due_date: Option<Option<String>>`

Any UI that sends `null` to clear one of these will silently no-op. The fix below should cover all four together.

---

## Fix Plan

**Goal:** Make `{ "field": null }` produce `Some(None)` so the UPDATE binds a SQL NULL, while keeping "field absent" → `None` (no-op).

### Step 1 — Add a serde helper for `Option<Option<T>>` fields
Create or extend `src-tauri/src/commands/` with a small deserializer that forces serde to recurse into the inner Option instead of short-circuiting on `null`:

```rust
use serde::{Deserialize, Deserializer};

pub fn deserialize_optional_field<'de, T, D>(
    deserializer: D,
) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}
```

The helper deserializes the incoming value as `Option<T>` (where `null` → `None`, a real value → `Some(value)`), then wraps the result in `Some(...)`. Combined with `#[serde(default)]` to handle absent fields, this gives the three-state behavior we want.

**Verify:** Helper compiles; no warnings.

### Step 2 — Apply the helper to all four `Option<Option<T>>` fields on `TaskUpdate`
In `src-tauri/src/commands/tasks.rs`:

```rust
#[derive(Debug, Deserialize)]
pub struct TaskUpdate {
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub sprint_id: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub parent_id: Option<Option<i64>>,
    pub title: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub r#type: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub assignee_id: Option<Option<i64>>,
    pub story_points: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub due_date: Option<Option<String>>,
    pub labels: Option<String>,
}
```

**Verify:** `cargo build` from `src-tauri/` succeeds.

### Step 3 — Audit other command structs for the same pattern
Grep the Rust source for `Option<Option<`. Any other `*Update` struct using the double-Option shape has the same latent bug. Apply the same `#[serde(...)]` decoration there.

**Verify:** `rg "Option<Option<" src-tauri/src/commands/` shows only annotated fields.

### Step 4 — Manual regression check
1. Backlog → Sprint: drag a task from Backlog into the active sprint. Reload. Sprint shows the task. (Should still work — was never broken.)
2. Sprint → Backlog: drag the same task back to Backlog. Reload. Backlog shows the task, Sprint does not.
3. TaskDetailPanel "Sprint" picklist: change a task's sprint to "Backlog" via the picklist (not drag). Reload. Same expected behavior — confirms the fix isn't drag-specific.
4. Clear `assignee_id` via TaskDetailPanel (set to "Unassigned"). Reload. Task stays unassigned.

### Step 5 — Test coverage
Add a Tauri command-level test (or hook-level integration test) that:
- Calls `updateTask(id, { sprint_id: null })`
- Verifies the mock `invoke` is called with a payload where `sprint_id === null` (not `undefined`).
- Optionally: a Rust-side `cargo test` that deserializes a JSON string `{"sprint_id": null}` into `TaskUpdate` and asserts `payload.sprint_id == Some(None)`.

### Step 6 — Document & commit
- Update `docs/LESSONS.md` with a Documentation Gaps row (serde double-Option behavior is non-obvious; default behavior loses the `null` vs. absent distinction).
- Delete this bug doc once the fix lands.
- Commit on a fresh branch `fix/sprint-backlog-clear` with prefix `fix(tauri): preserve null vs. absent in Option<Option<T>> task fields`.

---

## Out of Scope

- The frontend `SprintPlanningBoard.handleDragEnd` payload (`{ sprint_id: null }`) is correct — do not change it.
- The status-board DnD (placeholder unmount) was a separate bug, already fixed on this branch.
- No schema migration needed — the SQLite columns already permit NULL.
