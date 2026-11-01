/**
 * FB-206: the Sidebar's Internal and Clients sections, and drag-to-reorder within a group.
 *
 * jsdom returns all-zero rects, so the drag tests give each sortable <li> a fixed rect
 * (everything else sits far off-screen). Layout, 36px rows:
 *   Internal A  y 0..36       Internal B  y 40..76
 *   Acme group  y 100..180    (its project "Acme App" y 140..176)
 *   Beta group  y 200..280    (its project "Beta App" y 240..276)
 *   Empty Co    y 300..336
 * PointerSensor needs `isPrimary: true`, and dnd-kit settles the drop asynchronously,
 * so assertions use waitFor (LESSONS, Phase 6 follow-up).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "@/components/Sidebar";
import { useUiStore } from "@/stores/uiStore";
import type { Client, Project } from "@/types";

const mockInvoke = vi.mocked(invoke);

function project(id: number, name: string, client_id: number | null, position: number): Project {
  return {
    id, name, key: `P${id}`, description: "", color: "#6366f1", created_at: "",
    logo_data: null, position, ladder: "legacy", client_id,
    kind: client_id == null ? "internal" : "client",
  };
}

const PROJECTS: Project[] = [
  project(1, "Internal A", null, 0),
  project(2, "Internal B", null, 1),
  project(3, "Acme App", 10, 0),
  project(4, "Beta App", 20, 0),
];

const CLIENTS: Client[] = [
  { id: 10, name: "Acme", position: 0 },
  { id: 20, name: "Beta", position: 1 },
  { id: 30, name: "Empty Co", position: 2 },
];

function renderSidebar() {
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "list_projects") return PROJECTS;
    if (cmd === "list_clients") return CLIENTS;
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
const itemOf = (text: string) => screen.getByText(text).closest("li") as HTMLElement;
const handleOf = (text: string) => screen.getByText(text).closest("button") as HTMLElement;

function stubRects() {
  const rects = new Map<Element, DOMRect>();
  const place = (text: string, top: number, height: number) =>
    rects.set(itemOf(text), {
      x: 0, y: top, width: 200, height, top, left: 0, right: 200, bottom: top + height,
      toJSON: () => ({}),
    } as DOMRect);
  place("Internal A", 0, 36);
  place("Internal B", 40, 36);
  place("Acme", 100, 80);
  place("Acme App", 140, 36);
  place("Beta", 200, 80);
  place("Beta App", 240, 36);
  place("Empty Co", 300, 36);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return rects.get(this) ?? ({
      x: -5000, y: -5000, width: 1, height: 1, top: -5000, left: -5000, right: -4999, bottom: -4999,
      toJSON: () => ({}),
    } as DOMRect);
  });
}

/** Drags `text`'s handle straight down by `dy` pixels and drops it. */
function dragDown(text: string, dy: number) {
  const handle = handleOf(text);
  fireEvent.pointerDown(handle, { clientX: 50, clientY: 10, pointerId: 1, button: 0, isPrimary: true });
  fireEvent.pointerMove(handle, { clientX: 50, clientY: 20, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 50, clientY: 10 + dy, pointerId: 1 });
  fireEvent.pointerUp(handle, { clientX: 50, clientY: 10 + dy, pointerId: 1 });
}

const reorderCalls = () =>
  mockInvoke.mock.calls.filter(([cmd]) => cmd === "reorder_projects" || cmd === "reorder_clients");

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({ activeProjectId: null, collapsedClientIds: {} });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Sidebar sections (FB-206)", () => {
  it("lists client-less projects under Internal and each client's projects under its heading", async () => {
    renderSidebar();
    await screen.findByText("Acme App");

    const internal = section("Internal");
    expect(within(internal).getByText("Internal A")).toBeInTheDocument();
    expect(within(internal).getByText("Internal B")).toBeInTheDocument();
    expect(within(internal).queryByText("Acme App")).not.toBeInTheDocument();
    expect(within(internal).queryByText("Beta App")).not.toBeInTheDocument();

    const clients = section("Clients");
    expect(within(itemOf("Acme")).getByText("Acme App")).toBeInTheDocument();
    expect(within(itemOf("Acme")).queryByText("Beta App")).not.toBeInTheDocument();
    expect(within(itemOf("Beta")).getByText("Beta App")).toBeInTheDocument();
    expect(within(itemOf("Beta")).queryByText("Acme App")).not.toBeInTheDocument();
    expect(within(clients).queryByText("Internal A")).not.toBeInTheDocument();
  });

  it("shows a client with no projects, in client position order", async () => {
    renderSidebar();
    await screen.findByText("Empty Co");
    const headings = within(section("Clients"))
      .getAllByRole("button", { expanded: true })
      .map((b) => b.textContent);
    expect(headings).toEqual(["Acme", "Beta", "Empty Co"]);
    expect(within(itemOf("Empty Co")).getByText("No projects")).toBeInTheDocument();
  });

  it("collapsing a client hides its projects and leaves the others", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await screen.findByText("Acme App");

    await user.click(handleOf("Acme"));
    expect(screen.queryByText("Acme App")).not.toBeInTheDocument();
    expect(handleOf("Acme")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Beta App")).toBeInTheDocument();

    await user.click(handleOf("Acme"));
    expect(screen.getByText("Acme App")).toBeInTheDocument();
  });
});

describe("Sidebar drag-to-reorder (FB-206)", () => {
  it("dragging a project within its group sends only that group's ids", async () => {
    renderSidebar();
    await screen.findByText("Acme App");
    stubRects();

    dragDown("Internal A", 40);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("reorder_projects", { orderedIds: [2, 1] });
    });
    expect(mockInvoke).not.toHaveBeenCalledWith("reorder_clients", expect.anything());
  });

  it("keeps the other groups' projects while a project reorder is in flight", async () => {
    renderSidebar();
    await screen.findByText("Acme App");
    // Hold reorder_projects pending so the optimistic cache is what renders.
    const answer = mockInvoke.getMockImplementation()!;
    mockInvoke.mockImplementation(async (cmd: string, args?: unknown) =>
      cmd === "reorder_projects" ? new Promise(() => {}) : answer(cmd, args as never),
    );
    stubRects();

    dragDown("Internal A", 40);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("reorder_projects", { orderedIds: [2, 1] });
    });
    await waitFor(() => {
      expect(screen.getByText("Acme App")).toBeInTheDocument();
      expect(screen.getByText("Beta App")).toBeInTheDocument();
    });
    const internalNames = within(section("Internal"))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(internalNames).toEqual(["Internal B", "Internal A"]);
  });

  it("dragging a client sends the new client order", async () => {
    renderSidebar();
    await screen.findByText("Acme App");
    stubRects();

    dragDown("Acme", 100);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("reorder_clients", { orderedIds: [20, 10, 30] });
    });
    expect(mockInvoke).not.toHaveBeenCalledWith("reorder_projects", expect.anything());
  });

  it("dropping a project on another group calls neither reorder command", async () => {
    renderSidebar();
    await screen.findByText("Acme App");
    stubRects();

    // Internal A (y 0..36) lands exactly on Acme App (y 140..176).
    dragDown("Internal A", 140);

    // Give dnd-kit's deferred drop time to run before asserting nothing fired.
    await new Promise((r) => setTimeout(r, 50));
    await waitFor(() => expect(reorderCalls()).toEqual([]));
  });
});

describe("Sidebar client management (FB-207)", () => {
  it("creates a client from the Clients header +, with submit disabled while the name is blank", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await screen.findByText("Acme App");

    await user.click(within(section("Clients")).getByRole("button", { name: "Create client" }));
    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Create client" });
    expect(submit).toBeDisabled();

    const input = within(dialog).getByLabelText("Client name");
    await user.type(input, "   ");
    expect(submit).toBeDisabled();

    await user.clear(input);
    await user.type(input, "Gamma");
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("create_client", { name: "Gamma" });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("renames a client with its id and the new name", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await screen.findByText("Acme App");

    await user.click(screen.getByRole("button", { name: "Rename Beta" }));
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Client name");
    expect(input).toHaveValue("Beta");

    await user.clear(input);
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(input, "Beta Corp");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("rename_client", { id: 20, name: "Beta Corp" });
    });
  });

  it("pressing the rename button does not start a client drag", async () => {
    renderSidebar();
    await screen.findByText("Acme App");
    stubRects();

    const rename = screen.getByRole("button", { name: "Rename Acme" });
    fireEvent.pointerDown(rename, { clientX: 50, clientY: 10, pointerId: 1, button: 0, isPrimary: true });
    fireEvent.pointerMove(rename, { clientX: 50, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(rename, { clientX: 50, clientY: 110, pointerId: 1 });
    fireEvent.pointerUp(rename, { clientX: 50, clientY: 110, pointerId: 1 });

    await new Promise((r) => setTimeout(r, 50));
    await waitFor(() => expect(reorderCalls()).toEqual([]));
  });
});
