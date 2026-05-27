import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { SprintFormDialog } from "@/features/sprints/SprintFormDialog";

const mockInvoke = vi.mocked(invoke);

function renderDialog(projectId: number | null = 1) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SprintFormDialog
        open={true}
        onOpenChange={vi.fn()}
        projectId={projectId}
        editing={null}
      />
    </QueryClientProvider>
  );
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
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/name/i), "Sprint 1");
    await user.type(screen.getByLabelText(/start date/i), "2025-06-10");
    await user.type(screen.getByLabelText(/end date/i), "2025-06-05");

    await waitFor(() => {
      expect(
        screen.getByText(/end date must be on or after start date/i)
      ).toBeInTheDocument();
    });
  });

  it("disables submit button when end date is before start date", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/name/i), "Sprint 1");
    await user.type(screen.getByLabelText(/start date/i), "2025-06-10");
    await user.type(screen.getByLabelText(/end date/i), "2025-06-05");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create sprint/i })).toBeDisabled();
    });
  });

  it("clears the error when end date is corrected to equal start date", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/name/i), "Sprint 1");
    await user.type(screen.getByLabelText(/start date/i), "2025-06-10");
    await user.type(screen.getByLabelText(/end date/i), "2025-06-05");

    await waitFor(() =>
      expect(screen.getByText(/end date must be on or after/i)).toBeInTheDocument()
    );

    // Clear and re-type valid end date (same day = allowed)
    const endInput = screen.getByLabelText(/end date/i);
    await user.clear(endInput);
    await user.type(endInput, "2025-06-10");

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

    await user.type(screen.getByLabelText(/name/i), "Sprint 1");
    await user.type(screen.getByLabelText(/start date/i), "2025-06-10");
    await user.type(screen.getByLabelText(/end date/i), "2025-06-20");

    const submitBtn = screen.getByRole("button", { name: /create sprint/i });
    await waitFor(() => expect(submitBtn).toBeEnabled());
    await user.click(submitBtn);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("create_sprint", expect.anything())
    );
  });
});
