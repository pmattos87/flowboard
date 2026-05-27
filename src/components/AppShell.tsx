import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useUiStore } from "@/stores/uiStore";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

function useKeyboardShortcuts() {
  const setCreateTaskModalOpen = useUiStore((s) => s.setCreateTaskModalOpen);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      const inInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement).isContentEditable;
      if (inInput) return;

      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setCreateTaskModalOpen(true);
      }

      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setCreateTaskModalOpen]);
}

export function AppShell() {
  useKeyboardShortcuts();

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto bg-gray-900 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
