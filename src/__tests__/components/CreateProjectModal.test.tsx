import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { useUiStore } from "@/stores/uiStore";

const mockInvoke = vi.mocked(invoke);

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CreateProjectModal />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({ activeProjectId: null, createProjectModalOpen: false });
});

describe("CreateProjectModal", () => {
  it("is not visible when modal is closed", () => {
    renderModal();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders form fields when modal is open", () => {
    useUiStore.setState({ createProjectModalOpen: true });
    renderModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^key/i)).toBeInTheDocument();
  });

  it("submit is disabled when form is empty", () => {
    useUiStore.setState({ createProjectModalOpen: true });
    renderModal();
    expect(screen.getByRole("button", { name: /create project/i })).toBeDisabled();
  });

  it("submit is disabled when key is only 1 character", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ createProjectModalOpen: true });
    renderModal();
    await user.type(screen.getByLabelText(/^name/i), "Test");
    await user.type(screen.getByLabelText(/^key/i), "A");
    expect(screen.getByRole("button", { name: /create project/i })).toBeDisabled();
  });

  it("submit is enabled with valid name and 2-char key", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ createProjectModalOpen: true });
    renderModal();
    await user.type(screen.getByLabelText(/^name/i), "Alpha");
    await user.type(screen.getByLabelText(/^key/i), "AL");
    expect(screen.getByRole("button", { name: /create project/i })).toBeEnabled();
  });

  it("submit is enabled with valid name and 5-char key", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ createProjectModalOpen: true });
    renderModal();
    await user.type(screen.getByLabelText(/^name/i), "Alpha");
    await user.type(screen.getByLabelText(/^key/i), "ALPHA");
    expect(screen.getByRole("button", { name: /create project/i })).toBeEnabled();
  });

  it("key input is auto-uppercased", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ createProjectModalOpen: true });
    renderModal();
    const keyInput = screen.getByLabelText(/^key/i);
    await user.type(keyInput, "al");
    expect(keyInput).toHaveValue("AL");
  });

  it("calls createProject with correct payload and updates store on success", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ createProjectModalOpen: true });
    const fakeProject = { id: 42, name: "Alpha", key: "AL", description: "", color: "#6366f1", created_at: "" };
    mockInvoke.mockResolvedValueOnce(fakeProject);
    renderModal();

    await user.type(screen.getByLabelText(/^name/i), "Alpha");
    await user.type(screen.getByLabelText(/^key/i), "AL");
    await user.click(screen.getByRole("button", { name: /create project/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_project",
        expect.objectContaining({
          payload: expect.objectContaining({ name: "Alpha", key: "AL" }),
        })
      );
      expect(useUiStore.getState().activeProjectId).toBe(42);
      expect(useUiStore.getState().createProjectModalOpen).toBe(false);
    });
  });

  it("shows error message and keeps modal open on failure", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ createProjectModalOpen: true });
    mockInvoke.mockRejectedValueOnce(new Error("DB error"));
    renderModal();

    await user.type(screen.getByLabelText(/^name/i), "Alpha");
    await user.type(screen.getByLabelText(/^key/i), "AL");
    await user.click(screen.getByRole("button", { name: /create project/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("DB error");
    });
    expect(useUiStore.getState().createProjectModalOpen).toBe(true);
  });

  it("resets form fields when modal is reopened", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ createProjectModalOpen: true });
    renderModal();
    await user.type(screen.getByLabelText(/^name/i), "Alpha");

    act(() => useUiStore.setState({ createProjectModalOpen: false }));
    act(() => useUiStore.setState({ createProjectModalOpen: true }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^name/i)).toHaveValue("");
    });
  });
});
