import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import About from "@/pages/About";

function renderPage() {
  return render(<About />);
}

describe("About page", () => {
  it("renders the About heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /about/i })).toBeInTheDocument();
  });

  it("shows the app name FlowBoard", () => {
    renderPage();
    expect(screen.getByText("FlowBoard")).toBeInTheDocument();
  });

  it("shows the version number", () => {
    renderPage();
    expect(screen.getByText(/1\.1\.1/)).toBeInTheDocument();
  });

  it("shows the description text", () => {
    renderPage();
    expect(screen.getByText(/local-first/i)).toBeInTheDocument();
  });

  it("lists tech stack entries", () => {
    renderPage();
    expect(screen.getByText("Tauri v2")).toBeInTheDocument();
    expect(screen.getByText("React 18")).toBeInTheDocument();
    expect(screen.getByText("SQLite")).toBeInTheDocument();
  });
});
