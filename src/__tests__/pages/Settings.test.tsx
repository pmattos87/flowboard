import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, MemoryRouter } from "react-router-dom";
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
  logo_data: null,
  client_id: null,
  kind: "internal" as const,
};

const CLIENTS = [
  { id: 10, name: "Acme", position: 0 },
  { id: 20, name: "Beta", position: 1 },
];

/**
 * FB-207: the Project tab also loads clients. list_clients answers CLIENTS;
 * every other command takes the next queued answer, then falls back to `fallback`.
 */
function mockCommands(fallback: () => Promise<unknown>, ...queue: (() => Promise<unknown>)[]) {
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "list_clients") return CLIENTS;
    return (queue.shift() ?? fallback)();
  });
}

function renderSettings(path = "/settings") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Settings />
      </QueryClientProvider>
    </MemoryRouter>
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

describe("Settings — tab search param", () => {
  it("opens on the Backup tab for /settings?tab=backup", async () => {
    mockInvoke.mockResolvedValue({
      backup_dir: null,
      last_backup_at: null,
      last_error: null,
      enabled: true,
    });
    renderSettings("/settings?tab=backup");
    expect(await screen.findByText(/no folder chosen/i)).toBeInTheDocument();
    expect(screen.queryByText(/select a project/i)).not.toBeInTheDocument();
  });

  it("lets a tab click switch away from the ?tab=backup tab", async () => {
    mockInvoke.mockResolvedValue({
      backup_dir: null,
      last_backup_at: null,
      last_error: null,
      enabled: true,
    });
    renderSettings("/settings?tab=backup");
    expect(await screen.findByText(/no folder chosen/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Project" }));
    expect(await screen.findByText(/select a project/i)).toBeInTheDocument();
    expect(screen.queryByText(/no folder chosen/i)).not.toBeInTheDocument();
  });

  it("opens on the Project tab for an unknown tab value", () => {
    renderSettings("/settings?tab=nope");
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });
});

describe("Settings — reopening the Backup tab from the warning link", () => {
  it("lands on Backup again after switching to other tabs", async () => {
    mockInvoke.mockResolvedValue({
      backup_dir: null,
      last_backup_at: null,
      last_error: null,
      enabled: true,
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <QueryClientProvider client={qc}>
          <Link to="/settings?tab=backup">warning</Link>
          <Settings />
        </QueryClientProvider>
      </MemoryRouter>
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("link", { name: "warning" }));
    expect(await screen.findByText(/no folder chosen/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Project" }));
    expect(screen.queryByText(/no folder chosen/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "warning" }));
    expect(await screen.findByText(/no folder chosen/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keyboard Shortcuts" }));
    expect(screen.queryByText(/no folder chosen/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "warning" }));
    expect(await screen.findByText(/no folder chosen/i)).toBeInTheDocument();
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
    mockCommands(async () => fakeProject);
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
    mockCommands(
      async () => fakeProject,                               // fallback
      async () => fakeProject,                               // get_project (load)
      async () => { throw new Error("Save failed"); },  // the mutation
    );
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

describe("Settings — client (FB-207)", () => {
  async function loadProject(clientId: number | null) {
    useUiStore.setState({ activeProjectId: 1 });
    mockCommands(async () => ({ ...fakeProject, client_id: clientId }));
    renderSettings();
    await waitFor(() => expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument());
    await screen.findByRole("option", { name: "Beta" });
  }

  it("shows the project's current client", async () => {
    await loadProject(10);
    expect(screen.getByLabelText("Client")).toHaveValue("10");
  });

  it("changing only the client counts as an unsaved change and saves client_id", async () => {
    const user = userEvent.setup();
    await loadProject(null);
    const save = screen.getByRole("button", { name: /save changes/i });
    expect(save).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Client"), "Beta");
    expect(save).toBeEnabled();
    await user.click(save);
    await user.click(await screen.findByRole("button", { name: /confirm and save/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("update_project", {
        id: 1,
        payload: { name: "Alpha", key: "AL", description: "Desc", logo_data: null, client_id: 20 },
      });
    });
  });

  const INTERNAL_HINT = "Releases go from tested straight to production.";
  const CLIENT_HINT =
    "Adds User testing between tested and production, with betas and client documents.";

  it("starts the Workflow hint from a stored client and follows unsaved changes (FB-304)", async () => {
    const user = userEvent.setup();
    await loadProject(10);
    const select = screen.getByLabelText("Client");
    expect(select).toHaveAccessibleDescription(CLIENT_HINT);

    await user.selectOptions(select, "None (internal)");
    expect(select).toHaveAccessibleDescription(INTERNAL_HINT);
    expect(screen.queryByText(CLIENT_HINT)).not.toBeInTheDocument();

    await user.selectOptions(select, "Beta");
    expect(select).toHaveAccessibleDescription(CLIENT_HINT);
    expect(mockInvoke).not.toHaveBeenCalledWith("update_project", expect.anything());
  });

  it("starts the Workflow hint from no stored client (FB-304)", async () => {
    const user = userEvent.setup();
    await loadProject(null);
    const select = screen.getByLabelText("Client");
    expect(select).toHaveAccessibleDescription(INTERNAL_HINT);
    expect(screen.queryByText(CLIENT_HINT)).not.toBeInTheDocument();

    await user.selectOptions(select, "Acme");
    expect(select).toHaveAccessibleDescription(CLIENT_HINT);
  });

  it("choosing None (internal) saves client_id: null", async () => {
    const user = userEvent.setup();
    await loadProject(10);
    await user.selectOptions(screen.getByLabelText("Client"), "None (internal)");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await user.click(await screen.findByRole("button", { name: /confirm and save/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "update_project",
        expect.objectContaining({ id: 1, payload: expect.objectContaining({ client_id: null }) }),
      );
    });
  });
});

describe("Settings — kind change confirmation and Client badge (FB-305)", () => {
  type StoredProject = Omit<typeof fakeProject, "client_id" | "kind" | "logo_data"> & {
    client_id: number | null;
    kind: "internal" | "client";
    logo_data: string | null;
  };

  /**
   * get_project answers the stored project; update_project stores the payload
   * (with the kind the backend computes from client_id), so the refetch after a
   * Save re-renders Settings with the updated project.
   */
  async function loadProject(clientId: number | null, logoData: string | null = null) {
    let stored: StoredProject = {
      ...fakeProject,
      client_id: clientId,
      kind: clientId === null ? "internal" : "client",
      logo_data: logoData,
    };
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === "list_clients") return CLIENTS;
      if (cmd === "update_project") {
        const { payload } = args as {
          payload: Omit<StoredProject, "id" | "color" | "created_at" | "kind">;
        };
        stored = { ...stored, ...payload, kind: payload.client_id === null ? "internal" : "client" };
        return stored;
      }
      return stored;
    });
    renderSettings();
    await waitFor(() => expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument());
    await screen.findByRole("option", { name: "Beta" });
  }

  const updateCalls = () => mockInvoke.mock.calls.filter(([cmd]) => cmd === "update_project");
  const editingLine = () => screen.getByText(/^Editing/);

  it("asks before saving None -> a client, and says User testing is added", async () => {
    const user = userEvent.setup();
    await loadProject(null);
    await user.selectOptions(screen.getByLabelText("Client"), "Acme");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "User testing is added between tested and production, with betas and client documents.",
    );
    expect(updateCalls()).toHaveLength(0);
  });

  it("asks before saving a client -> None, warns about User testing and betas, and does not block", async () => {
    const user = userEvent.setup();
    await loadProject(10);
    await user.selectOptions(screen.getByLabelText("Client"), "None (internal)");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("User testing, betas and client documents are removed.");
    expect(dialog).toHaveTextContent("Stories in User testing or open betas are affected.");
    expect(within(dialog).getByRole("button", { name: /confirm and save/i })).toBeEnabled();
    expect(updateCalls()).toHaveLength(0);
  });

  it("confirming saves once with the new client_id and the other edits, and the badge appears after the refetch", async () => {
    const user = userEvent.setup();
    await loadProject(null);
    expect(within(editingLine()).queryByText("Client")).not.toBeInTheDocument();

    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Gamma");
    await user.selectOptions(screen.getByLabelText("Client"), "Acme");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await user.click(await screen.findByRole("button", { name: /confirm and save/i }));

    await waitFor(() => expect(updateCalls()).toHaveLength(1));
    expect(updateCalls()[0][1]).toEqual({
      id: 1,
      payload: { name: "Gamma", key: "AL", description: "Desc", logo_data: null, client_id: 10 },
    });
    await waitFor(() => expect(within(editingLine()).getByText("Client")).toBeInTheDocument());
    expect(editingLine()).toHaveTextContent("Gamma");
    expect(updateCalls()).toHaveLength(1);
  });

  it("confirming client -> None saves client_id: null, and the badge disappears after the refetch", async () => {
    const user = userEvent.setup();
    await loadProject(10);
    expect(within(editingLine()).getByText("Client")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Client"), "None (internal)");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await user.click(await screen.findByRole("button", { name: /confirm and save/i }));

    await waitFor(() => expect(updateCalls()).toHaveLength(1));
    expect(updateCalls()[0][1]).toEqual({
      id: 1,
      payload: { name: "Alpha", key: "AL", description: "Desc", logo_data: null, client_id: null },
    });
    await waitFor(() =>
      expect(within(editingLine()).queryByText("Client")).not.toBeInTheDocument(),
    );
  });

  it("cancelling saves nothing, restores the stored client and keeps other unsaved edits", async () => {
    const user = userEvent.setup();
    await loadProject(null);
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Gamma");
    await user.selectOptions(screen.getByLabelText("Client"), "Acme");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Client")).toHaveValue("");
    expect(screen.getByLabelText("Name")).toHaveValue("Gamma");
    expect(updateCalls()).toHaveLength(0);
  });

  it("cancelling client -> None with Escape saves nothing, restores the stored client and keeps the description edit (QA)", async () => {
    const user = userEvent.setup();
    await loadProject(10);
    await user.type(screen.getByLabelText("Description"), "!");
    await user.selectOptions(screen.getByLabelText("Client"), "None (internal)");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Client")).toHaveValue("10");
    expect(screen.getByLabelText("Description")).toHaveValue("Desc!");
    expect(within(editingLine()).getByText("Client")).toBeInTheDocument();
    expect(updateCalls()).toHaveLength(0);
  });

  it("the To-Client dialog carries no User testing warning (QA)", async () => {
    const user = userEvent.setup();
    await loadProject(null);
    await user.selectOptions(screen.getByLabelText("Client"), "Acme");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).not.toHaveTextContent("Stories in User testing or open betas are affected.");
    expect(dialog).not.toHaveTextContent("are removed");
  });

  it("moving from one client to another saves straight away with no dialog", async () => {
    const user = userEvent.setup();
    await loadProject(10);
    await user.selectOptions(screen.getByLabelText("Client"), "Beta");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateCalls()).toHaveLength(1));
    expect(updateCalls()[0][1]).toEqual(
      expect.objectContaining({ payload: expect.objectContaining({ client_id: 20 }) }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("editing only name, key and description saves straight away with no dialog", async () => {
    const user = userEvent.setup();
    await loadProject(10);
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Gamma");
    const keyInput = screen.getByLabelText("Key");
    await user.clear(keyInput);
    await user.type(keyInput, "GA");
    await user.type(screen.getByLabelText("Description"), "!");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateCalls()).toHaveLength(1));
    expect(updateCalls()[0][1]).toEqual({
      id: 1,
      payload: { name: "Gamma", key: "GA", description: "Desc!", logo_data: null, client_id: 10 },
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("editing only the logo saves straight away with no dialog", async () => {
    const user = userEvent.setup();
    await loadProject(null, "data:image/png;base64,AAAA");
    await user.click(screen.getByRole("button", { name: /^remove$/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateCalls()).toHaveLength(1));
    expect(updateCalls()[0][1]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ logo_data: null, client_id: null }),
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Settings — delete", () => {
  async function loadProject() {
    useUiStore.setState({ activeProjectId: 1 });
    mockCommands(async () => fakeProject);
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
    mockCommands(
      async () => [],                // list_projects (cache invalidation refetch)
      async () => fakeProject,       // get_project (load)
      async () => undefined,         // delete_project
    );
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
    mockCommands(
      async () => fakeProject,                               // fallback
      async () => fakeProject,                               // get_project (load)
      async () => { throw new Error("FK violation"); },  // the mutation
    );
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
