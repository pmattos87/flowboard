/**
 * FB-211: each sidebar group's "Archived (n)" row and the Archive/Unarchive action on entries.
 * The drag test gives the two Internal rows fixed rects (jsdom has none), and PointerSensor
 * needs `isPrimary: true` with waitFor on the assertion (LESSONS, Phase 6 follow-up).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "@/components/Sidebar";
import { useUiStore } from "@/stores/uiStore";
import type { Client, Project, ProjectState } from "@/types";

const mockInvoke = vi.mocked(invoke);

function project(
  id: number,
  name: string,
  client_id: number | null,
  position: number,
  state: ProjectState = "active",
): Project {
  return {
    id, name, key: `P${id}`, description: "", color: "#6366f1", created_at: "",
    logo_data: null, position, ladder: "legacy", client_id,
    kind: client_id == null ? "internal" : "client",
    state,
  };
}

const CLIENTS: Client[] = [
  { id: 10, name: "Acme", position: 0 },
  { id: 20, name: "Beta", position: 1 },
  { id: 40, name: "Gone Co", position: 2 },
];

const ALL_ACTIVE: Project[] = [
  project(1, "Internal A", null, 0),
  project(2, "Internal B", null, 1),
  project(3, "Acme App", 10, 0),
  project(4, "Beta App", 20, 0),
];

const WITH_ARCHIVED: Project[] = [
  project(1, "Internal A", null, 0),
  project(2, "Internal B", null, 1),
  project(5, "Internal Old", null, 2, "archived"),
  project(3, "Acme App", 10, 0),
  project(6, "Acme Old 1", 10, 1, "archived"),
  project(7, "Acme Old 2", 10, 2, "archived"),
  project(4, "Beta App", 20, 0),
  project(8, "Gone App", 40, 0, "archived"),
];

/** Renders the Sidebar over a mutable project list; set_project_state updates it like the backend. */
function renderSidebar(initial: Project[]) {
  let projects = initial.map((p) => ({ ...p }));
  mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
    if (cmd === "list_projects") return projects;
    if (cmd === "list_clients") return CLIENTS;
    if (cmd === "set_project_state") {
      const { id, state } = args as { id: number; state: ProjectState };
      projects = projects.map((p) => (p.id === id ? { ...p, state } : p));
      return projects.find((p) => p.id === id);
    }
    if (cmd === "get_backup_status") {
      return { backup_dir: "G:\\Backups", last_backup_at: new Date().toISOString(), last_error: null, enabled: true };
    }
    return undefined;
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <Sidebar />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const section = (name: string) => screen.getByRole("region", { name });
const clientItem = (name: string) =>
  within(section("Clients")).getByText(name, { selector: "span" }).closest("li") as HTMLElement;
const archivedRow = (scope: HTMLElement) =>
  within(scope).queryByRole("button", { name: /^Archived \(\d+\)$/ });

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({ activeProjectId: null, collapsedClientIds: {}, openArchivedGroups: {} });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Sidebar Archived rows (FB-211)", () => {
  it("renders no Archived row in any group when no project is archived", async () => {
    renderSidebar(ALL_ACTIVE);
    await screen.findByText("Acme App");
    expect(screen.queryByText(/Archived/)).not.toBeInTheDocument();
  });

  it("shows Archived (n) only in the groups that have archived projects", async () => {
    renderSidebar(WITH_ARCHIVED);
    await screen.findByText("Acme App");

    expect(archivedRow(section("Internal"))).toHaveTextContent("Archived (1)");
    expect(archivedRow(clientItem("Acme"))).toHaveTextContent("Archived (2)");
    expect(archivedRow(clientItem("Beta"))).toBeNull();
    for (const row of screen.getAllByRole("button", { name: /^Archived/ })) {
      expect(row).toHaveAttribute("aria-expanded", "false");
    }
  });

  it("keeps archived projects out of the main list until the row is expanded, per group", async () => {
    const user = userEvent.setup();
    renderSidebar(WITH_ARCHIVED);
    await screen.findByText("Acme App");

    expect(screen.queryByText("Internal Old")).not.toBeInTheDocument();
    expect(screen.queryByText("Acme Old 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Acme Old 2")).not.toBeInTheDocument();

    await user.click(archivedRow(section("Internal"))!);
    expect(archivedRow(section("Internal"))).toHaveAttribute("aria-expanded", "true");
    const internalArchived = within(section("Internal")).getByRole("list", { name: "Archived projects" });
    expect(within(internalArchived).getByText("Internal Old")).toBeInTheDocument();
    // The main (sortable) list still holds only the active ones.
    const mainList = within(section("Internal")).getAllByRole("list")[0];
    expect(within(mainList).queryByText("Internal Old")).not.toBeInTheDocument();

    // Acme's row stays collapsed.
    expect(archivedRow(clientItem("Acme"))).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Acme Old 1")).not.toBeInTheDocument();
  });

  it("keeps the header of a client whose projects are all archived, with only its Archived row", async () => {
    renderSidebar(WITH_ARCHIVED);
    await screen.findByText("Acme App");

    const gone = clientItem("Gone Co");
    expect(within(gone).getByRole("button", { name: "Gone Co" })).toBeInTheDocument();
    expect(archivedRow(gone)).toHaveTextContent("Archived (1)");
    expect(within(gone).queryByText("Gone App")).not.toBeInTheDocument();
    expect(within(gone).queryByText("No projects")).not.toBeInTheDocument();
    expect(within(gone).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("Unarchive returns the project to its group's main list and drops the empty Archived row", async () => {
    const user = userEvent.setup();
    renderSidebar(WITH_ARCHIVED);
    await screen.findByText("Acme App");

    await user.click(archivedRow(section("Internal"))!);
    await user.click(screen.getByRole("button", { name: "Unarchive Internal Old" }));

    expect(mockInvoke).toHaveBeenCalledWith("set_project_state", { id: 5, state: "active" });
    await waitFor(() => expect(archivedRow(section("Internal"))).toBeNull());
    const names = within(section("Internal"))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(names).toEqual(["Internal A", "Internal B", "Internal Old"]);
  });

  it("archiving the open project leaves it selected", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ activeProjectId: 1 });
    renderSidebar(ALL_ACTIVE);
    await screen.findByText("Acme App");

    await user.click(screen.getByRole("button", { name: "Archive Internal A" }));

    expect(mockInvoke).toHaveBeenCalledWith("set_project_state", { id: 1, state: "archived" });
    await waitFor(() => expect(archivedRow(section("Internal"))).toHaveTextContent("Archived (1)"));
    expect(useUiStore.getState().activeProjectId).toBe(1);
  });

  it("expanding a client's Archived row leaves Internal's and other clients' rows collapsed", async () => {
    const user = userEvent.setup();
    renderSidebar(WITH_ARCHIVED);
    await screen.findByText("Acme App");

    await user.click(archivedRow(clientItem("Acme"))!);
    expect(archivedRow(clientItem("Acme"))).toHaveAttribute("aria-expanded", "true");
    expect(within(clientItem("Acme")).getByText("Acme Old 1")).toBeInTheDocument();
    expect(within(clientItem("Acme")).getByText("Acme Old 2")).toBeInTheDocument();
    expect(archivedRow(section("Internal"))).toHaveAttribute("aria-expanded", "false");
    expect(archivedRow(clientItem("Gone Co"))).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Internal Old")).not.toBeInTheDocument();
    expect(screen.queryByText("Gone App")).not.toBeInTheDocument();
  });

  it("Unarchive in a client group returns the project to that client's main list", async () => {
    const user = userEvent.setup();
    renderSidebar(WITH_ARCHIVED);
    await screen.findByText("Acme App");

    await user.click(archivedRow(clientItem("Gone Co"))!);
    await user.click(screen.getByRole("button", { name: "Unarchive Gone App" }));

    expect(mockInvoke).toHaveBeenCalledWith("set_project_state", { id: 8, state: "active" });
    await waitFor(() => expect(archivedRow(clientItem("Gone Co"))).toBeNull());
    const gone = clientItem("Gone Co");
    expect(within(gone).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Gone App"]);
    expect(within(section("Internal")).queryByText("Gone App")).not.toBeInTheDocument();
  });

  it("leaves archived projects out of a reorder", async () => {
    renderSidebar(WITH_ARCHIVED);
    await screen.findByText("Acme App");
    const rects = new Map<Element, DOMRect>();
    const place = (text: string, top: number) =>
      rects.set(screen.getByText(text).closest("li")!, {
        x: 0, y: top, width: 200, height: 36, top, left: 0, right: 200, bottom: top + 36,
        toJSON: () => ({}),
      } as DOMRect);
    place("Internal A", 0);
    place("Internal B", 40);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return rects.get(this) ?? ({
        x: -5000, y: -5000, width: 1, height: 1, top: -5000, left: -5000, right: -4999, bottom: -4999,
        toJSON: () => ({}),
      } as DOMRect);
    });

    const handle = screen.getByText("Internal A").closest("button")!;
    fireEvent.pointerDown(handle, { clientX: 50, clientY: 10, pointerId: 1, button: 0, isPrimary: true });
    fireEvent.pointerMove(handle, { clientX: 50, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 50, clientY: 50, pointerId: 1 });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("reorder_projects", { orderedIds: [2, 1] });
    });
  });
});
