/**
 * SF-134: logos live on clients and the company. Client rows show their client's
 * logo, the Internal header shows the company's name and logo, client project
 * rows show no badge, and the edit dialog uploads and removes a logo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "@/components/Sidebar";
import { useUiStore } from "@/stores/uiStore";
import type { Client, Company, Project } from "@/types";

vi.mock("@/lib/image", () => ({
  fileToOrgLogoDataUrl: vi.fn(async () => "data:image/png;base64,NEW"),
  fileToLogoDataUrl: vi.fn(async () => "data:image/png;base64,PROJECT"),
  fileToAvatarDataUrl: vi.fn(async () => "data:image/jpeg;base64,AVATAR"),
}));

const mockInvoke = vi.mocked(invoke);

function project(id: number, name: string, client_id: number | null, logo_data: string | null, state: Project["state"] = "active"): Project {
  return {
    id, name, key: `P${id}`, description: "", color: "#6366f1", created_at: "",
    logo_data, position: id, ladder: "legacy", client_id,
    kind: client_id == null ? "internal" : "client",
    state,
  };
}

const PROJECTS: Project[] = [
  project(1, "Internal A", null, "data:internal-a"),
  // A client project with a stale logo: the row still shows none.
  project(3, "Acme App", 10, "data:stale"),
  project(4, "Acme Old", 10, null, "archived"),
  project(5, "Beta App", 20, null),
];

const CLIENTS: Client[] = [
  { id: 10, name: "Acme", logo_data: "data:acme", position: 0 },
  { id: 20, name: "Beta", logo_data: null, position: 1 },
];

function renderSidebar(company: Company = { name: "Mattos Dev", logo_data: "data:company" }) {
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "list_projects") return PROJECTS;
    if (cmd === "list_clients") return CLIENTS;
    if (cmd === "get_company") return company;
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

const rowOf = (text: string) => screen.getByText(text).closest("button") as HTMLElement;
const updateCalls = (cmd: string) => mockInvoke.mock.calls.filter(([c]) => c === cmd);

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({ activeProjectId: null, collapsedClientIds: {} });
});

describe("Sidebar logos (SF-134)", () => {
  it("shows a client's logo before its name, and nothing for a client without one", async () => {
    renderSidebar();
    await screen.findByText("Acme App");
    expect(within(rowOf("Acme")).getByAltText("Acme logo")).toHaveAttribute("src", "data:acme");
    expect(within(rowOf("Beta")).queryByRole("img")).not.toBeInTheDocument();
  });

  it("heads the Internal section with the company's logo and name", async () => {
    renderSidebar();
    const internal = screen.getByRole("region", { name: "Internal" });
    expect(await within(internal).findByText("Mattos Dev")).toBeInTheDocument();
    expect(within(internal).getByAltText("Mattos Dev logo")).toHaveAttribute("src", "data:company");
    expect(within(internal).queryByText("Internal")).not.toBeInTheDocument();
  });

  it("renders client and company logos at the internal project badge's size (FB-314)", async () => {
    renderSidebar();
    await screen.findByText("Acme App");
    const internal = screen.getByRole("region", { name: "Internal" });
    const logos = [
      within(rowOf("Acme")).getByAltText("Acme logo"),
      await within(internal).findByAltText("Mattos Dev logo"),
    ];
    for (const logo of logos) {
      expect(logo).toHaveClass("h-5", "w-5");
      expect(logo).not.toHaveClass("h-4", "w-4");
    }
    expect(within(rowOf("Internal A")).getByAltText("Internal A")).toHaveClass("h-5", "w-5");
  });

  it("keeps the badge on internal project rows and drops it on client project rows, active and archived", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await screen.findByText("Acme App");
    expect(within(rowOf("Internal A")).getByAltText("Internal A")).toBeInTheDocument();
    expect(rowOf("Acme App").querySelector("img, span[style]")).toBeNull();
    expect(rowOf("Beta App").querySelector("img, span[style]")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Archived (1)" }));
    expect(rowOf("Acme Old").querySelector("img, span[style]")).toBeNull();
  });

  it("uploads a client logo from the edit dialog and sends only the logo that changed", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await screen.findByText("Acme App");
    await user.click(screen.getByRole("button", { name: "Edit Beta" }));
    const dialog = await screen.findByRole("dialog");
    await user.upload(within(dialog).getByLabelText("Logo file"), new File(["x"], "beta.png", { type: "image/png" }));
    expect(await within(dialog).findByAltText("Beta logo")).toHaveAttribute("src", "data:image/png;base64,NEW");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_client", {
        id: 20,
        payload: { name: "Beta", logo_data: "data:image/png;base64,NEW" },
      }),
    );
  });

  it("removes a client logo from the edit dialog", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await screen.findByText("Acme App");
    await user.click(screen.getByRole("button", { name: "Edit Acme" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByAltText("Acme logo")).toBeInTheDocument();
    // FB-314: the dialog's preview keeps its own size; only the sidebar logos grew.
    expect(within(dialog).getByAltText("Acme logo")).toHaveClass("h-12", "w-12");
    expect(within(dialog).getByAltText("Acme logo")).not.toHaveClass("h-5", "w-5");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(within(dialog).queryByAltText("Acme logo")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_client", { id: 10, payload: { name: "Acme", logo_data: null } }),
    );
  });

  it("edits the company's name and logo from the Internal header's pencil", async () => {
    const user = userEvent.setup();
    renderSidebar({ name: "Internal", logo_data: null });
    const internal = screen.getByRole("region", { name: "Internal" });
    await user.click(await within(internal).findByRole("button", { name: "Edit Internal" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Edit company");
    const input = within(dialog).getByLabelText("Company name");
    expect(input).toHaveValue("Internal");

    await user.clear(input);
    await user.type(input, "Mattos Dev");
    await user.upload(within(dialog).getByLabelText("Logo file"), new File(["x"], "co.png", { type: "image/png" }));
    await within(dialog).findByAltText("Mattos Dev logo");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_company", {
        payload: { name: "Mattos Dev", logo_data: "data:image/png;base64,NEW" },
      }),
    );
    expect(updateCalls("update_client")).toHaveLength(0);
  });

  it("creating a client sends only its name", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await screen.findByText("Acme App");
    await user.click(screen.getByRole("button", { name: "Create client" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText("Logo file")).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Client name"), "Gamma");
    await user.click(within(dialog).getByRole("button", { name: "Create client" }));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("create_client", { name: "Gamma" }));
  });
});
