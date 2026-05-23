# FlowBoard

**A local-first desktop project management app for Windows.**  
Plan sprints, track tasks, and ship — without your data leaving your machine.

---

## What It Is

FlowBoard is a Jira-inspired project management tool built as a native Windows desktop app. It's designed for individuals or small teams who want the power of sprint-based agile workflows without subscriptions, accounts, or cloud dependency. Everything lives in a local SQLite database on your machine.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand (UI) + React Query (data) |
| Database | SQLite via tauri-plugin-sql |
| Drag & drop | @dnd-kit |
| Charts | Recharts |

---

## Features (Planned)

- **Board Views** — User Story Board, Task Board, Discovery Board, Sprint Planning Board
- **Task Management** — Full CRUD with types (Story, Bug, Task, Epic), priorities, labels, assignees, story points
- **Sprint Management** — Create and manage sprints with goals, dates, and status tracking
- **Roadmap** — Gantt-style timeline with draggable bars and a today indicator
- **Reports** — Burndown chart, velocity chart, status distribution, workload per member
- **Comments & Time Tracking** — Per-task collaboration and time logging
- **File Attachments** — Local file storage linked to tasks
- **Inbox & Notifications** — In-app inbox with native OS notification support
- **Global Search** — Command palette (Cmd/Ctrl+K)
- **Keyboard Shortcuts** — Full keyboard navigation support

---

## Design Principles

- **Dark mode only.** No toggle, no light theme.
- **Local-only data.** No internet connection required. No accounts. No telemetry.
- **Offline-first.** Your data is a SQLite file on your machine — yours to back up, move, or inspect.

---

## Project Structure

```
src/
  components/      # Reusable UI components
  features/        # Feature modules (board/, sprints/, tasks/, …)
  hooks/           # React Query data hooks
  stores/          # Zustand UI stores
  lib/             # Tauri command wrappers and utilities
  types/           # TypeScript interfaces

src-tauri/
  src/
    commands/      # Rust Tauri command handlers (one file per entity)
    db/            # Schema initialization and migrations
    main.rs
```

---

## Development

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Node.js](https://nodejs.org/) 18+
- [Tauri CLI prerequisites for Windows](https://v2.tauri.app/start/prerequisites/)

### Getting Started

```bash
# Install dependencies
npm install

# Run in development mode (production data)
npm run dev

# Run against isolated staging data (safe to experiment)
npm run dev:staging
```

### Building

```bash
# Production build → outputs an .msi / .exe installer
npm run build

# Staging build (separate app data directory)
npm run build:staging
```

Production and staging builds use separate app data directories and can coexist on the same machine without interfering with each other.

---

## Data & Privacy

All data is stored locally in a SQLite database at:

```
%APPDATA%\com.flowboard.app\
```

No data is ever sent to a server. There is no cloud sync, no analytics, and no external HTTP calls.

File attachments are stored at:

```
%APPDATA%\com.flowboard.app\attachments\{task_id}\
```

---

## Build Phases

The project is built in 9 phases:

| Phase | Focus |
|---|---|
| 1 | Scaffold & infrastructure (Tauri, SQLite, Rust commands) |
| 2 | Core data layer, app shell, and project CRUD |
| 3 | People and sprint management |
| 4 | Task management (modal, detail panel, comments, attachments, time tracking) |
| 5 | All four board views with drag & drop |
| 6 | Gantt roadmap |
| 7 | Reports and charts |
| 8 | Inbox and native OS notifications |
| 9 | Polish, keyboard shortcuts, global search, app icon |

See [`PROGRESS.md`](./PROGRESS.md) for current status.

---

## Contributing & Development Notes

- See [`CLAUDE.md`](./CLAUDE.md) for the full project reference (coding standards, constraints, agent system).
- See [`DECISIONS.md`](./DECISIONS.md) for architectural decision rationale.
- See [`SCHEMA.md`](./SCHEMA.md) for the SQLite schema.
- See [`VISUAL.md`](./VISUAL.md) for design specifications.

Branches follow the convention `phase-N/task-N.N-short-description`. Never commit directly to `main`.
