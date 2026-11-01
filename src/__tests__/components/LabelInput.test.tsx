import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { LabelInput } from "@/components/LabelInput";

const mockInvoke = vi.mocked(invoke);

// list_tasks returns rows of two projects, so the test proves the input keeps
// to its own project's labels.
const TASKS = [
  { id: 1, project_id: 1, labels: "api,ui" },
  { id: 2, project_id: 1, labels: "apple,backend" },
  { id: 3, project_id: 2, labels: "apex,ui" },
];

const onChange = vi.fn();

function Harness({ initial }: { initial: string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <LabelInput
      projectId={1}
      aria-label="Labels"
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

function renderInput(initial: string[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  );
  return screen.getByRole("combobox", { name: "Labels" });
}

const optionNames = () => screen.queryAllByRole("option").map((o) => o.textContent);

beforeEach(() => {
  mockInvoke.mockReset();
  onChange.mockReset();
  mockInvoke.mockImplementation((cmd) =>
    Promise.resolve(cmd === "list_tasks" ? TASKS : null),
  );
});

describe("LabelInput suggestions", () => {
  it("lists only the matching labels of the same project for a typed prefix", async () => {
    const user = userEvent.setup();
    const input = renderInput();
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("list_tasks", { filters: { project_id: 1 } }),
    );
    await user.type(input, "ap");
    await waitFor(() => expect(optionNames()).toEqual(["api", "apple"]));
    // "apex" belongs to project 2 only
    expect(screen.queryByRole("option", { name: "apex" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "backend" })).not.toBeInTheDocument();
  });

  it("leaves labels already chosen out of the suggestions", async () => {
    const user = userEvent.setup();
    const input = renderInput(["api"]);
    await user.type(input, "ap");
    await waitFor(() => expect(optionNames()).toEqual(["apple"]));
  });
});

describe("LabelInput chips", () => {
  it("adds a chip when a suggestion is picked", async () => {
    const user = userEvent.setup();
    const input = renderInput(["ui"]);
    await user.type(input, "app");
    await user.click(await screen.findByRole("option", { name: "apple" }));
    expect(onChange).toHaveBeenLastCalledWith(["apple", "ui"]);
    expect(screen.getByRole("button", { name: "Remove label apple" })).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("picks a suggestion with the arrow keys and Enter", async () => {
    const user = userEvent.setup();
    const input = renderInput();
    await user.type(input, "ap");
    await screen.findByRole("option", { name: "apple" });
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("option", { name: "apple" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["apple"]);
  });

  it("adds a new label on Enter or comma, sorted like the backend stores them", async () => {
    const user = userEvent.setup();
    const input = renderInput();
    await user.type(input, "Zeta{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["Zeta"]);
    await user.type(input, "alpha,");
    expect(onChange).toHaveBeenLastCalledWith(["alpha", "Zeta"]);
    expect(screen.getByRole("button", { name: "Remove label alpha" })).toBeInTheDocument();
  });

  it("does not add a duplicate label", async () => {
    const user = userEvent.setup();
    const input = renderInput(["ui"]);
    await user.type(input, "ui{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("drops a chip when its remove button is clicked", async () => {
    const user = userEvent.setup();
    renderInput(["api", "ui"]);
    await user.click(screen.getByRole("button", { name: "Remove label api" }));
    expect(onChange).toHaveBeenLastCalledWith(["ui"]);
    expect(screen.queryByRole("button", { name: "Remove label api" })).not.toBeInTheDocument();
  });

  it("drops the last chip on Backspace in an empty input", async () => {
    const user = userEvent.setup();
    const input = renderInput(["api", "ui"]);
    await user.click(input);
    await user.keyboard("{Backspace}");
    expect(onChange).toHaveBeenLastCalledWith(["api"]);
  });
});

// QA (FB-215): matching ignores case, and leaving the field keeps a typed label.
describe("LabelInput edge cases", () => {
  it("matches the prefix ignoring case", async () => {
    const user = userEvent.setup();
    const input = renderInput();
    await user.type(input, "AP");
    await waitFor(() => expect(optionNames()).toEqual(["api", "apple"]));
  });

  it("adds the pending text as a chip on blur", async () => {
    const user = userEvent.setup();
    const input = renderInput(["api"]);
    await user.type(input, "docs");
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(["api", "docs"]);
    expect(input).toHaveValue("");
  });

  it("trims a typed label and ignores an empty one", async () => {
    const user = userEvent.setup();
    const input = renderInput();
    await user.type(input, "  {Enter}");
    expect(onChange).not.toHaveBeenCalled();
    await user.type(input, "  docs  {Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["docs"]);
  });
});
