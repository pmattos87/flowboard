import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StagingBadge } from "@/components/StagingBadge";

describe("StagingBadge", () => {
  it("renders an accessible status strip with the staging copy", () => {
    render(<StagingBadge />);
    const badge = screen.getByTestId("staging-badge");
    expect(badge).toHaveAttribute("role", "status");
    expect(badge).toHaveClass("h-10", "shrink-0", "bg-amber-400", "text-gray-950");
    expect(screen.getByText("STAGING ENVIRONMENT")).toBeInTheDocument();
    expect(screen.getByText("Test data only. Nothing here is real.")).toBeInTheDocument();
  });

  it("cannot be dismissed and does not animate", () => {
    render(<StagingBadge />);
    const badge = screen.getByTestId("staging-badge");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(badge.outerHTML).not.toMatch(/animate-|transition/);
  });
});

describe("StagingBadge layout (QA)", () => {
  it("matches the design: centred row, icon, label and detail styling", () => {
    render(<StagingBadge />);
    const badge = screen.getByTestId("staging-badge");
    expect(badge).toHaveClass("flex", "items-center", "justify-center", "gap-3", "px-3");
    const icon = badge.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("stroke-width", "2.5");
    expect(icon).toHaveClass("h-5", "w-5");
    expect(screen.getByText("STAGING ENVIRONMENT")).toHaveClass(
      "text-sm",
      "font-bold",
      "uppercase",
      "tracking-[0.18em]"
    );
    expect(screen.getByText("Test data only. Nothing here is real.")).toHaveClass(
      "text-sm",
      "font-medium",
      "opacity-80"
    );
  });
});
