import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import Settings from "@/pages/Settings";
import { useUiStore } from "@/stores/uiStore";

const mockInvoke = vi.mocked(invoke);

const fakeProject = {
  id: 1,
  name: "Alpha",
  key: "AL",
  description: "Desc",
  color: "#6366f1",
  created_at: "2024-01-01T00:00:00.000Z",
};

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Settings />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({ activeProjectId: null, createProjectModalOpen: false });
});

describe("Settings — no project selected", () => {
  it("shows select-project prompt when no project is active", () => {
    renderSettings();
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });
});

describe("Settings — loading state", () => {
  it("shows loading text while project is fetching", () => {
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke.mockReturnValue(new Promise(() => {}));
    renderSettings();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

describe("Settings — form", () => {
  async function loadProject() {
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke.mockResolvedValue(fakeProject);
    renderSettings();
    await waitFor(() => expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument());
  }

  it("populates form with project data", async () => {
    await loadProject();
    expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument();
    expect(screen.getByDisplayValue("AL")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Desc")).toBeInTheDocument();
  });

  it("shows a logo upload control and no color picker", async () => {
    await loadProject();
    expect(screen.getByRole("button", { name: /upload logo/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /choose color/i })).not.toBeInTheDocument();
  });

  it("save button is disabled when form is not dirty", async () => {
    await loadProject();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
  });

  it("save button is enabled when name is changed", async () => {
    const user = userEvent.setup();
    await loadProject();
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Beta");
    expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
  });

  it("save button is disabled when key is invalid (1 char)", async () => {
    const user = userEvent.setup();
    await loadProject();
    const keyInput = screen.getByLabelText("Key");
    await user.clear(keyInput);
    await user.type(keyInput, "A");
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
  });

  it("calls update_project with changed name", async () => {
    const user = userEvent.setup();
    await loadProject();
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Beta");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "update_project",
        expect.objectContaining({
          id: 1,
          payload: expect.objectContaining({ name: "Beta" }),
        })
      );
    });
  });

  it("shows error message when save fails", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ activeProjectId: 1 });
    // First call is get_project (load), second is update_project (save)
    mockInvoke
      .mockResolvedValueOnce(fakeProject)
      .mockRejectedValueOnce(new Error("Save failed"));
    renderSettings();
    await waitFor(() => expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument());

    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Beta");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
    });
  });
});

describe("Settings — delete", () => {
  async function loadProject() {
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke.mockResolvedValue(fakeProject);
    renderSettings();
    await waitFor(() => expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument());
  }

  it("shows delete confirmation when delete button is clicked", async () => {
    const user = userEvent.setup();
    await loadProject();
    await user.click(screen.getByRole("button", { name: /^delete project$/i }));
    expect(screen.getByRole("button", { name: /yes, delete project/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("hides confirmation when cancel is clicked", async () => {
    const user = userEvent.setup();
    await loadProject();
    await user.click(screen.getByRole("button", { name: /^delete project$/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("button", { name: /yes, delete project/i })).not.toBeInTheDocument();
  });

  it("calls delete_project and resets activeProjectId on confirm", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke
      .mockResolvedValueOnce(fakeProject) // get_project (load)
      .mockResolvedValueOnce(undefined)   // delete_project
      .mockResolvedValueOnce([]);          // list_projects (cache invalidation refetch)
    renderSettings();
    await waitFor(() => expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^delete project$/i }));
    await user.click(screen.getByRole("button", { name: /yes, delete project/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("delete_project", { id: 1 });
      expect(useUiStore.getState().activeProjectId).toBeNull();
    });
  });

  it("shows error and keeps modal open if delete fails", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke
      .mockResolvedValueOnce(fakeProject)
      .mockRejectedValueOnce(new Error("FK violation"));
    renderSettings();
    await waitFor(() => expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^delete project$/i }));
    await user.click(screen.getByRole("button", { name: /yes, delete project/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("FK violation");
    });
    expect(useUiStore.getState().activeProjectId).toBe(1);
  });
});
