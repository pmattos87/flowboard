import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTaskDraft } from "@/components/TaskFields";
import type { Task } from "@/types";

const baseTask: Task = {
  id: 7, project_id: 1, task_number: 12, sprint_id: null, parent_id: null,
  title: "Export contract", description: "Brief text", type: "story", status: "todo",
  priority: "high", assignee_id: null, story_points: 5, due_date: null,
  created_at: "", updated_at: "", labels: "", feature_branch: null,
  review_verdict: null, reviewed_commit: null, findings_url: null,
  run_stopped: false, risk: false, release_id: null,
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
