import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { ReactNode } from "react";
import { renderHook, act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { TaskFields, useTaskDraft } from "@/components/TaskFields";
import type { Task } from "@/types";

const baseTask: Task = {
  id: 7, project_id: 1, task_number: 12, sprint_id: null, parent_id: null,
  title: "Export contract", description: "Brief text", type: "story", status: "todo",
  priority: "high", assignee_id: null, story_points: 5, due_date: null,
  created_at: "", updated_at: "", labels: "", feature_branch: null,
  review_verdict: null, reviewed_commit: null, findings_url: null,
  run_stopped: false, risk: false, release_id: null, epic_id: null,
};

function setup(task: Task) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(({ t }) => useTaskDraft(t), { wrapper, initialProps: { t: task } });
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue(undefined);
});

describe("useTaskDraft re-sync", () => {
  it("takes a new server title and description for the same task", () => {
    const { result, rerender } = setup(baseTask);
    expect(result.current.draft.description).toBe("Brief text");
    rerender({ t: { ...baseTask, title: "New title", description: "New brief" } });
    expect(result.current.draft.title).toBe("New title");
    expect(result.current.draft.description).toBe("New brief");
  });

  it("keeps an edited field but updates untouched ones", () => {
    const { result, rerender } = setup(baseTask);
    act(() => result.current.setDraft((d) => ({ ...d, description: "My own text" })));
    rerender({ t: { ...baseTask, description: "Server brief", status: "building" } });
    expect(result.current.draft.description).toBe("My own text");
    expect(result.current.draft.status).toBe("building");
  });

  it("resets the whole draft when the task id changes", () => {
    const { result, rerender } = setup(baseTask);
    act(() => result.current.setDraft((d) => ({ ...d, description: "My own text" })));
    rerender({ t: { ...baseTask, id: 8, title: "Other", description: "Other brief" } });
    expect(result.current.draft.title).toBe("Other");
    expect(result.current.draft.description).toBe("Other brief");
  });

  it("takes outside updates again after the user's saved edit comes back", () => {
    const { result, rerender } = setup(baseTask);
    act(() => result.current.setDraft((d) => ({ ...d, description: "Saved text" })));
    // blur commit, refetch returns the user's value
    rerender({ t: { ...baseTask, description: "Saved text" } });
    expect(result.current.draft.description).toBe("Saved text");
    rerender({ t: { ...baseTask, description: "Later outside brief" } });
    expect(result.current.draft.description).toBe("Later outside brief");
  });

  it("does not revert a select saved via handleSelectChange on an unrelated refetch", () => {
    const { result, rerender } = setup(baseTask);
    act(() => result.current.handleSelectChange("priority", "low", "low"));
    // a refetch lands before the save, with another field changed and priority still old
    rerender({ t: { ...baseTask, title: "Outside title" } });
    expect(result.current.draft.priority).toBe("low");
    expect(result.current.draft.title).toBe("Outside title");
    // the saved value comes back, then an outside change to priority is taken
    rerender({ t: { ...baseTask, title: "Outside title", priority: "low" } });
    expect(result.current.draft.priority).toBe("low");
    rerender({ t: { ...baseTask, title: "Outside title", priority: "critical" } });
    expect(result.current.draft.priority).toBe("critical");
  });

  it("does not loop when rerendered with the same task object", () => {
    let renders = 0;
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ t }) => {
        renders += 1;
        return useTaskDraft(t);
      },
      { wrapper, initialProps: { t: baseTask } },
    );
    const before = renders;
    rerender({ t: baseTask });
    rerender({ t: baseTask });
    expect(renders - before).toBeLessThanOrEqual(2);
    expect(result.current.draft.title).toBe("Export contract");
  });
});

function PointsField({ task }: { task: Task }) {
  const state = useTaskDraft(task);
  return <TaskFields task={task} state={state} />;
}

function renderFields(task: Task, ladder: "legacy" | "factory") {
  vi.mocked(invoke).mockImplementation((cmd) => {
    if (cmd === "get_project") return Promise.resolve({ id: 1, ladder });
    return Promise.resolve([]);
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PointsField task={task} />
    </QueryClientProvider>,
  );
}

describe("TaskFields points", () => {
  it("is read-only on a Factory Story, whose points are its Subtasks' sum", async () => {
    renderFields(baseTask, "factory");
    await waitFor(() => expect(screen.getByLabelText("Points")).toHaveAttribute("readonly"));
  });

  it("stays editable on a Factory Subtask", async () => {
    renderFields({ ...baseTask, type: "subtask", parent_id: 3 }, "factory");
    await waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledWith("get_project", { id: 1 }));
    await act(async () => {}); // let the project query settle
    expect(screen.getByLabelText("Points")).not.toHaveAttribute("readonly");
  });

  it("stays editable on a legacy Story", async () => {
    renderFields(baseTask, "legacy");
    await waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledWith("get_project", { id: 1 }));
    await act(async () => {}); // let the project query settle
    expect(screen.getByLabelText("Points")).not.toHaveAttribute("readonly");
  });
});

// FB-52: on a Factory project a top-level bug is a Story (a fix).
describe("TaskFields bug Stories", () => {
  function renderWithTasks(task: Task, ladder: "legacy" | "factory", projectTasks: Task[]) {
    vi.mocked(invoke).mockImplementation((cmd) => {
      if (cmd === "get_project") return Promise.resolve({ id: 1, ladder });
      if (cmd === "list_tasks") return Promise.resolve(projectTasks);
      return Promise.resolve([]);
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PointsField task={task} />
      </QueryClientProvider>,
    );
  }

  const bugStory: Task = { ...baseTask, id: 20, task_number: 20, type: "bug", parent_id: null, title: "Crash fix", status: "backlog" };
  const feature: Task = { ...baseTask, id: 21, task_number: 21, title: "Feature story" };
  const bugSubtask: Task = { ...baseTask, id: 22, task_number: 22, type: "bug", parent_id: 21, title: "Found in testing" };
  const subtask: Task = { ...baseTask, id: 23, task_number: 23, type: "subtask", parent_id: 21, title: "A subtask" };

  it("hides the Parent select and makes points read-only on a Factory top-level bug", async () => {
    renderWithTasks(bugStory, "factory", [bugStory, feature]);
    await waitFor(() => expect(screen.getByLabelText("Points")).toHaveAttribute("readonly"));
    expect(screen.queryByLabelText("Parent story")).not.toBeInTheDocument();
  });

  it("lists bug Stories as well as Stories in a Factory Subtask's Parent select", async () => {
    renderWithTasks(subtask, "factory", [bugStory, feature, bugSubtask, subtask]);
    const select = screen.getByLabelText("Parent story") as HTMLSelectElement;
    await waitFor(() => expect(Array.from(select.options).map((o) => o.textContent)).toContain("Crash fix"));
    const names = Array.from(select.options).map((o) => o.textContent);
    expect(names).toEqual(["Crash fix", "Feature story"]);
  });

  // Review B1: "No parent" would turn a bug Subtask into a bug Story, which the
  // backend refuses, and the draft would then offer Story statuses.
  it("offers no 'No parent' on a Factory bug Subtask, so it keeps the Subtask statuses", async () => {
    renderWithTasks(bugSubtask, "factory", [bugStory, feature, bugSubtask]);
    const parent = screen.getByLabelText("Parent story") as HTMLSelectElement;
    // Wait for both the project (ladder) and the tasks, so the assertion can't run
    // against the pre-load legacy default.
    await waitFor(() =>
      expect(Array.from(parent.options).map((o) => o.textContent)).toEqual(["Crash fix", "Feature story"]),
    );
    expect(parent.value).toBe("21");
    const status = screen.getByLabelText("Status") as HTMLSelectElement;
    const values = Array.from(status.options).map((o) => o.value);
    // The Factory Subtask statuses: dev statuses without in_review, no Story stages.
    expect(values).toContain("in_progress");
    expect(values).not.toContain("in_review");
    expect(values).not.toContain("backlog");
    expect(values).not.toContain("building");
  });

  it("keeps 'No parent' on a legacy bug with a parent", async () => {
    renderWithTasks(bugSubtask, "legacy", [feature, bugSubtask]);
    const parent = screen.getByLabelText("Parent story") as HTMLSelectElement;
    await waitFor(() => expect(Array.from(parent.options).map((o) => o.textContent)).toContain("Feature story"));
    expect(Array.from(parent.options).map((o) => o.textContent)).toEqual(["No parent", "Feature story"]);
  });

  it("keeps the Parent select and editable points on a legacy top-level bug", async () => {
    renderWithTasks(bugStory, "legacy", [bugStory, feature]);
    const select = screen.getByLabelText("Parent story") as HTMLSelectElement;
    await waitFor(() => expect(Array.from(select.options).map((o) => o.textContent)).toContain("Feature story"));
    expect(Array.from(select.options).map((o) => o.textContent)).not.toContain("Crash fix");
    expect(screen.getByLabelText("Points")).not.toHaveAttribute("readonly");
  });
});

// FB-99: the labels field is a chip input that saves the joined labels.
describe("TaskFields labels", () => {
  function renderLabels(labels: string) {
    vi.mocked(invoke).mockImplementation((cmd) => {
      if (cmd === "get_project") return Promise.resolve({ id: 1, ladder: "legacy" });
      if (cmd === "list_tasks")
        return Promise.resolve([
          { ...baseTask, labels },
          { ...baseTask, id: 8, labels: "backend" },
          { ...baseTask, id: 9, project_id: 2, labels: "billing" },
        ]);
      return Promise.resolve([]);
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PointsField task={{ ...baseTask, labels }} />
      </QueryClientProvider>,
    );
    return screen.getByRole("combobox", { name: "Labels" });
  }

  const updateCalls = () => vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "update_task");

  it("saves the joined labels after a suggestion is picked", async () => {
    const user = userEvent.setup();
    const input = renderLabels("api");
    await user.type(input, "b");
    await user.click(await screen.findByRole("option", { name: "backend" }));
    expect(screen.queryByRole("option", { name: "billing" })).not.toBeInTheDocument();
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("update_task", { id: 7, payload: { labels: "api,backend" } });
  });

  it("saves the joined labels after a new label is entered", async () => {
    const user = userEvent.setup();
    const input = renderLabels("api");
    await user.type(input, "ui{Enter}");
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("update_task", { id: 7, payload: { labels: "api,ui" } });
  });

  it("drops a removed chip from the saved string", async () => {
    const user = userEvent.setup();
    renderLabels("api,ui");
    await user.click(screen.getByRole("button", { name: "Remove label api" }));
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("update_task", { id: 7, payload: { labels: "ui" } });
  });

  it("does not save when nothing changed", async () => {
    const user = userEvent.setup();
    const input = renderLabels("api");
    await user.click(input);
    await user.tab();
    await user.type(input, "api{Enter}");
    await user.tab();
    expect(updateCalls()).toHaveLength(0);
  });
});
