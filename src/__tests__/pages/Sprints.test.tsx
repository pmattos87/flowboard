import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import Sprints from "@/pages/Sprints";
import { useUiStore } from "@/stores/uiStore";

const mockInvoke = vi.mocked(invoke);

const fakeSprints = [
  {
    id: 1, project_id: 1, name: "Sprint Alpha", goal: "Ship MVP",
    start_date: "2024-01-01", end_date: "2024-01-14", status: "completed",
  },
  {
    id: 2, project_id: 1, name: "Sprint Beta", goal: "Polish",
    start_date: "2024-01-15", end_date: "2024-01-28", status: "active",
  },
  {
    id: 3, project_id: 1, name: "Sprint Gamma", goal: "",
    start_date: "2024-02-01", end_date: "2024-02-14", status: "backlog",
  },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Sprints />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({ activeProjectId: null, selectedTaskId: null, selectedSprintId: null });
});

describe("Sprints — no project selected", () => {
  it("shows select project prompt", () => {
    renderPage();
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });
});

describe("Sprints — with project, no sprints", () => {
  it("shows empty state when no sprints exist", async () => {
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/no sprints yet/i)).toBeInTheDocument());
  });
});

describe("Sprints — with project and sprints", () => {
  beforeEach(() => {
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke.mockResolvedValue(fakeSprints);
  });

  it("lists sprint names", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Sprint Alpha")).toBeInTheDocument());
    expect(screen.getByText("Sprint Beta")).toBeInTheDocument();
    expect(screen.getByText("Sprint Gamma")).toBeInTheDocument();
  });

  it("shows status badges", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Completed")).toBeInTheDocument());
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Backlog")).toBeInTheDocument();
  });

  it("renders a Create Sprint button", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /create sprint/i })).toBeInTheDocument()
    );
  });
});
