import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar, initials } from "@/components/Avatar";

describe("initials", () => {
  it("returns one letter for a single-word name", () => {
    expect(initials("Alice")).toBe("A");
  });
  it("returns two letters for a multi-word name", () => {
    expect(initials("Alice Bob Carol")).toBe("AB");
  });
});

describe("Avatar", () => {
  const base = { name: "Alice Bob", avatar_color: "#ef4444" };

  it("renders the photo when avatar_data is set", () => {
    const src = "data:image/jpeg;base64,AAAA";
    render(<Avatar person={{ ...base, avatar_data: src }} />);
    const img = screen.getByRole("img", { name: "Alice Bob" }) as HTMLImageElement;
    expect(img.src).toBe(src);
  });

  it("renders colored initials when avatar_data is null", () => {
    render(<Avatar person={{ ...base, avatar_data: null }} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const el = screen.getByTitle("Alice Bob");
    expect(el).toHaveTextContent("AB");
    expect(el).toHaveStyle({ backgroundColor: "#ef4444" });
  });
});
