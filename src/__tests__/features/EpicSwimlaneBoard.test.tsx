import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { EpicSwimlaneBoard } from "@/features/boards/shared/EpicSwimlaneBoard";
import { FACTORY_STORY_COLUMNS } from "@/features/boards/shared/boardConstants";
import { buildEpicRows } from "@/features/boards/shared/epicGrouping";
import type { Project, Task } from "@/types";

// FB-294: the swimlane board renders the columns and empty message it is given.

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: null, parent_id: null,
    title: "", description: "", type: "story", status: "backlog", priority: "medium",
    assignee_id: null, story_points: 0, due_date: null, created_at: "", updated_at: "",
    labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
    findings_url: null, run_stopped: false, risk: false, release_id: null, epic_id: null,
    ...over,
  };
}

const project: Project = {
  id: 1, name: "Flowboard", key: "FB", description: "", color: "#6366f1", created_at: "",
  logo_data: null, position: 0, ladder: "factory", kind: "internal",
};

function renderBoard(rows: ReturnType<typeof buildEpicRows>, tasks: Task[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <EpicSwimlaneBoard
          rows={rows}
          tasks={tasks}
          columns={FACTORY_STORY_COLUMNS}
          emptyMessage="No Stories in this sprint."
          people={[]}
          project={project}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("EpicSwimlaneBoard", () => {
  it("renders each row with the columns it is given", () => {
    const epic = task({ id: 10, task_number: 10, type: "epic", status: "todo", title: "Hosted web app" });
    const card = task({ id: 1, epic_id: 10, sprint_id: 7, status: "building", title: "Build me" });
    const all = [epic, card];
    renderBoard(buildEpicRows([card], all, { keepEmptyOpenEpics: false }), all);

    const region = screen.getByRole("region", { name: "Hosted web app" });
    expect(within(region).getByText("Build me")).toBeInTheDocument();
    expect(within(region).getByText("BUILDING")).toBeInTheDocument();
    expect(within(region).getByText("INTEGRATED TESTS")).toBeInTheDocument();
    expect(within(region).queryByText("REFINING")).not.toBeInTheDocument();
  });

  it("shows the given empty message when there is no row", () => {
    renderBoard([], []);
    expect(screen.getByText("No Stories in this sprint.")).toBeInTheDocument();
  });
});
