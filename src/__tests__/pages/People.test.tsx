import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import People from "@/pages/People";
import { useUiStore } from "@/stores/uiStore";

const mockInvoke = vi.mocked(invoke);

const fakePeople = [
  { id: 1, name: "Alice", email: "alice@example.com", avatar_color: "#6366f1", role: "Developer" },
  { id: 2, name: "Bob", email: "bob@example.com", avatar_color: "#3b82f6", role: "Designer" },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <People />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({ activeProjectId: null, selectedTaskId: null, selectedSprintId: null });
});

describe("People — loading", () => {
  it("renders without crashing while loading", () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/people/i)).toBeInTheDocument();
  });
});

describe("People — with data", () => {
  beforeEach(() => {
    mockInvoke.mockResolvedValue(fakePeople);
  });

  it("shows people page heading", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/people/i)).toBeInTheDocument());
  });

  it("lists all team members by name", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows role for each member", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Developer")).toBeInTheDocument());
    expect(screen.getByText("Designer")).toBeInTheDocument();
  });

  it("shows avatar initials", async () => {
    renderPage();
    await waitFor(() => {
      const avatars = screen.getAllByText("A");
      expect(avatars.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders an Add Person button", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /add person/i })).toBeInTheDocument()
    );
  });
});

describe("People — empty state", () => {
  it("shows empty state when no people exist", async () => {
    mockInvoke.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/no team members/i)).toBeInTheDocument());
  });
});
