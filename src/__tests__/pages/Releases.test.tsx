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
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd in overrides) return Promise.resolve(overrides[cmd]);
    switch (cmd) {
      case "get_project": return Promise.resolve(project("factory"));
      case "list_tasks": return Promise.resolve(tasks);
      case "list_releases": return Promise.resolve({ project: "FB", releases });
      case "get_release": return Promise.resolve({
        project: "FB", version: "1.6.0", state: "planned",
        stories: [{ key: "FB-90", title: "Already picked", status: "tested" }],
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

  it("lists Releases by state with an open Release's picks and the tested candidates", async () => {
    mockFactory();
    renderPage();
    expect(await screen.findByText("Planned")).toBeInTheDocument();
    expect(screen.getByText("Released")).toBeInTheDocument();
    expect(screen.getByText(/released 2026-08-05/)).toBeInTheDocument();
    expect(await screen.findByText("Already picked")).toBeInTheDocument();
    // Tested and unpicked only: not the picked one again, not the building one.
    expect(screen.getByText("Markdown descriptions")).toBeInTheDocument();
    expect(screen.getByText("Sprint gate fix")).toBeInTheDocument();
    expect(screen.queryByText("Still building")).not.toBeInTheDocument();
  });

  it("picks and removes a Story through the Release commands", async () => {
    const user = userEvent.setup();
    mockFactory();
    renderPage();
    const row = (await screen.findByText("Markdown descriptions")).closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Pick" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("pick_release_story", { version: "1.6.0", storyKey: "FB-100" }),
    );

    const picked = (await screen.findByText("Already picked")).closest("li") as HTMLElement;
    await user.click(within(picked).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("remove_release_story", { storyKey: "FB-90" }),
    );
  });

  it("shows a picked Story's status as a pill between its key and title", async () => {
    const user = userEvent.setup();
    mockFactory();
    renderPage();
    const picked = (await screen.findByText("Already picked")).closest("li") as HTMLElement;
    const key = within(picked).getByText("FB-90");
    const pill = within(picked).getByText("tested");
    const title = within(picked).getByText("Already picked");
    expect(pill.className).toContain("rounded-full");
    expect(key.compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pill.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(within(picked).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("remove_release_story", { storyKey: "FB-90" }),
    );
  });

  it("shows the depends-on warnings a pick returns", async () => {
    const user = userEvent.setup();
    mockFactory({
      pick_release_story: { story: "FB-100", version: "1.6.0", warnings: ["FB-99 (building) is a dependency outside this Release"] },
    });
    renderPage();
    const row = (await screen.findByText("Markdown descriptions")).closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Pick" }));
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
