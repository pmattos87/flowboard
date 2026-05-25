import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "@/components/Sidebar";
import { useUiStore } from "@/stores/uiStore";

const mockInvoke = vi.mocked(invoke);

function renderSidebar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <Sidebar />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const fakeProject = { id: 1, name: "Alpha", key: "AL", description: "", color: "#6366f1", created_at: "" };

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({ activeProjectId: null, createProjectModalOpen: false });
});

describe("Sidebar", () => {
  it("shows 'No projects yet' when project list is empty", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    renderSidebar();
    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    });
  });

  it("renders project names when projects are loaded", async () => {
    mockInvoke.mockResolvedValueOnce([fakeProject]);
    renderSidebar();
    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
    });
  });

  it("calls setActiveProjectId when a project is clicked", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce([fakeProject]);
    renderSidebar();
    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    await user.click(screen.getByText("Alpha"));
    expect(useUiStore.getState().activeProjectId).toBe(1);
  });

  it("applies active styling to the selected project", async () => {
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke.mockResolvedValueOnce([fakeProject]);
    renderSidebar();
    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    const btn = screen.getByText("Alpha").closest("button");
    expect(btn?.className).toContain("bg-gray-800");
  });

  it("opens create project modal when + button is clicked", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce([]);
    renderSidebar();
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    await user.click(screen.getByLabelText("Create project"));
    expect(useUiStore.getState().createProjectModalOpen).toBe(true);
  });
});
