import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { AppShell } from "@/components/AppShell";

// AppShell reads VITE_APP_ENV at render, so each case stubs the env before
// rendering; no module reset (re-importing the whole shell tree per case was
// what pushed these tests past the timeout under load).
async function renderShell(staging: boolean) {
  if (staging) vi.stubEnv("VITE_APP_ENV", "staging");
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue([]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<div>page content</div>} />
          </Route>
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByText("page content")).toBeInTheDocument());
  return utils;
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AppShell staging strip", () => {
  it("shows the slot and the badge with both copy lines in staging", async () => {
    await renderShell(true);
    expect(screen.getByTestId("warning-slot")).toBeInTheDocument();
    expect(screen.getByTestId("staging-badge")).toBeInTheDocument();
    expect(screen.getByText("STAGING ENVIRONMENT")).toBeInTheDocument();
    expect(screen.getByText("Test data only. Nothing here is real.")).toBeInTheDocument();
  });

  it("renders neither the slot nor the badge outside staging", async () => {
    await renderShell(false);
    expect(screen.queryByTestId("warning-slot")).not.toBeInTheDocument();
    expect(screen.queryByTestId("staging-badge")).not.toBeInTheDocument();
  });

  it("places the badge before the sidebar row and keeps the scroll classes", async () => {
    const { container } = await renderShell(true);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass("flex", "h-screen", "flex-col");

    const badge = screen.getByTestId("staging-badge");
    const row = root.children[1] as HTMLElement;
    expect(row).toHaveClass("flex", "flex-1", "min-h-0");
    expect(row.querySelector("aside, nav")).not.toBeNull();
    expect(
      badge.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(root.children[0]).toContainElement(badge);
    expect(row).not.toContainElement(badge);

    expect(screen.getByRole("main")).toHaveClass("overflow-auto");
  });

  it("no longer renders the old sidebar STAGING chip", async () => {
    await renderShell(true);
    expect(screen.queryAllByText(/^STAGING$/)).toHaveLength(0);
  });
});
