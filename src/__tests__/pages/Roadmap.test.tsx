import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import RoadmapPage from "@/features/roadmap/RoadmapPage";
import { useUiStore } from "@/stores/uiStore";

const mockInvoke = vi.mocked(invoke);

const fakeSprints = [
  {
    id: 1, project_id: 1, name: "Sprint Alpha", goal: "Ship MVP",
    start_date: "2026-05-04", end_date: "2026-05-17", status: "completed",
  },
  {
    id: 2, project_id: 1, name: "Sprint Beta", goal: "Polish",
    start_date: "2026-05-18", end_date: "2026-05-31", status: "active",
  },
  {
    id: 3, project_id: 1, name: "Sprint Gamma", goal: "",
    start_date: "2026-06-01", end_date: "2026-06-14", status: "backlog",
  },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RoadmapPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({
    activeProjectId: null,
    selectedTaskId: null,
    selectedSprintId: null,
    createProjectModalOpen: false,
    createTaskModalOpen: false,
  });
});

describe("Roadmap — no project selected", () => {
  it("shows select project prompt", () => {
    renderPage();
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });
});

describe("Roadmap — with project, no sprints", () => {
  it("shows empty state", async () => {
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke.mockResolvedValue([]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/no sprints to display/i)).toBeInTheDocument()
    );
    expect(
      screen.getByRole("button", { name: /create the first sprint/i }),
    ).toBeInTheDocument();
  });
});

describe("Roadmap — with sprints", () => {
  beforeEach(() => {
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke.mockResolvedValue(fakeSprints);
  });

  it("renders one move handle per sprint", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /move sprint alpha/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /move sprint beta/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move sprint gamma/i })).toBeInTheDocument();
  });

  it("renders the today indicator", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("roadmap-today")).toBeInTheDocument());
  });

  it("renders the scale toggle with three options", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^week$/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /^month$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^quarter$/i })).toBeInTheDocument();
  });

  it("redirects vertical wheel to horizontal scroll (FB-25)", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /move sprint alpha/i })).toBeInTheDocument(),
    );
    const scroller = document.querySelector(".overflow-auto") as HTMLDivElement;
    expect(scroller).toBeTruthy();
    expect(scroller.scrollLeft).toBe(0);
    fireEvent.wheel(scroller, { deltaY: 120 });
    expect(scroller.scrollLeft).toBe(120);
  });

  it("opens the edit dialog when a bar is clicked", async () => {
    renderPage();
    const moveHandle = await screen.findByRole("button", { name: /move sprint alpha/i });
    fireEvent.click(moveHandle);
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /edit sprint/i })).toBeInTheDocument(),
    );
  });
});
