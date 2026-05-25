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

export default function Settings() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const setActiveProjectId = useUiStore((s) => s.setActiveProjectId);
  const { data: project, isLoading } = useProject(activeProjectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

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

  if (activeProjectId == null) {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-semibold text-white">Project settings</h1>
        <p className="mt-2 text-sm text-gray-500">
          Select a project from the sidebar to edit its settings.
        </p>
      </div>
    );
  }

  if (isLoading || !project) {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-semibold text-white">Project settings</h1>
        <p className="mt-2 text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  const trimmedName = name.trim();
  const trimmedKey = key.trim().toUpperCase();
  const dirty =
    trimmedName !== project.name ||
    trimmedKey !== project.key ||
    description !== project.description ||
    color !== project.color;
  const valid =
    trimmedName.length > 0 && /^[A-Z0-9]{2,5}$/.test(trimmedKey);
  const canSave = dirty && valid && !updateProject.isPending;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
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
    setError(null);
    try {
      await deleteProject.mutateAsync(project.id);
      setActiveProjectId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConfirmingDelete(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold text-white">Project settings</h1>
      <p className="mt-1 text-sm text-gray-500">
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
    </div>
  );
}
