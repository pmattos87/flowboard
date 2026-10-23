import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarkdownView } from "@/components/MarkdownView";

const SOURCE = [
  "# Title",
  "",
  "## Section",
  "",
  "- first item",
  "- second item",
  "",
  "```",
  "const x = 1;",
  "```",
  "",
  "See [the docs](https://example.com).",
].join("\n");

describe("MarkdownView", () => {
  it("renders headings, list items, fenced code and a link as plain text", () => {
    const { container } = render(<MarkdownView value={SOURCE} />);
    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Section" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector("pre")).toHaveTextContent("const x = 1;");
    expect(screen.getByText("the docs")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("is not interactive: no button role, no tab stop, no textarea on click", () => {
    const { container } = render(<MarkdownView value={SOURCE} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("[tabindex]")).toBeNull();
    fireEvent.click(screen.getByText("first item"));
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
