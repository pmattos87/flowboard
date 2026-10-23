import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownDescription } from "@/components/MarkdownDescription";

const BRIEF = [
  "# Owner",
  "",
  "## Spec",
  "",
  "- first item",
  "- second item",
  "",
  "1. step one",
  "",
  "Run `npx vitest run` first.",
  "",
  "```",
  "const x = 1;",
  "```",
].join("\n");

function Harness({ initial, onCommit = vi.fn() }: { initial: string; onCommit?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return <MarkdownDescription value={value} onChange={setValue} onCommit={() => onCommit(value)} />;
}

describe("MarkdownDescription — read mode", () => {
  it("renders headings, lists and code", () => {
    render(<Harness initial={BRIEF} />);
    expect(screen.getByRole("heading", { level: 1, name: "Owner" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Spec" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "first item",
      "second item",
      "step one",
    ]);
    expect(screen.getByText("npx vitest run").tagName).toBe("CODE");
    expect(screen.getByText("const x = 1;").closest("pre")).not.toBeNull();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders links as plain text and drops images", () => {
    render(<Harness initial={"See [docs](https://example.com) ![logo](https://example.com/a.png)"} />);
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders GFM tables", () => {
    render(<Harness initial={"| A | B |\n| --- | --- |\n| 1 | 2 |"} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("shows a placeholder when empty", () => {
    render(<Harness initial="" />);
    expect(screen.getByText("Add a description…")).toBeInTheDocument();
  });
});

describe("MarkdownDescription — editing", () => {
  it("click swaps in the textarea holding the raw text", async () => {
    const user = userEvent.setup();
    render(<Harness initial={BRIEF} />);
    await user.click(screen.getByRole("button", { name: /edit description/i }));
    expect(screen.getByRole("textbox")).toHaveValue(BRIEF);
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("Enter opens the editor from the keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness initial="text" />);
    screen.getByRole("button", { name: /edit description/i }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox")).toHaveValue("text");
  });

  it("blur commits the raw text unchanged and returns to read mode", async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial="" onCommit={onCommit} />);
    await user.click(screen.getByRole("button", { name: /edit description/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: BRIEF } });
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(BRIEF);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Owner" })).toBeInTheDocument();
  });
});
