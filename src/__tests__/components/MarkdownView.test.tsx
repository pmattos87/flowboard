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

  it("renders a GFM table with header and body cells", () => {
    render(<MarkdownView value={"| Name | Qty |\n| --- | --- |\n| apple | 3 |"} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Name", "Qty"]);
    expect(screen.getAllByRole("cell").map((c) => c.textContent)).toEqual(["apple", "3"]);
  });

  it("renders ~~x~~ as <del>", () => {
    const { container } = render(<MarkdownView value="~~gone~~" />);
    expect(container.querySelector("del")).toHaveTextContent("gone");
  });

  it("renders a bare URL as plain text, not a link", () => {
    render(<MarkdownView value="Visit https://example.com today" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/https:\/\/example\.com/)).toBeInTheDocument();
  });

  it("renders a GFM task list as disabled checkboxes", () => {
    render(<MarkdownView value={"- [x] done\n- [ ] todo"} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeChecked();
    expect(boxes[1]).not.toBeChecked();
    boxes.forEach((b) => expect(b).toBeDisabled());
  });
});
