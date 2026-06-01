import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { TopBar } from "@/components/TopBar";
import { useUiStore } from "@/stores/uiStore";

const mockInvoke = vi.mocked(invoke);

function makePerson(id: number, name: string) {
  return { id, name, email: `p${id}@ex.com`, avatar_color: "#6366f1", role: "" };
}

function renderTopBar(path = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <TopBar />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({
    activeProjectId: null,
    createProjectModalOpen: false,
    createTaskModalOpen: false,
    createTaskPrefill: null,
  });
});

describe("TopBar", () => {
  it("shows 'No project selected' when activeProjectId is null", async () => {
    mockInvoke.mockResolvedValue([]);
    renderTopBar();
    await waitFor(() => {
      expect(screen.getByText(/no project selected/i)).toBeInTheDocument();
    });
  });

  it("shows project name when a project is active", async () => {
    useUiStore.setState({ activeProjectId: 1 });
    const project = { id: 1, name: "Alpha", key: "AL", description: "", color: "#6366f1", created_at: "" };
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_project") return Promise.resolve(project);
      return Promise.resolve([]);
    });
    renderTopBar();
    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
    });
  });

  it("displays initials for a single-word name", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_people") return Promise.resolve([makePerson(1, "Alice")]);
      return Promise.resolve([]);
    });
    renderTopBar();
    await waitFor(() => {
      expect(screen.getByTitle("Alice")).toHaveTextContent("A");
    });
  });

  it("displays two initials for a two-word name", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_people") return Promise.resolve([makePerson(1, "Alice Bob")]);
      return Promise.resolve([]);
    });
    renderTopBar();
    await waitFor(() => {
      expect(screen.getByTitle("Alice Bob")).toHaveTextContent("AB");
    });
  });

  it("shows at most 4 avatars when more than 4 people exist", async () => {
    const people = Array.from({ length: 6 }, (_, i) => makePerson(i + 1, `Person${i + 1}`));
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_people") return Promise.resolve(people);
      return Promise.resolve([]);
    });
    renderTopBar();
    await waitFor(() => {
      expect(screen.getByTitle("Person1")).toBeInTheDocument();
      expect(screen.getByTitle("Person4")).toBeInTheDocument();
      expect(screen.queryByTitle("Person5")).not.toBeInTheDocument();
    });
  });

  it("shows no avatars when people list is empty", async () => {
    mockInvoke.mockResolvedValue([]);
    renderTopBar();
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    expect(screen.queryByTitle(/person/i)).not.toBeInTheDocument();
  });

  it("renders the notifications bell button", async () => {
    mockInvoke.mockResolvedValue([]);
    renderTopBar();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument(),
    );
  });

  it("shows no badge when there are no unread entries", async () => {
    localStorage.setItem("lastInboxVisit", new Date().toISOString());
    mockInvoke.mockResolvedValue([]);
    renderTopBar();
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    // Badge element should not be present
    expect(screen.queryByText(/^\d+$|^9\+$/)).not.toBeInTheDocument();
  });

  it("labels the create button 'Create' on non-story boards (FB-40)", async () => {
    mockInvoke.mockResolvedValue([]);
    renderTopBar("/board/task");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^create$/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /create story/i })).not.toBeInTheDocument();
  });

  it("labels the create button 'Create Story' and locks type on the user-story board (FB-40)", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue([]);
    renderTopBar("/board/user-story");
    const btn = await screen.findByRole("button", { name: /create story/i });
    await user.click(btn);
    const state = useUiStore.getState();
    expect(state.createTaskModalOpen).toBe(true);
    expect(state.createTaskPrefill).toEqual({ type: "story", lockType: true });
  });

  it("labels the create button 'Create Story' on the discovery board (FB-40)", async () => {
    mockInvoke.mockResolvedValue([]);
    renderTopBar("/board/discovery");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /create story/i })).toBeInTheDocument(),
    );
  });

  it("shows badge count when there are unread activity entries", async () => {
    localStorage.removeItem("lastInboxVisit");
    const fakeLog = [
      { id: 1, task_id: 1, person_id: 1, action: "created", old_value: "", new_value: "", created_at: "2099-01-01T00:00:00.000Z" },
      { id: 2, task_id: 2, person_id: 1, action: "status_changed", old_value: "todo", new_value: "done", created_at: "2099-01-01T00:00:01.000Z" },
    ];
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_all_activity_log") return Promise.resolve(fakeLog);
      return Promise.resolve([]);
    });
    renderTopBar();
    await waitFor(() =>
      expect(screen.getByText("2")).toBeInTheDocument(),
    );
  });
});
