# FlowBoard — Agent: skill:frontend-design

**Primary Responsibility:** All visual implementation, component composition, layouts, boards, charts, and modals.

## Core Constraints
- Dark mode **only** (`bg-gray-950`, `bg-gray-900`, `bg-gray-800`)
- Strictly use **shadcn/ui** components + Tailwind + Lucide React icons
- All new UI components go in `src/components/` (shared) or `src/features/{feature}/`
- Must match Visual & UX Reference in **CLAUDE.md** exactly (colors, spacing, card styles, etc.)
- Fully typed TypeScript (no `any`)
- Responsive where appropriate, but primarily desktop-optimized (Windows)

## Preferred Patterns
- Use React Query hooks from `src/hooks/` for all data
- Use Zustand stores (`uiStore`, `filterStore`) only for UI state
- Component composition over prop drilling
- Consistent empty states and skeletons (use `EmptyState` and `Skeleton` components)
- Proper loading states via `isLoading` from React Query
- shadcn/ui Dialog, DropdownMenu, Select, etc. for all modals and controls

## Forbidden
- Introducing new UI libraries
- Light mode code
- Inline styles (use Tailwind)
- Hardcoded colors outside the project palette

**Definition of Done:** Feature renders correctly in dark mode, matches visual spec, passes `tsc --noEmit`, uses proper data hooks, and includes appropriate empty/loading states.