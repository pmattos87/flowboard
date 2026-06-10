import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useIsFetching,
} from "@tanstack/react-query";
import { RefreshButton } from "@/components/RefreshButton";

// Keep React Query real except for useIsFetching, which we drive to exercise
// the spinner state without standing up a live fetching query.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useIsFetching: vi.fn(() => 0) };
});

function renderButton(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <RefreshButton />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(useIsFetching).mockReturnValue(0);
});

describe("RefreshButton", () => {
  it("invalidates all queries on click", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    renderButton(qc);

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    expect(spy).toHaveBeenCalledTimes(1);
    // Called with no key → invalidates every cache.
    expect(spy.mock.calls[0][0]).toBeUndefined();
  });

  it("spins the icon while queries are fetching", () => {
    vi.mocked(useIsFetching).mockReturnValue(1);
    renderButton(new QueryClient());

    const icon = screen
      .getByRole("button", { name: /refresh/i })
      .querySelector("svg");
    expect(icon).toHaveClass("animate-spin");
  });

  it("does not spin when idle", () => {
    renderButton(new QueryClient());

    const icon = screen
      .getByRole("button", { name: /refresh/i })
      .querySelector("svg");
    expect(icon).not.toHaveClass("animate-spin");
  });

  it("spins for one rotation on click even when no query is fetching", () => {
    vi.useFakeTimers();
    try {
      renderButton(new QueryClient());

      const button = screen.getByRole("button", { name: /refresh/i });
      const icon = button.querySelector("svg");

      expect(icon).not.toHaveClass("animate-spin");

      fireEvent.click(button);
      expect(icon).toHaveClass("animate-spin");

      // Still spinning partway through the rotation.
      act(() => vi.advanceTimersByTime(500));
      expect(icon).toHaveClass("animate-spin");

      // Stops once the full 1s rotation completes.
      act(() => vi.advanceTimersByTime(500));
      expect(icon).not.toHaveClass("animate-spin");
    } finally {
      vi.useRealTimers();
    }
  });
});
