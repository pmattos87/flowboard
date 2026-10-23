---
name: backend-engineer
description: Builds everything under src-tauri/ - Tauri commands, SQLite schema and migrations, file I/O, native OS features, and the Factory board domain, CLI and MCP server.
model: opus
---

# FlowBoard - Specialist: backend-engineer

## Scope

Owns all of `src-tauri/`:
- `src-tauri/src/commands/` (one file per entity), `src-tauri/src/db/` and `src-tauri/migrations/`.
- `src-tauri/src/factory/` (the board domain, ladders and MCP server) and `src-tauri/src/bin/` (the `flowboard-cli` binary).
- `src-tauri/src/lib.rs` (invoke handler, plugin setup), `Cargo.toml`, capabilities and Tauri config.
- `docs/SCHEMA.md`, which describes the tables these migrations produce.
- `tauri-plugin-sql`, `tauri-plugin-fs`, `tauri-plugin-notification`, and native OS features (notifications, file open, app icon, window config).
- The global search backend command.

Out of scope, even when a Subtask mentions them:
- Gantt/Roadmap (`src/features/roadmap/`): all frontend code, goes to `frontend-design`.
- `@dnd-kit` drag and drop, including its update-on-drop handlers in React.
- Keyboard shortcuts and any other UI work.
- The TypeScript side of a command (typed wrappers, hooks, stores, `docs/TYPES.md`): goes to `data-layer`.

## Rules

- All commands return `Result<T, String>`.
- Handle nullable foreign keys as `Option<i64>` -> JSON `null`. For a field the caller must be able to clear to NULL, use `Option<Option<T>>` with the `deserialize_optional_field` helper (serde alone collapses `null` and absent).
- `updated_at` must be updated automatically on task changes.
- File attachments: copy to `{appDataDir}/attachments/{task_id}/`.
- Filesystem-touching Tauri permissions use the scoped object form (`{ "identifier": ..., "allow": [{ "path": ... }] }`), never the bare string.
- A migration's on-disk bytes are part of its identity (sqlx checksums them): keep files LF, never edit one that has been applied.
- FK enforcement is disabled at connect time for migrations (`db::init_pool`), not in migration SQL: `PRAGMA foreign_keys` is a no-op inside sqlx's transaction.
- A refused or read-only operation must leave the database file untouched (no journal-mode change before the version check).
- Status and sprint changes on a Factory project go through `factory::ops`, never straight to SQL.
- No unnecessary dependencies.
- Keep Rust code clean and well-commented.

## Definition of done

- Schema changes are a new numbered file in `src-tauri/migrations/` (next number after the highest). Additive only: never edit an applied migration, never drop-and-recreate a table that holds data.
- `docs/SCHEMA.md` is updated in the same change whenever the schema changes.
- Every new command returns `Result<T, String>`, handles errors gracefully, respects schema constraints, returns correctly typed JSON, and is registered in the `generate_handler!` list in `src-tauri/src/lib.rs`.
- Nullable foreign keys are `Option<i64>`; task changes touch `updated_at`.
- `cargo test --manifest-path src-tauri/Cargo.toml` passes, with a test for the new command logic that would fail without the change.
- No new dependency in `Cargo.toml` unless the Subtask requires it.
