import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useDeleteProject,
  useProject,
  useUpdateProject,
} from "@/hooks/useProjects";
import { useUiStore } from "@/stores/uiStore";
import { seedDemoData } from "@/lib/commands";
import { cn } from "@/lib/utils";

const COLOR_SWATCHES = [
  "#6366f1",
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
];

// Matches the shortcuts registered in AppShell.tsx useKeyboardShortcuts
const SHORTCUTS = [
  { key: "N", action: "Open 'Create task' modal" },
  { key: "/", action: "Focus global search bar" },
] as const;

type Tab = "project" | "shortcuts";

const TABS: { id: Tab; label: string }[] = [
  { id: "project", label: "Project" },
  { id: "shortcuts", label: "Keyboard Shortcuts" },
];

export default function Settings() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const setActiveProjectId = useUiStore((s) => s.setActiveProjectId);
  const { data: project, isLoading } = useProject(activeProjectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [activeTab, setActiveTab] = useState<Tab>("project");
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Staging: seed controls
  const isStaging = import.meta.env.DEV;
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setKey(project.key);
      setDescription(project.description);
      setColor(project.color);
      setConfirmingDelete(false);
      setError(null);
    }
  }, [project]);

  const trimmedName = name.trim();
  const trimmedKey = key.trim().toUpperCase();
  const dirty =
    !!project &&
    (trimmedName !== project.name ||
      trimmedKey !== project.key ||
      description !== project.description ||
      color !== project.color);
  const valid =
    trimmedName.length > 0 && /^[A-Z0-9]{2,5}$/.test(trimmedKey);
  const canSave = dirty && valid && !updateProject.isPending;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || !project) return;
    setError(null);
    try {
      await updateProject.mutateAsync({
        id: project.id,
        payload: {
          name: trimmedName,
          key: trimmedKey,
          description,
          color,
        },
      });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    setError(null);
    try {
      await deleteProject.mutateAsync(project.id);
      setActiveProjectId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConfirmingDelete(false);
    }
  };

  const handleSeed = async (force: boolean) => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const result = await seedDemoData(force);
      setSeedResult(result);
    } catch (e) {
      setSeedResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold text-white">Settings</h1>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-gray-800 mt-4 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-blue-500 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Project tab ── */}
      {activeTab === "project" && (
        <>
          {activeProjectId == null && (
            <p className="text-sm text-gray-500">
              Select a project from the sidebar to edit its settings.
            </p>
          )}

          {activeProjectId != null && (isLoading || !project) && (
            <p className="text-sm text-gray-500">Loading…</p>
          )}

          {activeProjectId != null && project && (
            <>
              <p className="text-sm text-gray-500">
                Editing <span className="text-gray-300">{project.name}</span>
              </p>

              <form onSubmit={handleSave} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="settings-name" className="text-gray-300">
                    Name
                  </Label>
                  <Input
                    id="settings-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-gray-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="settings-key" className="text-gray-300">
                    Key
                  </Label>
                  <Input
                    id="settings-key"
                    value={key}
                    onChange={(e) => setKey(e.target.value.toUpperCase())}
                    maxLength={5}
                    className="bg-gray-800 border-gray-700 text-gray-100 uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="settings-description" className="text-gray-300">
                    Description
                  </Label>
                  <Textarea
                    id="settings-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="bg-gray-800 border-gray-700 text-gray-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-gray-300">Color</Label>
                  <div className="flex gap-2">
                    {COLOR_SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        aria-label={`Choose color ${c}`}
                        className={cn(
                          "h-7 w-7 rounded-md transition-all",
                          color === c
                            ? "ring-2 ring-offset-2 ring-offset-gray-900 ring-white"
                            : "opacity-80 hover:opacity-100",
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-400" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={!canSave}
                    className="bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    {updateProject.isPending ? "Saving…" : "Save changes"}
                  </Button>
                  {savedAt && !dirty && (
                    <span className="text-xs text-emerald-400">Saved</span>
                  )}
                </div>
              </form>

              <div className="mt-12 pt-6 border-t border-gray-800">
                <h2 className="text-sm font-semibold text-gray-300">Danger zone</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Deleting a project removes its sprints, tasks, comments, and time
                  logs. This cannot be undone.
                </p>
                {confirmingDelete ? (
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={deleteProject.isPending}
                    >
                      {deleteProject.isPending ? "Deleting…" : "Yes, delete project"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmingDelete(false)}
                      className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setConfirmingDelete(true)}
                    className="mt-3"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete project
                  </Button>
                )}
              </div>
            </>
          )}

          {/* Developer section — dev builds only */}
          {isStaging && (
            <div className="mt-12 pt-6 border-t border-gray-800">
              <h2 className="text-sm font-semibold text-amber-400">Developer</h2>
              <p className="mt-1 text-xs text-gray-500">
                Populate the database with realistic demo data for testing.
              </p>
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <Button
                  type="button"
                  onClick={() => handleSeed(false)}
                  disabled={seeding}
                  className="bg-amber-700 hover:bg-amber-600 text-white"
                >
                  {seeding ? "Seeding…" : "Seed demo data"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSeed(true)}
                  disabled={seeding}
                  className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
                >
                  Force re-seed
                </Button>
              </div>
              {seedResult && (
                <p className="mt-2 text-xs text-emerald-400">{seedResult}</p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Keyboard Shortcuts tab ── */}
      {activeTab === "shortcuts" && (
        <div className="max-w-xl space-y-4">
          <p className="text-sm text-gray-400">
            These shortcuts work anywhere in the app, except when focus is inside
            a text input or textarea.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="pb-3 pr-8">Key</th>
                <th className="pb-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {SHORTCUTS.map(({ key: k, action }) => (
                <tr key={k}>
                  <td className="py-2.5 pr-8">
                    <kbd className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs font-mono">
                      {k}
                    </kbd>
                  </td>
                  <td className="py-2.5 text-gray-300">{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
