import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { SprintFormDialog } from "@/features/sprints/SprintFormDialog";
import type { Sprint } from "@/types";

const mockInvoke = vi.mocked(invoke);

function renderDialog(projectId: number | null = 1, editing: Sprint | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SprintFormDialog
        open={true}
        onOpenChange={vi.fn()}
        projectId={projectId}
        editing={editing}
      />
    </QueryClientProvider>
  );
}

// Sets a field's value in one change event. `user.type` sends one keystroke per
// character (~45 per test), each re-rendering the dialog; under CPU contention
// that blew the 5s test timeout (FB-252).
function setField(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("SprintFormDialog — date validation", () => {
  it("shows no error when dates are not yet filled", () => {
    renderDialog();
    expect(screen.queryByText(/end date must be on or after/i)).not.toBeInTheDocument();
  });

  it("shows error when end date is before start date", async () => {
    renderDialog();

    setField(/name/i, "Sprint 1");
    setField(/start date/i, "2025-06-10");
    setField(/end date/i, "2025-06-05");

    await waitFor(() => {
      expect(
        screen.getByText(/end date must be on or after start date/i)
      ).toBeInTheDocument();
    });
  });

  it("disables submit button when end date is before start date", async () => {
    renderDialog();

    setField(/name/i, "Sprint 1");
    setField(/start date/i, "2025-06-10");
    setField(/end date/i, "2025-06-05");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create sprint/i })).toBeDisabled();
    });
  });

  it("clears the error when end date is corrected to equal start date", async () => {
    renderDialog();

    setField(/name/i, "Sprint 1");
    setField(/start date/i, "2025-06-10");
    setField(/end date/i, "2025-06-05");

    await waitFor(() =>
      expect(screen.getByText(/end date must be on or after/i)).toBeInTheDocument()
    );

    // Clear and re-type valid end date (same day = allowed)
    const endInput = screen.getByLabelText(/end date/i);
    fireEvent.change(endInput, { target: { value: "2025-06-10" } });

    await waitFor(() =>
      expect(screen.queryByText(/end date must be on or after/i)).not.toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /create sprint/i })).toBeEnabled();
  });

  it("allows submission when end date is after start date", async () => {
    const user = userEvent.setup();
    const fakeSprint = {
      id: 1, project_id: 1, name: "Sprint 1", goal: "",
      start_date: "2025-06-10", end_date: "2025-06-20", status: "backlog",
    };
    mockInvoke.mockResolvedValue(fakeSprint);
    renderDialog();

    setField(/name/i, "Sprint 1");
    setField(/start date/i, "2025-06-10");
    setField(/end date/i, "2025-06-20");

    const submitBtn = screen.getByRole("button", { name: /create sprint/i });
    await waitFor(() => expect(submitBtn).toBeEnabled());
    await user.click(submitBtn);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("create_sprint", {
        payload: expect.objectContaining({
          project_id: 1,
          name: "Sprint 1",
          start_date: "2025-06-10",
          end_date: "2025-06-20",
        }),
      })
    );
  });
});

const sprintWith = (status: Sprint["status"]): Sprint => ({
  id: 7, project_id: 1, name: "Sprint 7", goal: "Ship it",
  start_date: "2026-10-01", end_date: "2026-10-14", status,
});

describe("SprintFormDialog — status choices (FB-97)", () => {
  it("offers no Completed option when creating a sprint", () => {
    renderDialog();
    const select = screen.getByLabelText(/status/i);
    const values = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(values).toEqual(["backlog", "active"]);
    expect(screen.queryByRole("option", { name: /completed/i })).not.toBeInTheDocument();
  });

  it.each(["backlog", "active"] as const)(
    "offers no Completed option when editing a %s sprint",
    (status) => {
      renderDialog(1, sprintWith(status));
      const select = screen.getByLabelText(/status/i);
      expect(select).toHaveValue(status);
      expect(screen.queryByRole("option", { name: /completed/i })).not.toBeInTheDocument();
    }
  );

  it("shows Completed read-only on a completed sprint and keeps it on save", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(sprintWith("completed"));
    renderDialog(1, sprintWith("completed"));

    const status = screen.getByLabelText(/status/i);
    expect(status).toHaveValue("Completed");
    expect(status).toHaveAttribute("readonly");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    // Name, goal and dates stay editable.
    const name = screen.getByLabelText(/name/i);
    expect(name).not.toHaveAttribute("readonly");
    await user.clear(name);
    await user.type(name, "Sprint 7b");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_sprint", {
        id: 7,
        payload: {
          name: "Sprint 7b",
          goal: "Ship it",
          start_date: "2026-10-01",
          end_date: "2026-10-14",
          status: "completed",
        },
      })
    );
  });
});

describe("SprintFormDialog — completed sprint saved unchanged (FB-97)", () => {
  it("sends status completed and nothing else when saving with no edits", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(sprintWith("completed"));
    renderDialog(1, sprintWith("completed"));

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("update_sprint", expect.anything()));
    const calls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "update_sprint");
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({
      id: 7,
      payload: {
        name: "Sprint 7",
        goal: "Ship it",
        start_date: "2026-10-01",
        end_date: "2026-10-14",
        status: "completed",
      },
    });
  });
});
