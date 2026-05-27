import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import Inbox from "@/pages/Inbox";
import { useUiStore } from "@/stores/uiStore";

const mockInvoke = vi.mocked(invoke);

const fakeLog = [
  {
    id: 1,
    task_id: 1,
    person_id: 1,
    action: "created",
    old_value: "",
    new_value: "",
    created_at: "2026-05-01T10:00:00.000Z",
  },
  {
    id: 2,
    task_id: 1,
    person_id: 1,
    action: "status_changed",
    old_value: "todo",
    new_value: "done",
    created_at: "2026-05-02T12:00:00.000Z",
  },
];

const fakePeople = [
  { id: 1, name: "Alice", email: "alice@example.com", avatar_color: "#6366f1", role: "Dev" },
];

const fakeTasks = [
  {
    id: 1,
    project_id: 1,
    sprint_id: null,
    parent_id: null,
    title: "Fix login bug",
    description: "",
    type: "bug",
    status: "done",
    priority: "high",
    assignee_id: 1,
    story_points: 2,
    due_date: null,
    created_at: "2026-05-01T00:00:00",
    updated_at: "2026-05-01T00:00:00",
    labels: "",
  },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Inbox />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  localStorage.removeItem("lastInboxVisit");
  useUiStore.setState({
    activeProjectId: null,
    selectedTaskId: null,
    selectedSprintId: null,
    createProjectModalOpen: false,
    createTaskModalOpen: false,
  });
});

describe("Inbox — loading", () => {
  it("renders page heading while loading", () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("heading", { name: /inbox/i })).toBeInTheDocument();
  });
});

describe("Inbox — empty", () => {
  it("shows empty state when no activity exists", async () => {
    mockInvoke.mockResolvedValue([]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/no activity yet/i)).toBeInTheDocument(),
    );
  });
});

describe("Inbox — with activity", () => {
  beforeEach(() => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_all_activity_log") return Promise.resolve(fakeLog);
      if (cmd === "list_tasks") return Promise.resolve(fakeTasks);
      if (cmd === "list_people") return Promise.resolve(fakePeople);
      return Promise.resolve([]);
    });
    useUiStore.setState({ activeProjectId: 1 });
  });

  it("renders the Inbox heading", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /inbox/i })).toBeInTheDocument(),
    );
  });

  it("shows person name in an entry", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1),
    );
  });

  it("shows task title in an entry", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByText("Fix login bug").length).toBeGreaterThanOrEqual(1),
    );
  });

  it("shows human-readable action label for status_changed", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/changed status to done/i)).toBeInTheDocument(),
    );
  });

  it("unread entries have the unread border class", async () => {
    // lastInboxVisit not set → all entries are unread
    const { container } = renderPage();
    await waitFor(() =>
      expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1),
    );
    const unreadRows = container.querySelectorAll(".border-blue-500");
    expect(unreadRows.length).toBeGreaterThan(0);
  });

  it("no unread border when lastInboxVisit is in the future", async () => {
    localStorage.setItem("lastInboxVisit", "2099-12-31T23:59:59.000Z");
    const { container } = renderPage();
    await waitFor(() =>
      expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1),
    );
    expect(container.querySelectorAll(".border-blue-500").length).toBe(0);
  });
});
