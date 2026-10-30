import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import ReleasesPage from "@/features/releases/ReleasesPage";
import { useUiStore } from "@/stores/uiStore";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockInvoke = vi.mocked(invoke);

const project = (ladder: "legacy" | "factory") => ({
  id: 1, name: "Flowboard", key: "FB", description: "", color: "#6366f1",
  created_at: "2024-01-01T00:00:00.000Z", logo_data: null, position: 0, ladder, kind: "internal",
});

const story = (n: number, title: string, status: string, branch: string | null, releaseId: number | null) => ({
  id: n, project_id: 1, task_number: n, sprint_id: 1, parent_id: null, title, description: "",
  type: "story", status, priority: "medium", assignee_id: null, story_points: 0, due_date: null,
  created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  feature_branch: branch, review_verdict: null, reviewed_commit: null, findings_url: null,
  run_stopped: false, risk: false, release_id: releaseId,
});

const tasks = [
  story(100, "Markdown descriptions", "tested", "feat/FB-100-markdown", null),
  story(98, "Sprint gate fix", "tested", "fix/FB-98-gate", null),
  story(90, "Already picked", "tested", "fix/FB-90-x", 7),
  story(80, "Still building", "building", "feat/FB-80-y", null),
];

const releases = [
  { version: "1.5.1", state: "released", created_at: "2026-08-01T00:00:00.000Z", released_at: "2026-08-05T10:00:00.000Z", stories: 3 },
  { version: "1.6.0", state: "planned", created_at: "2026-10-21T00:00:00.000Z", released_at: null, stories: 1 },
];

function mockFactory(overrides: Record<string, unknown> = {}) {
  mockInvoke.mockImplementation((cmd: string, args?: unknown) => {
    if (cmd in overrides) return Promise.resolve(overrides[cmd]);
    if (cmd === "get_release" && (args as { version?: string } | undefined)?.version === "1.5.1") {
      return Promise.resolve({
        project: "FB", version: "1.5.1", state: "released",
        stories: [{ key: "FB-70", title: "Shipped story", type: "story", status: "done" }],
      });
    }
    switch (cmd) {
      case "get_project": return Promise.resolve(project("factory"));
      case "list_tasks": return Promise.resolve(tasks);
      case "list_releases": return Promise.resolve({ project: "FB", releases });
      case "get_release": return Promise.resolve({
        project: "FB", version: "1.6.0", state: "planned",
        stories: [
          { key: "FB-90", title: "Already picked", type: "story", status: "tested" },
          { key: "FB-91", title: "Half way", type: "bug", status: "building" },
        ],
      });
      case "pick_release_story": return Promise.resolve({ story: "FB-100", version: "1.6.0", warnings: [] });
      default: return Promise.resolve(null);
    }
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReleasesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  vi.mocked(toast.warning).mockReset();
  useUiStore.setState({ activeProjectId: 1 });
});

describe("ReleasesPage", () => {
  it("asks for a project when none is selected", () => {
    useUiStore.setState({ activeProjectId: null });
    renderPage();
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });

  it("explains Releases on a legacy project and never asks for them", async () => {
    mockInvoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "get_project" ? project("legacy") : []),
    );
    renderPage();
    expect(await screen.findByText(/only on Factory projects/i)).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("list_releases", expect.anything());
  });

  it("lists Releases by state with count badges, the picks and the tested candidates", async () => {
    mockFactory();
    renderPage();
    const planned = (await screen.findByText("Planned")).closest("h2") as HTMLElement;
    expect(within(planned).getByText("1")).toBeInTheDocument();
    const released = screen.getByRole("heading", { name: /^Released/ });
    expect(within(released).getByText("1")).toBeInTheDocument();
    expect(await screen.findByText("Already picked")).toBeInTheDocument();
    // Tested and unpicked only: not the picked one again, not the building one.
    expect(screen.getByText("Markdown descriptions")).toBeInTheDocument();
    expect(screen.getByText("Sprint gate fix")).toBeInTheDocument();
    expect(screen.queryByText("Still building")).not.toBeInTheDocument();
  });

  it("sits in a centered max-width container", async () => {
    mockFactory();
    renderPage();
    await screen.findByText("Planned");
    const box = screen.getByTestId("releases-container");
    expect(box.className).toContain("max-w-6xl");
    expect(box.className).toContain("mx-auto");
    expect(within(box).getByRole("heading", { name: "Releases" })).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: /new release/i })).toBeInTheDocument();
  });

  it("summarises an open Release's readiness with only the statuses present", async () => {
    mockFactory();
    renderPage();
    await screen.findByText("Already picked");
    expect(screen.getByText("2 stories")).toBeInTheDocument();
    expect(screen.getByText("1 tested")).toBeInTheDocument();
    expect(screen.getByText("1 building")).toBeInTheDocument();
    expect(screen.queryByText(/\d+ done/)).not.toBeInTheDocument();
  });

  it("lays picks out as a Story/Status/Action table with title over key and coloured pills", async () => {
    mockFactory();
    renderPage();
    const tested = (await screen.findByText("Already picked")).closest("li") as HTMLElement;
    for (const h of ["Story", "Status", "Action"]) expect(screen.getByText(h)).toBeInTheDocument();

    const title = within(tested).getByText("Already picked");
    const key = within(tested).getByText("FB-90");
    expect(title.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const pill = within(tested).getByText("Tested");
    expect(pill.className).toContain("rounded-full");
    expect(pill.className).toContain("emerald");
    expect(pill.querySelector("span")).not.toBeNull(); // the dot

    const building = (await screen.findByText("Half way")).closest("li") as HTMLElement;
    const buildingPill = within(building).getByText("Building");
    expect(buildingPill.className).toContain("rounded-full");
    expect(buildingPill.className).toContain("amber");
  });

  it("picks a candidate and removes a pick by their accessible names", async () => {
    const user = userEvent.setup();
    mockFactory();
    renderPage();
    const row = (await screen.findByText("Markdown descriptions")).closest("li") as HTMLElement;
    expect(within(row).getByText("FB-100")).toBeInTheDocument();
    expect(within(row).getByText("Tested").className).toContain("rounded-full");
    await user.click(within(row).getByRole("button", { name: "Pick Markdown descriptions into 1.6.0" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("pick_release_story", { version: "1.6.0", storyKey: "FB-100" }),
    );

    await screen.findByText("Already picked");
    const remove = screen.getByRole("button", { name: "Remove Already picked from release" });
    expect(remove.className).toContain("border-gray-600");
    expect(remove.className).not.toContain("text-blue");
    await user.click(remove);
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("remove_release_story", { storyKey: "FB-90" }),
    );
  });

  it("keeps a released Release collapsed until its chevron is clicked", async () => {
    const user = userEvent.setup();
    mockFactory();
    renderPage();
    const toggle = await screen.findByRole("button", { name: /expand 1\.5\.1/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const row = toggle.parentElement as HTMLElement;
    expect(within(row).getByText("1.5.1")).toBeInTheDocument();
    expect(within(row).getByText("3 stories")).toBeInTheDocument();
    expect(within(row).getByText("Released")).toBeInTheDocument();
    expect(within(row).getByText("Aug 5, 2026")).toBeInTheDocument();
    expect(screen.queryByText("Shipped story")).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("get_release", expect.objectContaining({ version: "1.5.1" }));

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const shipped = (await screen.findByText("Shipped story")).closest("li") as HTMLElement;
    expect(within(shipped).getByText("Done").className).toContain("emerald");
    const card = shipped.closest("ul")!.parentElement as HTMLElement;
    expect(within(card).getByText("Story")).toBeInTheDocument();
    expect(within(card).queryByText("Action")).not.toBeInTheDocument();
    expect(within(shipped).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a canceled Release as a compact row with a gray Canceled pill and no date", async () => {
    mockFactory({
      list_releases: {
        project: "FB",
        releases: [{ version: "1.4.0", state: "canceled", created_at: "2026-07-01T00:00:00.000Z", released_at: null, stories: 1 }],
      },
    });
    renderPage();
    const toggle = await screen.findByRole("button", { name: /expand 1\.4\.0/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const heading = screen.getByRole("heading", { name: /^Canceled/ });
    expect(within(heading).getByText("1")).toBeInTheDocument();
    const row = toggle.parentElement as HTMLElement;
    expect(within(row).getByText("1 story")).toBeInTheDocument();
    const pill = within(row).getByText("Canceled");
    expect(pill.className).toContain("rounded-full");
    expect(pill.className).toContain("gray");
    expect(pill.className).not.toContain("emerald");
    expect(within(row).queryByText(/\d{4}/)).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("get_release", expect.anything());
  });

  it("keeps the empty-picks row when an open Release has no stories", async () => {
    mockFactory({ get_release: { project: "FB", version: "1.6.0", state: "planned", stories: [] } });
    renderPage();
    expect(await screen.findByText("No stories picked yet.")).toBeInTheDocument();
    expect(screen.getByText("0 stories")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it("shows the depends-on warnings a pick returns", async () => {
    const user = userEvent.setup();
    mockFactory({
      pick_release_story: { story: "FB-100", version: "1.6.0", warnings: ["FB-99 (building) is a dependency outside this Release"] },
    });
    renderPage();
    const row = (await screen.findByText("Markdown descriptions")).closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Pick Markdown descriptions into 1.6.0" }));
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith("Depends-on warning", {
        description: "FB-99 (building) is a dependency outside this Release",
      }),
    );
  });
});

describe("New release dialog", () => {
  it("suggests the version from the ticked branches and picks them on create", async () => {
    const user = userEvent.setup();
    mockFactory({ list_releases: { project: "FB", releases: [releases[0]] } });
    renderPage();
    await user.click(await screen.findByRole("button", { name: /new release/i }));

    const version = screen.getByLabelText("Version") as HTMLInputElement;
    expect(version.value).toBe("1.6.0"); // a feat branch is ticked: minor bump of 1.5.1
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox", { name: /Markdown descriptions/ }));
    expect(version.value).toBe("1.5.2"); // only the fix branch left: patch bump

    await user.click(screen.getByRole("button", { name: "Create release" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("pick_release_story", { version: "1.5.2", storyKey: "FB-98" }),
    );
    expect(mockInvoke).toHaveBeenCalledWith("create_release", { projectKey: "FB", version: "1.5.2" });
    expect(mockInvoke).not.toHaveBeenCalledWith("pick_release_story", { version: "1.5.2", storyKey: "FB-100" });
  });

  it("starts empty before the first release and keeps a typed version", async () => {
    const user = userEvent.setup();
    mockFactory({ list_releases: { project: "FB", releases: [] } });
    renderPage();
    await user.click(await screen.findByRole("button", { name: /new release/i }));

    const version = screen.getByLabelText("Version") as HTMLInputElement;
    expect(version.value).toBe("");
    expect(screen.getByRole("button", { name: "Create release" })).toBeDisabled();
    await user.type(version, "1.6.0");
    expect(screen.getByRole("button", { name: "Create release" })).toBeEnabled();
  });
});
