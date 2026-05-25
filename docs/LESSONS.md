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
| — | — | — | — | — | — |

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

*(None yet — populated automatically as patterns emerge.)*

---

## Reading Protocol (enforced by CLAUDE.md)

Before starting any task:

1. Read this file in full.
2. Identify any entries relevant to your assigned task's scope or agent role.
3. In your task plan, explicitly state: **"No relevant lessons"** or list the
   lessons that apply and how you will avoid repeating them.

Skipping this step is a Definition of Done violation.