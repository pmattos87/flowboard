import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { DiscoveryBoard } from "@/features/boards/DiscoveryBoard";
import { UserStoryBoard } from "@/features/boards/UserStoryBoard";
import { invisibleStories } from "@/features/boards/shared/invisibleStories";
import { useUiStore } from "@/stores/uiStore";
import type { Project, Task, TaskStatus, TaskType } from "@/types";

// FB-93: for a fixture holding every status x sprint x type, `invisibleStories`
// returns a row exactly when neither the Discovery board nor the User Story Board
// renders it.

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }));

const mockInvoke = vi.mocked(invoke);

const ALL_STATUSES: TaskStatus[] = [
  "todo", "in_progress", "in_review", "refining", "ready_for_development", "canceled", "done",
  "backlog", "ready", "building", "integrated_tests", "tested", "user_testing",
];

function fixture(): Task[] {
  const rows: Task[] = [];
  const kinds: { type: TaskType; parent_id: number | null }[] = [
    { type: "story", parent_id: null },
    { type: "epic", parent_id: null },
    { type: "bug", parent_id: null },
    { type: "bug", parent_id: 1 },
    { type: "subtask", parent_id: 1 },
  ];
  for (const { type, parent_id } of kinds) {
    for (const sprint_id of [null, 7]) {
      for (const status of ALL_STATUSES) {
        const id = rows.length + 1;
        rows.push({
          id, project_id: 1, task_number: id, sprint_id, parent_id,
          title: `${type}${parent_id ? "-child" : ""}-${status}-${sprint_id ?? "none"}`,
          description: "", type, status, priority: "medium",
          assignee_id: null, story_points: 0, due_date: null, created_at: "", updated_at: "",
          labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
          findings_url: null, run_stopped: false, risk: false, release_id: null, epic_id: null,
        });
      }
    }
  }
  return rows;
}

function project(ladder: Project["ladder"]): Project {
  return {
    id: 1, name: "Flowboard", key: "FB", description: "", color: "#6366f1", created_at: "",
    logo_data: null, position: 0, ladder, kind: "internal",
  };
}

const sprints = [
  { id: 7, project_id: 1, name: "Sprint 7", goal: "", status: "backlog", start_date: "2024-01-01", end_date: "2024-01-14" },
];

function renderBoard(board: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{board}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Titles of the fixture rows a board renders, once `marker` (a row it must show) is up. */
async function renderedTitles(board: React.ReactNode, marker: string, tasks: Task[]): Promise<Set<string>> {
  renderBoard(board);
  await screen.findByText(marker);
  const shown = new Set(tasks.filter((t) => screen.queryByText(t.title) !== null).map((t) => t.title));
  cleanup();
  return shown;
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({
    activeProjectId: 1, selectedTaskId: null, boardSprintFilter: "all", boardSprintFilterFor: 1,
    discoveryGrouping: "none",
  });
});

const CASES: { ladder: Project["ladder"]; discoveryMarker: string; storyMarker: string; isCandidate: (t: Task) => boolean }[] = [
  {
    ladder: "legacy",
    discoveryMarker: "story-ready_for_development-none",
    storyMarker: "story-in_progress-7",
    isCandidate: (t) => t.type === "story" || t.type === "epic",
  },
  {
    ladder: "factory",
    discoveryMarker: "story-backlog-none",
    storyMarker: "story-building-7",
    isCandidate: (t) => t.parent_id === null && (t.type === "story" || t.type === "bug"),
  },
];

describe("invisibleStories agrees with the boards", () => {
  for (const { ladder, discoveryMarker, storyMarker, isCandidate } of CASES) {
    it(`on a ${ladder} project, returns exactly the Story-level rows neither board renders`, async () => {
      const tasks = fixture();
      mockInvoke.mockImplementation((cmd) => {
        if (cmd === "get_project") return Promise.resolve(project(ladder));
        if (cmd === "list_projects") return Promise.resolve([project(ladder)]);
        if (cmd === "list_tasks") return Promise.resolve(tasks);
        if (cmd === "list_sprints") return Promise.resolve(sprints);
        return Promise.resolve([]);
      });

      const onDiscovery = await renderedTitles(<DiscoveryBoard />, discoveryMarker, tasks);
      const onStoryBoard = await renderedTitles(<UserStoryBoard />, storyMarker, tasks);

      const expected = tasks
        .filter((t) => isCandidate(t) && !onDiscovery.has(t.title) && !onStoryBoard.has(t.title))
        .map((t) => t.title);
      const returned = invisibleStories(tasks, ladder).map((t) => t.title);

      expect(returned).toEqual(expected);
      // The fixture exercises both outcomes.
      expect(returned.length).toBeGreaterThan(0);
      expect(onDiscovery.size + onStoryBoard.size).toBeGreaterThan(0);
      // No row is returned that a board renders.
      for (const title of returned) {
        expect(onDiscovery.has(title) || onStoryBoard.has(title)).toBe(false);
      }
    });
  }
});
