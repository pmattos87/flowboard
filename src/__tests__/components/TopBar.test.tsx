import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { TopBar } from "@/components/TopBar";
import { useUiStore } from "@/stores/uiStore";

const mockInvoke = vi.mocked(invoke);

function makePerson(id: number, name: string) {
  return { id, name, email: `p${id}@ex.com`, avatar_color: "#6366f1", role: "" };
}

function renderTopBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TopBar />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({ activeProjectId: null, createProjectModalOpen: false });
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
});
