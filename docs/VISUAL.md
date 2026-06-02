## Visual & UX Reference

**Design System & Component Specifications** (Dark mode only)

### App Shell

- **Sidebar** (fixed 220px, `bg-gray-950`):
  - Logo:
    - Use the official FlowBoard wordmark lockup (`public/logo.png`, served at `/logo.png`)
    - Hi-res reference: `/assets/Logo_hi-res.png` (and `_noBckgrnd` / `_noSquare_noBckgrnd` variants)
    - Display icon + wordmark lockup
    - Subtitle: `PLAN • FLOW • DELIVER`
    - Sidebar placement: top-left
    - Logo container height: 56px
    - Preserve dark spacing and glow aesthetics
  - Projects section with colored square icons (20px) + `+` button
  - Navigation (flat list with Lucide icons):
    - Discovery Board
    - User Story Board
    - Task Board
    - Sprint Planning Board
    - Sprints
    - Roadmap
    - Reports
    - People
    - Inbox
  - Settings pinned at bottom

- **Top Bar** (`bg-gray-900`, height 48px):
  - Left: Project color square + active project name
  - Center: Search input (`bg-gray-800`)
  - Right: `+ Create` (blue), notification bell, 4 overlapping user avatars

- **Main Content**: `bg-gray-900`, `p-6`

## Kanban Column Labels & Colors

| Status       | Label         | Dot Color |
|--------------|---------------|-----------|
| todo         | TO DO         | gray      |
| in_progress  | IN PROGRESS   | blue      |
| in_review    | IN REVIEW     | yellow    |
| done         | DONE          | green     |

## Task Type Colors

| Type   | Color  |
|--------|--------|
| Story  | Green  |
| Bug    | Red    |
| Task   | Blue   |
| Epic   | Purple |

## Priority Icons
- Critical → red chevron
- High → orange chevron  
- Medium → yellow chevron
- Low → gray chevron

## Task Card Composition
Every task card must contain (in order):
- Type icon (colored)
- Title
- Label badges (if any)
- Priority icon
- Story points
- Ticket ID (e.g. `FB-42`)
- Assignee avatar (or placeholder)

**Design Tokens to Use:**
- Backgrounds: `bg-gray-950` (sidebar), `bg-gray-900` (main), `bg-gray-800` (cards, surfaces)
- Strictly use **shadcn/ui** components + Tailwind
- All new components in `src/components/` or feature folders

**See also:** `CLAUDE.md` for overall constraints.