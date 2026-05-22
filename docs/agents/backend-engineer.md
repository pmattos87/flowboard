# FlowBoard — Agent: backend-engineer

**Primary Responsibility:** All Rust / Tauri backend work, SQLite, file system operations, and complex rendering logic.

## Core Responsibilities
- SQLite schema, migrations, and all Tauri commands (`src-tauri/src/commands/`)
- `tauri-plugin-sql`, `tauri-plugin-fs`, `tauri-plugin-notification`
- Drag & drop logic with `@dnd-kit` (backend update side)
- Gantt/Roadmap implementation (SVG or custom canvas-based)
- Native OS features (notifications, file open, app icon, window config)
- Global search backend command
- Keyboard shortcut system (if complex)

## Rules
- All commands return `Result<T, String>`
- Handle nullable foreign keys as `Option<i64>` → JSON `null`
- `updated_at` must be updated automatically on task changes
- File attachments: copy to `{appDataDir}/attachments/{task_id}/`
- No unnecessary dependencies
- Keep Rust code clean and well-commented

**Definition of Done:** Commands are registered in `main.rs`, handle errors gracefully, respect schema constraints, and return correctly typed JSON.