# FlowBoard — Agent: skill:data-layer

**Primary Responsibility:** Data access layer consistency.

## Scope
- Zustand stores (`src/stores/`)
- All React Query hooks (`src/hooks/`)
- Tauri command wrappers (`src/lib/commands.ts`)
- Query key strategy and cache invalidation
- TypeScript type synchronization between Rust structs and frontend interfaces

## Rules
- React Query manages all server state (never store fetched data in Zustand)
- Every mutation must invalidate relevant queries
- Strict typing — no `any`
- Consistent query keys (e.g. `['tasks', projectId]`)
- Handle loading/error states properly in hooks

**Definition of Done:** All data operations are type-safe, cache is correctly invalidated, and components can consume clean hooks.