import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import People from "@/pages/People";
import { useUiStore } from "@/stores/uiStore";

const AVATAR_COLORS = [
  "#6366f1", "#3b82f6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6",
];

const mockInvoke = vi.mocked(invoke);

const fakePeople = [
  { id: 1, name: "Alice", email: "alice@example.com", avatar_color: "#6366f1", role: "Developer", avatar_data: null },
  { id: 2, name: "Bob", email: "bob@example.com", avatar_color: "#3b82f6", role: "Designer", avatar_data: null },
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

describe("People — add person modal", () => {
  it("shows a Photo control and no avatar color picker", async () => {
    mockInvoke.mockResolvedValue(fakePeople);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /add person/i }));

    expect(screen.getByText("Photo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload photo/i })).toBeInTheDocument();
    expect(screen.queryByText(/avatar color/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /choose color/i })).not.toBeInTheDocument();
  });

  it("creates a person with a random avatar color and no photo", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_people") return Promise.resolve(fakePeople);
      return Promise.resolve({});
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /add person/i }));

    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText(/name/i), "Carol");
    await user.type(dialog.getByLabelText(/email/i), "carol@example.com");
    await user.click(dialog.getByRole("button", { name: /^add person$/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_person",
        expect.objectContaining({
          payload: expect.objectContaining({
            name: "Carol",
            email: "carol@example.com",
            avatar_data: null,
          }),
        }),
      );
    });
    const call = mockInvoke.mock.calls.find((c) => c[0] === "create_person");
    expect(AVATAR_COLORS).toContain((call?.[1] as any).payload.avatar_color);
  });
});

describe("People — empty state", () => {
  it("shows empty state when no people exist", async () => {
    mockInvoke.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/no team members/i)).toBeInTheDocument());
  });
});
