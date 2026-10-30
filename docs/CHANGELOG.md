# FlowBoard — Changelog

**All notable changes to this project will be documented in this file.**

## [Unreleased]

## [1.12.0] - 2026-10-30

### Added
- Bugs as Stories (FB-52). On a Factory project, a `bug` row with no parent is now a Story (a fix), not a loose bug: it climbs the whole Story ladder (backlog to done), goes into a sprint at `ready`, is split into Subtasks, gets a branch, PR and Release, and shows up in `active_runs`, the boards, the Story page, sprint progress and reports like any Story. A `bug` with a Story as parent is still a bug Subtask of that Story, unchanged, and "waiting on bugs" still counts only a Story's bug children. No migration: the `type` vocabulary already allowed it. Legacy projects are unchanged: a top-level bug keeps its dev statuses and the Task Board "Unparented" row, and counts as a Story only on a Factory project. The rule lives in one predicate per language: `is_story_level` in `factory/ops.rs` (and `story_level_sql` for queries) and `isStoryLevel` in `src/lib/storyLevel.ts`.
- `story_create` takes `bug: true` in the MCP and `--bug` in the CLI (`flowboard-cli story create <project> <title> --bug`), which creates a top-level `bug` in `backlog`. The create-story modal offers Bug with no parent on a Factory project (status `backlog` or `refining`, Story statuses, points read-only). `story_show`, `story_create` and `release_show` JSON now carry `type`, and the Releases screen shows the Bug icon in red for a fix and the Story icon for a feature, in the pick candidates and in the picked rows.
- Epics as initiatives (FB-224). On a Factory project an epic groups the Stories of one goal that spans several Stories and Releases, so its progress is followed on the board. An epic is never built: no ladder, branch, Run, PR or Release pick, no sprint, no points and no Subtasks. It has its own small lifecycle on existing status values: `todo` (open) to `done`, or `canceled` from `todo`, closed by hand. A closed epic is never reopened and every other move is refused with a reason. Legacy projects are unchanged: their epics keep their statuses and the slide-over.
- Stories join an epic through the new nullable `tasks.epic_id` (never `parent_id`, which would stop the Story being a Story). A feature or bug Story joins an open epic of its own project only, while it is not `done` or `canceled`; a closed epic takes no new Stories, and a done or canceled Story's epic is frozen. Taking a Story out is otherwise always allowed. Deleting an epic leaves its Stories in place with no epic.
- `epic_create` and `epic_move` MCP tools, and `story_edit` takes `epic` (an epic key, or null to take the Story out), so a split can file Stories straight into an epic. The CLI gets `flowboard-cli epic create <project> <title>` and `epic move <KEY> <done|canceled>`, and `story edit --epic <KEY|none>`. `story_show` JSON now carries `epic` (key, title and status, or null).
- Epic progress, derived from the epic's Stories and never entered: building (`building` and `integrated_tests`), tested (`tested` and `user_testing`) and done stages, "n/m tested" (n counts `tested`, `user_testing` and `done`; m is every Story except `canceled`, Discovery-stage and scheduled Stories included) and the story points left (Stories not `done` or `canceled`).
- Story page: an Epic field in the header with a picker of the project's open epics plus "None" (disabled for a done or canceled Story, a refusal shows a toast). The create-story modal offers Epic as a type on a Factory project (open, no sprint, no points).
- Epic page at `/epic/:key` for a Factory epic: its Stories with their stage, the progress bar and the Close and Cancel controls while it is open; no Subtasks, Run or PR sections.
- Discovery board: a "Group by epic" / "No grouping" toggle on a Factory project. Grouped, each open epic gets a collapsible swimlane with its progress (counting all the epic's Stories, scheduled ones included) over the usual Discovery columns, and Stories without an epic go in a last "No epic" row. A done or canceled epic keeps its row only while it holds a Story the board shows. Cards drag between columns inside a row, not between rows (set the epic from the Story page). The toggle is session-only. Epics are never cards on the Factory Discovery board.
- New trail event `verify_started` (`new_value` `{"subtask": "<KEY>", "round": n}`, n is that Subtask's `verify_round` count plus 1), logged when a Subtask's Verify begins. It is the MCP tool `verify_start` (`{ key }`, the Subtask key) and the CLI command `flowboard-cli run verify-start <KEY>`. It refuses, in order, a parent Story that isn't `building`, a stopped Run, and a Subtask that isn't `in_progress`. No migration. The trail shows it as "<KEY> Verify rN started" (FB-277).

### Changed
- On a Factory project, `update_task` refuses a `parent_id` or `type` change that would move a row between Story level and Subtask level (a bug Story given a parent, a bug Subtask left without one, a bug Subtask retyped to `story`, a bug Story retyped to `subtask`). `story` <-> `bug` on a top-level row is allowed. Legacy projects are not affected.
- `complete_sprint` treats a Factory bug Story like a Story: it carries it and its Subtasks over, and a done bug Story with an unfinished Subtask blocks completion, in Rust and in the TS copy `openSubtasksUnderDoneStories`.
- `subtask_move`, `subtask_handoff` and `subtask_verify` refuse a top-level bug ("is not a Subtask"), and `story_*` calls refuse a bug Subtask ("is not a Story").
- Migration `013_epic_link.sql` adds `tasks.epic_id` (`REFERENCES tasks(id) ON DELETE SET NULL`) with `ALTER TABLE ADD COLUMN`, with no table rebuild; existing rows read NULL. It must ship in a FlowBoard Release with the CLI built from the same version, because the CLI's `open_existing` refuses a database at a different migration version.
- On a Factory project, a Subtask (or bug Subtask) can only be moved under a Story, not under an epic or another row that is not Story-level.
- Switching a legacy project to the Factory ladder counts an epic (open at `todo`, or closed) as mapped, so a project holding epics can switch.

### Fixed
- The Run graph lights Verify while QA runs: Verify is `current` while a `verify_started` is the pass's latest step, until a `verify_round`, a new `subtask_handoff` or a `review_started` ends it; a stopped or finished Build wins. Trails without the event render as before (FB-277).

## [1.11.0] - 2026-10-29

### Added
- Automatic backup of `flowboard.db` (FB-95). In Settings, the new Backup tab (also reachable at `/settings?tab=backup`) has a folder picker; backups stay off until a folder is chosen. The app snapshots the database (`VACUUM INTO`) at launch and 5 minutes after the last write (each new write restarts the wait, whether it came from the app or from the CLI/MCP while the app is open); writes made while the app is closed are caught at the next launch. It keeps one file per day, `flowboard-YYYY-MM-DD.db`, rewritten through the day, and the 10 newest are kept. Each copy is checked with `PRAGMA quick_check` before it counts; a failed copy is deleted and the last-backup time does not move. The folder and last-backup time are stored in `backup.json` in the app data folder. A warning card under the sidebar nav links to the Backup tab when there is no backup or the last one is more than 3 days old. The staging build (`com.flowboard.staging`) never writes a copy, but its Backup tab and sidebar card work. There is no restore screen: see "Restoring a backup" in the README.
- Known limitation: a backup folder whose name literally contains a `%XX` sequence fails verification; the failure is safe and shows as the last error in the Backup tab.
- "Complete sprint" button on each active sprint's row on the Sprint Planning board. It opens a dialog with the number of unfinished issues (every type, not done and not canceled; on Factory projects Stories at `integrated_tests`, `tested` and `user_testing` count) and where they go: by default the next sprint (the earliest not-completed sprint by start date), or another open sprint, or Backlog, or, when no open sprint exists, a new sprint (name, start date, end date). Issues keep their status when they move to a sprint; the destination sprint's own status is not changed. To Backlog, legacy Stories go back to `ready_for_development` with a `status_changed` activity row, and the option is disabled with the reason shown while a Factory Story is past `ready`. A done Story with an unfinished Subtask blocks completion, and the dialog names them. Done and canceled issues stay in the closed sprint, so velocity is unchanged. The new `complete_sprint` Tauri command (`completeSprint` wrapper, `useCompleteSprint` hook, helpers in `src/lib/sprintCompletion.ts`) moves the issues and completes the sprint in one transaction; a refusal changes nothing and is shown in the dialog. Factory Stories move through the same `set_sprint` in `factory/ops.rs` as `story_set_sprint` (FB-97).
- An active sprint whose end date is before today shows "Ended N days ago" next to the Complete sprint button on its Sprint Planning board row (FB-97).
- New trail event `review_started` (`new_value` `{"round": n}`, numbered like `review_round`), logged when a Review round begins. It is the MCP tool `review_start` (`{ key }`) and the CLI command `flowboard-cli run review-start <KEY>`. It refuses a Story that isn't `building` and a stopped Run, and does not check for open Subtasks. No migration. The trail shows it as "Review rN started" (FB-158).
- A Run's Simplify Subtask and its bug Subtasks now look different from the Subtasks in the plan. On the Run graph every Subtask card has a role icon before its key (blue checkbox for a plan Subtask, fuchsia wand for Simplify, red bug for a bug) and the agent line takes the role colour: `SIMPLIFY` for Simplify, `BUG · <agent> · <model>` (or `BUG · not handed out`) for a bug, teal agent for a plan Subtask. The Run legend lists the three roles. On Kanban cards Simplify shows the fuchsia wand, and the type badge of the task detail panel and the Story page shows a fuchsia "Simplify" badge. Simplify is recognised by a `subtask` titled `Simplify` or whose description starts with `agent: simplify` (`subtaskRole` in `src/lib/subtaskRole.ts`); it is a display role, not a new type, so there is no migration (FB-171).

### Changed
- A sprint can only be completed with the Complete sprint action: "Completed" is gone from the sprint edit dialog's status choices and `update_sprint` refuses changing a sprint's status to `completed`. An already completed sprint shows "Completed" read-only and can still be edited (name, goal, dates) (FB-97).
- On the Story page, the Run section (the graph, its legend, Review rounds and Trail) now sits at the top, full width, between the title and the description/sidebar row, so it is above the Details and Links sidebar instead of at the bottom of the page. The Run section's contents and the graph are unchanged (FB-150).
- Rust dev and test builds compile faster: `src-tauri/Cargo.toml` sets `[profile.dev] debug = "line-tables-only"` and `[profile.dev.package."*"] debug = false`, so `cargo test` (whose profile inherits dev), `tauri dev` and the Linux CI test build emit far less debug info. A one-line edit to `sprints.rs` followed by `cargo test` went from a 102 s median to 41 s (-60%) on Windows; a no-change rerun is unchanged. Backtraces still show file and line. `[profile.release]` and installer builds are untouched (FB-253).
- `npx vitest run` now runs the pure-logic tests (`src/**/*.test.ts`) under Node and the component tests (`src/**/*.test.tsx`) under jsdom, as two vitest `test.projects` in `vite.config.ts` that keep isolation and the threads pool. `src/setupTests.ts` is split into `src/setupCommon.ts` (jest-dom and the Tauri mocks, loaded by both projects) and `src/setupDom.ts` (ResizeObserver, matchMedia, scrollIntoView and pointer-capture stubs, jsdom only). A test that needs the DOM must be named `.test.tsx`; a `.test.ts` that touches `window` or `document` now fails loudly. The same 58 files and 539 tests run; the median full-run time went from 56 s to 52 s. A stale `@ts-expect-error` in `vite.config.ts` is removed so `tsc -p tsconfig.node.json` passes. Test tooling only; the app is unchanged (FB-254).
- The backend agent now takes column values and constraints from `docs/SCHEMA.md` and uses the shared Rust test fixtures for new tests. `src-tauri/src/test_support.rs` (test builds only) provides an in-memory pool with every migration applied and the helpers `pool()`, `project()`, `factory_project()`, `sprint()` and `task()`, with closed `TaskType`, `TaskStatus` (the 13 values of migration 011's CHECK) and `SprintStatus` enums; a test inserts every type and status pair and checks that out-of-set values are refused. The 11 tests in `commands/sprints.rs` moved onto it; other modules' tests are unchanged. Builders in a Factory Run now write a test that fails without their change and run only the changed module's tests, while QA runs the full Gates at Verify (`CLAUDE.md` Definition of Done item 6). Outside a Run the full suites still run. Tooling and tests only; the app is unchanged (FB-255).

### Fixed
- The Run graph lights Code review while a Review round runs: Docs is `done` and Code review is `current` from `review_started` until that round's `review_round`, scoped to the current pass. Fix findings is `done` once the next round starts after a failed one, and a stop during a running round counts as a Review stop. Trails without the event render as before (FB-158).
- The flaky `npx vitest run` failure is found and fixed: "SprintFormDialog — date validation > clears the error when end date is corrected to equal start date" could time out at 5000 ms under CPU load, because each field was typed key by key with `userEvent.type` and every keystroke re-rendered the dialog. The SprintFormDialog tests now set each field with one change event, and the submit test checks the full `create_sprint` payload. Test-only change; the app is unchanged (FB-252).

## [1.10.0] - 2026-10-26

### Changed
- On Factory projects a Story's points are the sum of its Subtasks' points: creating, canceling or reopening a Subtask, or changing its points, updates the Story's total. Bug Subtasks and canceled ones don't count. The Story's points field is read-only, and the velocity and workload reports count each Story once instead of again through its Subtasks. A Story with 0 points can't move from `refining` to `ready`; split it first. Migration `012_story_points_backfill.sql` sets the total once for Factory Stories that were already split (SF-68).
- Upgrade the app and `flowboard-cli`/MCP together: after migration 012 the previous build's CLI refuses the database.

## [1.9.0] - 2026-10-25

### Added
- Each sprint's header on the Sprint Planning board (not the Ready for Development row) shows its completion after the date range: `<done> / <total> pts · <percent>%`, with a 2px bar along the header's bottom filled to the percent. The bar is emerald at 100% (with at least one done point) whatever the sprint's status, otherwise blue for an active sprint and gray for the rest. Hovering the figure lists the points per status label (canceled is marked "(not counted)"). Only stories count, not bugs or subtasks; only status `done` counts as done on both ladders (on Factory projects `integrated_tests`, `tested` and `user_testing` are in the total but not done, as in the velocity chart); canceled stories leave the total. The calculation is the `sprintCompletion` helper in `src/lib/sprintProgress.ts` (FB-119).

### Changed
- Story comments now render as Markdown (headings, lists, code, tables) the same way descriptions do, on the Story page and in the task detail panel. Editing a comment still shows the raw Markdown, and `comment-<id>` links still scroll to the comment (FB-149).
- Descriptions and comments also render GFM tables (with dark-mode borders, scrolling when wide), task lists and strikethrough, through `remark-gfm`. Links still show as plain text, bare URLs are not linked and images are not loaded. D-012 is updated (FB-149).
- On the Story page, each key in the Links section's "Depends on" field is now a link to that Story's page (`/story/<KEY>`), comma-separated; an empty list still shows "—". Dependencies are stored and loaded as before (FB-178).

### Fixed
- The Run graph shows the second pass after a bug loop, not the first pass's green checks: Verify, Docs, Code review, Fix findings, PR opened and Auto-merge now take their state only from events since the Story last entered building. Review rounds and the "fails twice" stop count are counted per pass, and PR opened's caption reads "N PRs · PR gate: Review passed" once the Story has opened two or more PRs into develop (FB-176).
- The Run graph's edges now show how the Run went: a Subtask's line to Verify lights green as soon as that Subtask is done, even while Verify waits for the others; and the Stop gates show where the Run stopped. The Build lane's "Stop, tell Pedro" gate takes Verify's "fails twice" edge. Review and Integrate stops go to a second Stop gate in the Review lane, under Auto-merge, with an edge from Fix findings ("fails twice"), Auto-merge ("fails") and Code review ("Codex unavailable"). The edge that carries the stop is red, the others dimmed dashed, and each gate counts only its own side's past stops ("stopped N× · restarted"). The old Fix findings line to the Build lane's Stop gate round the right padding is gone (FB-125).
- The Run graph's "Stop, tell Pedro" node no longer sticks out above the BUILD lane box when a Story has one or two Subtasks: the lane's contents move down when the Subtask stack is short. The lane's top and the layout with three or more Subtasks are unchanged (FB-151).
- The Run graph shows full node titles: stage, ship and plan node titles wrap to two lines and show the whole title in a tooltip on hover (so "Auto-merge → develop" is no longer cut off); Subtask cards get the taller two-line layout whenever the title's worst-case width doesn't fit beside its key (wide or long titles, symbols, non-Latin text, long keys) and the BUILD lane is laid out from the real card heights. The gate node "In integrated tests" is now called "Integrated tests" (FB-164).
- The Run graph's loop edges follow the same rule as the rest of the graph: dashed means "not reached yet", solid means "this connection fired". An activated loop is drawn solid in its loop colour (indigo for the findings loops, amber for the bug loop from Integrated tests back to the Orchestrator); loops that haven't fired stay dashed grey. The Fix findings → Orchestrator loop now leaves from the bottom-centre of the Fix findings card instead of its right edge, then runs along its turn line and up the left padding into the Orchestrator (FB-173).

## [1.8.0] - 2026-10-23

### Changed
- The open app now shows writes made by other processes (the Flowboard CLI and the `flowboard` MCP, for example during a Factory Run) within about a second, without reopening a screen or pressing Refresh: the Story page status and run graph, the boards, the Releases screen and the task detail panel. The Rust backend checks `PRAGMA data_version` on a dedicated connection once a second and emits a `db-changed` event, and the frontend invalidates all queries on it. The app's own edits also fire the signal once, which causes one extra refetch and no loop. No schema change; if the watcher can't connect, it is logged and the app works without live refresh (FB-124).
- The task title, description and other fields in the Story page and the task detail panel take an outside update when you haven't edited that field; a field you changed keeps your text (FB-124).
- The issue type `task` is now `subtask`: migration `011_subtask_type.sql` converts existing rows (parent links, comments, time logs and activity are kept) and the CHECK vocabulary becomes `story | bug | subtask | epic`. The UI says "Subtask" for the type, "Create subtask", "Cancel subtask", the "Subtask title" placeholder, "Add subtask to ...", the Inbox "created subtask" text, the toasts, the search badge and the Reports series; "Task Board" keeps its name. The `tasks` table keeps its name (D-013, FB-101).
- Upgrade the app and `flowboard-cli`/MCP together: after migration 011 the previous build's CLI refuses the database.

## [1.7.0] - 2026-10-22

### Added
- **Story page** on Factory projects: clicking a Story on a board (or in search) opens its own page with its details, Feature branch and PR links to GitHub, Run flags and the stopped-Run box, and its Subtasks as a mini kanban showing each one's agent, Verify rounds and stopped badge; a Subtask opens in the detail panel. Boards gain a canceled toggle, and the Task board is hidden on Factory projects (SF-61).
- **Run graph** on the Story page: the Story's Run drawn as a node graph (each lane boxed, the current node highlighted, failure and findings loops coloured), with its Code review rounds and Run trail beneath. A cross-project **Active Runs** overview lists every running Story, with a Needs Pedro filter (SF-62).
- `flowboard-cli story comment <KEY> --body <text> | --body-file <file>` (and the `story_comment` MCP tool): post a comment on a Factory Story as the acting person (the agent by default). It returns the comment's id and a `flowboard://comment/<id>` link, which the Factory's Review uses as a round's findings link. Refused on legacy projects, on Subtasks and for an empty body (SF-58).

### Changed
- FlowBoard now bundles only the NSIS setup `.exe` (`bundle.targets = ["nsis"]`), and a GitHub Release attaches only `src-tauri/target/release/bundle/nsis/*-setup.exe`. The `.msi` installer is dropped (FB-113).

## [1.6.0] - 2026-10-22

### Added
- Task descriptions render as Markdown (headings, lists, inline and fenced code) in the task detail panel. Click the description, or press Enter on it, to edit the raw text; leaving the field saves it unchanged. Links show as text and images are not loaded (`react-markdown`, D-012, FB-100).
- `flowboard-cli release list` / `release set-version` (and the `release_list` / `release_set_version` MCP tools): list a Factory project's Releases with their state and Story count, and change a Release's version while it is still planned (SF-43).
- **Releases** page (sidebar) on Factory projects: Releases grouped by state, each open one listing its picked Stories (Remove) and the tested Stories not yet in a Release (Pick). **New release** picks the ticked tested Stories and suggests the version: the last released version with the minor bumped if any ticked branch is `feat/`, otherwise the patch; empty before the first release. A pick's depends-on warnings show as a toast. Every action goes through the Factory's Release operations, as the owner (SF-44).

### Changed
- Moving a Release moves its picked Stories in the same transaction: `user_testing` sends them to user_testing, `released` to done, each through the Story ladder with its trail event. The move is refused, and nothing changes, when the Release has no picks or a pick isn't tested (or user_testing, for a Release leaving user_testing) (SF-43).
- The Releases page is tidier: content is centered at a max width, and the Planned, User testing, Released and Canceled headings show a count badge. An open Release card (planned or user testing) shows the version on the left and a readiness summary on the right (for example "2 stories · 1 tested · 1 building", with coloured dots), above a Story / Status / Action table: the title over a muted key, a coloured status pill (emerald for tested or done, amber for building, integrated tests or user testing, gray otherwise) and outlined Remove buttons with accessible labels. The "Tested, not in a release" candidates sit under the table in the same row layout, with a Tested pill and an outlined Pick button. Released and canceled Releases are compact collapsible rows (version, story count, state pill, and the release date for released) that load their Stories only when expanded, without an Action column. Display only: no data, hook or backend changes (FB-110).

### Changed
- The task detail panel's Delete button is now **Cancel task**: it sets the status to `canceled` without a confirmation, keeps comments, time logs, attachments and activity, and is hidden on canceled or done issues. Reopen through the Status picker. Canceling a Story does not cancel its open Subtasks (FB-98, FB-106).
- On the Factory ladder `canceled` is no longer terminal: a canceled Story reopens to `backlog`, `refining` or `ready` (inside a sprint only `ready`), and a canceled Subtask to `todo`. `done` stays terminal. The flowboard MCP and CLI accept these moves (FB-105).

### Removed
- The `delete_task` Tauri command, its `deleteTask` wrapper and the `useDeleteTask` hook. The app has no hard-delete path for an issue (FB-107).

## [1.5.1] - 2026-08-05

### Added
- Comments can be edited from the task detail panel. An edited comment shows "(edited)" beside its timestamp; the author is fixed at creation (migration `009_comment_edited_at.sql`, FB-46).

### Changed
- The Discovery board's first column is labelled **BACKLOG** instead of "TO DO", and the Sprint Planning board's unscheduled row — plus its filter option — is now **Ready for Development**. Display only: no status values, droppable ids or filter types changed (FB-91).
- The "Ready for Development" gate now applies to every way of assigning a sprint, not just the Sprint Planning board drop. The task detail panel's Sprint picker and the Create task modal both enforce it and surface the same toast. The gate applies to stories only — tasks, bugs and epics never enter the discovery lifecycle (FB-90).
- The User Story Board shows only scheduled stories: the "no sprint" filter option is gone and "All sprints" excludes unscheduled stories. They were previously listed twice — once on the Discovery board under BACKLOG and again here under TO DO.

### Fixed
- A story dragged into a sprint and straight back out no longer disappears from the Sprint Planning board. Unscheduling now restores "Ready for Development" rather than leaving the story at a dev-workflow status the unscheduled row does not render.
- Picking a sprint in the task detail panel now moves the story into the dev workflow, as a board drop already did. Previously the story kept its discovery status while sitting in the sprint, and the User Story Board — which renders the dev-workflow columns and matches each by exact status — drew it in no column at all.

## [1.5.0] - 2026-07-05

### Added
- Global search matches a story's ticket key (e.g. `VP-344`) or bare task number, full or partial, in addition to the title (task 504).
- Sprint goal is shown in each sprint's header on the Sprint Planning board (task 531).
- Discovery board now uses a story-discovery lifecycle — **To Do → Refining → Ready for Development**, plus **Canceled**; the two new statuses are offered only for stories & epics (migration `008_story_phases.sql`, FB-85).

### Changed
- Confirmation notifications (task created, status changed, comment added) now use in-app toasts instead of native OS notifications; removed the unused `notify()` wrapper (task 530).
- Only stories marked "Ready for Development" appear in the Sprint Planning backlog and can be scheduled into a sprint; scheduling one resets its status to "To Do" for the dev workflow, and a blocked attempt shows an explanatory toast (FB-85).

### Fixed
- Native date-picker calendar icon (Due date, sprint start/end dates) renders light to match the dark theme, via `color-scheme: dark` (task 532).

### Version bumps
- `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, About page → `1.5.0`

## [1.4.0] - 2026-06-17

### Added
- Drag-and-drop reordering of projects in the sidebar (FB-51).

### Changed
- Sprint sections now render in a fixed order: active, then backlog, then completed (FB-50).
- Scrollbars styled to match the dark theme (FB-53).

### Version bumps
- `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, About page → `1.4.0`

## [1.3.0] - 2026-06-10

### Added
- Refresh button next to each board title (Task / User Story / Discovery / Sprint Planning) that re-syncs the UI with the database by invalidating every React Query cache.

### Changed
- Attachments are now stored as a BLOB in the database (migration `006_attachment_content.sql`) instead of by filesystem path.
- Sprint board collapses completed sprints by default.
- Wider default window (1600px), centered on open; staging window matches the production default size.
- About page logo rendered at natural aspect ratio, sized to the sidebar, flush-left with tightened spacing.

### Fixed
- Refresh icon now spins for one full rotation on click — the spin was gated only on `useIsFetching()`, and local SQLite refetches finish within a frame, so the animation was imperceptible.

### Repo
- Pinned the vitest pool to threads.

### Version bumps
- `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, About page → `1.3.0`

## [1.2.0] - 2026-06-02

### Added
- Project logos (FB-41): upload a per-project logo with a random fallback color when none is set. Adds the `projects.logo_data` column (migration `005_project_logo.sql`), the `ProjectBadge` component, transparency-preserving image helpers, and logo support in the Create Project modal, Settings, Sidebar, and TopBar.

### Documentation
- Repointed logo references in `CLAUDE.md` and `docs/VISUAL.md` to the new high-resolution reference assets (`assets/Logo_hi-res.png`, `Logo_Hi-res_noBckgrnd.png`, `Logo_Hi-res_noSquare_noBckgrnd.png`) and clarified the design-reference vs runtime-asset (`public/logo.png`) split.

### Version bumps
- `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, About page → `1.2.0`

## [1.1.1] - 2026-06-01

### Added
- Profile photos for people (FB-8): upload a profile picture with a random fallback color when none is set. Adds the `people.avatar_data` column, `Avatar` component, and image helpers.

### Version bumps
- `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, About page → `1.1.1`

## [1.1.0] - 2026-06-01

### Version bumps
- `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, About page → `1.1.0`

## [1.0.1] - 2026-05-27 — Branding Patch

Patch release replacing the default Tauri application icon with the FlowBoard logo across all generated icon sizes (taskbar, window header, installer, Start Menu shortcut, desktop shortcut).

### Changed
- Regenerated `src-tauri/icons/*` from `assets/logo-noBackground.png` via `npx tauri icon`
- Added `scripts/pad-icon.ps1` helper that pads a non-square source PNG to a 1024×1024 transparent canvas so it can be consumed by the Tauri icon generator
- Added `assets/logo-square.png` (1024×1024 padded source used to drive icon generation)

### Version bumps
- `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, About page → `1.0.1`

## [1.0.0] - 2026-05-27 — Stable Release

First stable release. The MVP defined by Phases 1–9 is complete, and the Phase 10 hierarchy pipeline, per-project task numbering, and staging-environment gating shipped on top.

### Added
- **Phase 10 — Hierarchy: Sprint Filters, Story Grouping, Backlog Pipeline** (PR #26)
  - **Task 10.1** Shared `boardSprintFilter` (`"all" | "backlog" | number`) in `uiStore` + `createTaskPrefill`; reusable `SprintFilterSelect` component
  - **Task 10.2** User Story Board narrowed by the sprint filter
  - **Task 10.3** Task Board grouped by parent story with sprint filter, collapsible story rows, per-row droppables, and an `Unparented` trailing pseudo-row
  - **Task 10.4** Discovery Board narrowed to `sprint_id IS NULL` (backlog of epics/stories)
  - **Task 10.5** Sprint Planning backlog narrowed to stories only + backend cascade: updating a story's `sprint_id` updates all of its task/bug children in the same SQL transaction
  - **Task 10.6** Tests & DoD enforcement (Rust cascade unit tests; Vitest for filter store, grouping reducer, Discovery filter)
  - Parent-story dropdown added to the Task Detail panel; Task Board DnD across story rows reparents children
- **Per-project task numbering** (migration `002_task_number.sql`)
  - New `tasks.task_number INTEGER NOT NULL` column with `UNIQUE(project_id, task_number)` enforced by `idx_tasks_project_number`
  - Sequence assigned per-project on insert; existing rows backfilled by migration; `seed_demo_data` populates `task_number`
  - UI now renders user-facing keys as `{projects.key}-{tasks.task_number}` (e.g., `P1-1`, `P1-2`)
- **Staging environment scaffolding**
  - `is_staging_build` + `seed_demo_data` Tauri commands
  - Sidebar `STAGING` badge and seed controls

### Fixed
- **#27** STAGING badge and seed controls now gate on `VITE_APP_ENV` rather than `import.meta.env.DEV`, so a production build of the staging configuration no longer leaks the badge into the release-mode UI

### Changed
- Sidebar logo simplified
- Global search expanded to tasks, sprints, projects, and people

### Documentation
- `docs/PLAN.md` marked v1.0.0 shipped
- `docs/DECISIONS.md` D-009 (per-project task numbering) and D-010 (story → child sprint cascade) appended
- `docs/SCHEMA.md` updated with `task_number` column and uniqueness rule
- `chore(repo)`: removed standalone `HIERARCHY.md` planning doc (work captured in PROGRESS/CHANGELOG)

### Version bumps
- `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, About page → `1.0.0`

---

## [0.9-polish] - 2026-05-27 — Phase 9: Polish & UX

### Added
- **Task 9.1** Loading skeletons — animated `<SkeletonRow>` component replaces plain "Loading…" text in People, Sprints, and Inbox pages
- **Task 9.1** Error toasts — `sonner` library wired into all mutation `onError` callbacks (tasks, people, sprints, projects, comments); dark-theme `<Toaster>` mounted in `App.tsx`
- **Task 9.2** Keyboard shortcuts — global `keydown` listener in `AppShell`: `n` opens Create Task modal, `/` focuses the search input; no-ops when an input is focused
- **Task 9.3** Global search — TopBar search input is now fully functional; filters active project's tasks client-side (≥ 2 chars, max 8 results) in a floating dropdown; clicking a result opens the Task Detail panel
- **Task 9.4** About page at `/about` — app name, version, description, tech stack badges; linked from sidebar footer alongside Settings

### Fixed
- Sidebar logo `src="/logo.png"` was already correctly served from `public/logo.png` — confirmed working, no change needed

---

## [0.8-alerts] - 2026-05-27 — Phase 8: Inbox & Notifications

### Added
- **Task 8.1** Inbox page at `/inbox` — reverse-chronological activity feed powered by new `list_all_activity_log` Rust command; unread entries highlighted with a blue left border; read state tracked via `localStorage.lastInboxVisit`
- **Task 8.2** Native OS notifications — `src/lib/notifications.ts` wraps `@tauri-apps/plugin-notification` JS API; fires on task create, task status update, and comment add; silently no-ops if permission denied
- **Task 8.3** Notification bell badge — TopBar bell shows red unread count badge (capped at "9+"); clears after visiting Inbox; click navigates to `/inbox`
- New Rust command `list_all_activity_log` — returns the 200 most recent activity log entries across all tasks, DESC
- `useAllActivityLog()` React Query hook

---

## [0.7-reports] - 2026-05-27 — Phase 7: Reports

### Added
- **Task 7.1** Burndown chart — ideal vs actual remaining tasks per day, derived from `activity_log` status-change entries
- **Task 7.2** Velocity chart — story points completed per completed sprint (bar chart)
- **Task 7.3** Status Distribution chart — donut chart of tasks by status (todo / in_progress / in_review / done)
- **Task 7.4** Workload chart — horizontal bar chart of task count + story points per team member
- `ReportsPage` at `/reports` — sprint selector, 2×2 responsive chart grid; replaces placeholder
- New Rust command `list_activity_log_by_sprint` (Prep-0) and `useSprintActivityLog` hook
- All charts built with Recharts (already in dependency tree); dark-mode palette throughout

---

## [0.6-roadmap] - 2026-05-26 — Phase 6: Roadmap

### Added
- **Task 6.1** Roadmap page — read-only Gantt-style timeline rendering sprints across a date range scoped to the active project
- **Task 6.2** Draggable bars + today indicator — sprint bars are draggable along the timeline; vertical "today" marker overlaid on the chart
- `SprintFormDialog` extracted from the Sprints page as a reusable component (pre-step for 6.1)
- Vitest coverage for the roadmap: `dateMath` utilities and `RoadmapPage` rendering / interaction tests

### Changed
- `chore(repo)`: Phase 6 (Gantt) reassigned to `skill:backend-engineer` to match `PLAN.md` and the agent registry

### Known Issues
- `src/__tests__/features/KanbanBoard.dnd.test.tsx > invokes update_task with the new status after a cross-column drag` is temporarily `it.skip`'d. The production fix it guards (TaskCard keeps `setNodeRef` mounted during drag) is still in place; the failure is in the jsdom rect-mock scaffolding. See `docs/LESSONS.md` → "Stale jsdom rect-mock in KanbanBoard DnD test" and `docs/PLAN-KANBAN-DND-TEST-FIX.md` for the repair plan.

### Documentation
- `docs/LESSONS.md` — new Execution Mistakes entry for the stale jsdom rect-mock with explicit follow-up to restore the skipped test
- `docs/PLAN-KANBAN-DND-TEST-FIX.md` — investigation and repair plan for the skipped DnD regression test

---

## [0.5-boards] - 2026-05-26 — Phase 5: Board Views

### Added
- **Task 5.1** User Story Board — kanban columns with draggable `TaskCard`
- **Task 5.2** Task Board — kanban + drag-and-drop across status columns
- **Task 5.3** Discovery Board — epics / stories layout
- **Task 5.4** Sprint Planning Board — dual-panel Backlog ↔ Sprint with DnD; `selectedSprintId` added to `uiStore`
- **Task 5.5** Shared `KanbanBoard` DnD context with `DragOverlay`
- `TaskCard`, `KanbanColumn`, and board-constants modules (status columns, type / priority metadata)
- Vitest coverage for all Phase 5 boards (`UserStoryBoard`, `TaskBoard`, `DiscoveryBoard`, `SprintPlanningBoard`, `KanbanBoard`, `TaskCard`)
- Rust unit tests in `commands::tasks::tests` locking `Option<Option<T>>` deserialization behavior

### Fixed
- DnD cards "disappeared" on drop: `KanbanColumn` and `SprintPlanningBoard.DroppablePanel` were unmounting the source `TaskCard` mid-drag, clearing its `useDraggable` `data.current` and aborting the mutation. Render the placeholder *inside* the same draggable instead.
- Sprint → Backlog drag silently no-op'd: serde's default `Deserialize` for `Option<Option<T>>` collapses incoming `null` and absent into outer `None`, so `update_task` could never bind `sprint_id = NULL`. Added a `deserialize_optional_field` helper and applied it to `sprint_id`, `parent_id`, `assignee_id`, `due_date` on `TaskUpdate`.

### Documentation
- `docs/LESSONS.md` — new entries for DnD draggable-unmount anti-pattern (Recurring Patterns) and serde double-Option gotcha (Documentation Gaps)
- `chore(repo)`: allow `Bash(git tag *)` in `.claude/settings.json` allowlist

---

## [0.4-tasks] - 2026-05-25 — Phase 4: Task Management

### Added
- **Task 4.1** Task creation modal — full field set; wired to `TopBar` Create button; `createTaskModalOpen` / `selectedTaskId` added to `uiStore`
- **Task 4.2** Task detail slide-over panel — title, type, status, priority, assignee, story points, due date, labels
- **Task 4.3** Comments section inside the detail panel
- **Task 4.4** File attachments via `tauri-plugin-dialog` native file picker; paths stored in SQLite
- **Task 4.5** Time tracking — per-person time logs on each task

---

## [0.3-mgmt] - 2026-05-25 — Phase 3: People & Sprint Management

### Added
- **Task 3.1** People page — team roster with avatar, role, email; full CRUD with inline delete confirmation
- **Task 3.2** Sprints page — list / create / edit / delete, scoped to the active project, with status badges and date range

---

## [0.2-core] - 2026-05-25 — Phase 2: Core Data Layer & Navigation

### Added
- **Task 2.1** Typed Tauri command wrappers (`src/lib/commands.ts`), React Query hooks for all 8 entities, and UI store extensions
- **Task 2.2** App shell — 220 px sidebar (later widened to 256 px), 48 px top bar, `HashRouter` + route stubs for every nav target
- **Task 2.3** Create Project modal + Settings page with edit / delete; shadcn/ui primitives wired in
- Vitest unit suite (70 tests across 9 files) covering hooks, stores, and components

### Fixed
- Project deletion failing under foreign-key constraints — set `PRAGMA foreign_keys = ON` in `db/mod.rs`
- Sidebar subtitle line break — widened sidebar to 256 px

---

## [0.1-infra] - 2026-05-25 — Phase 1: Scaffold & Infrastructure

### Added
- **Task 1.1** Tauri v2 + React 18 + TypeScript + Vite scaffold; Tailwind v4 with permanent `dark` class on `<html>`; `@/` alias mirrored in `tsconfig.json`
- **Task 1.2** shadcn/ui foundation, React Query, Zustand, shared TS types, staging build profile
- **Task 1.3** SQLite schema + migrations via `tauri-plugin-sql`; `SCHEMA.md` FK / nullability rules clarified (only `tasks.sprint_id`, `tasks.parent_id`, `tasks.assignee_id` nullable; all other FKs `NOT NULL` + `ON DELETE CASCADE`)
- **Task 1.4** Rust CRUD commands across 8 entities — 31 `#[tauri::command]` handlers

---

## [0.0.1] - 2026-05-21 (Project Initialization)

### Added
- Full documentation and agent framework for structured AI-assisted development
- Detailed build plan with phased tasks and handoff protocols
- Core constraints, tech stack decisions, and visual specifications
- Agent role definitions for specialized development (frontend-design, backend-engineer, etc.)

### Architecture Decisions
- Tauri v2 + React 18 + TypeScript + SQLite (local-first)
- Dark mode only
- shadcn/ui + Tailwind + React Query + Zustand
- `@dnd-kit` for drag & drop

**Note:** Actual codebase scaffolding (Phase 1) has not started yet.

---

## Format Guidelines

- Follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) conventions
- Use Semantic Versioning
- Add new entries at the top under `[Unreleased]`

**Last Updated:** May 27, 2026 (v1.0.0 release)