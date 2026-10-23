import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WarningSlot } from "@/components/WarningSlot";

describe("WarningSlot", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["false", false],
  ])("renders nothing when children is %s", (_label, child) => {
    const { container } = render(<WarningSlot>{child}</WarningSlot>);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("warning-slot")).not.toBeInTheDocument();
  });

  it("renders a full-width wrapper around its child", () => {
    render(
      <WarningSlot>
        <p>careful</p>
      </WarningSlot>
    );
    const slot = screen.getByTestId("warning-slot");
    expect(slot).toHaveClass("w-full", "shrink-0");
    expect(slot).toContainElement(screen.getByText("careful"));
  });
});
