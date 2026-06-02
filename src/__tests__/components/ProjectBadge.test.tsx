import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectBadge } from "@/components/ProjectBadge";

describe("ProjectBadge", () => {
  it("renders the logo image when logo_data is set", () => {
    render(
      <ProjectBadge
        project={{ name: "Alpha", color: "#6366f1", logo_data: "data:image/png;base64,AAAA" }}
      />
    );
    const img = screen.getByRole("img", { name: "Alpha" });
    expect(img).toHaveAttribute("src", "data:image/png;base64,AAAA");
  });

  it("renders a colored square when logo_data is null", () => {
    const { container } = render(
      <ProjectBadge project={{ name: "Alpha", color: "#10b981", logo_data: null }} />
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const span = container.querySelector("span");
    expect(span).toHaveStyle({ backgroundColor: "#10b981" });
  });
});
