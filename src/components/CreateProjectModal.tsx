import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateProject } from "@/hooks/useProjects";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

const COLOR_SWATCHES = [
  "#6366f1", // indigo
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#8b5cf6", // violet
];

export function CreateProjectModal() {
  const open = useUiStore((s) => s.createProjectModalOpen);
  const setOpen = useUiStore((s) => s.setCreateProjectModalOpen);
  const setActiveProjectId = useUiStore((s) => s.setActiveProjectId);
  const createProject = useCreateProject();

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setKey("");
      setDescription("");
      setColor(COLOR_SWATCHES[0]);
      setError(null);
    }
  }, [open]);

  const trimmedName = name.trim();
  const trimmedKey = key.trim().toUpperCase();
  const canSubmit =
    trimmedName.length > 0 &&
    /^[A-Z0-9]{2,5}$/.test(trimmedKey) &&
    !createProject.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      const project = await createProject.mutateAsync({
        name: trimmedName,
        key: trimmedKey,
        description: description.trim() || undefined,
        color,
      });
      setActiveProjectId(project.id);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-gray-900 border-gray-800 text-gray-100">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription className="text-gray-400">
            Projects group sprints, tasks, and people together.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name" className="text-gray-300">
              Name
            </Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="FlowBoard MVP"
              autoFocus
              className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-key" className="text-gray-300">
              Key
            </Label>
            <Input
              id="project-key"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              placeholder="FB"
              maxLength={5}
              className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 uppercase"
            />
            <p className="text-xs text-gray-500">
              2–5 uppercase letters or digits. Used as the prefix for task IDs
              (e.g. <code className="text-gray-400">FB-42</code>).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description" className="text-gray-300">
              Description <span className="text-gray-500">(optional)</span>
            </Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of the project"
              rows={3}
              className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-gray-300">Color</Label>
            <div className="flex gap-2">
              {COLOR_SWATCHES.map((c) => (
                <button
                  type="button"
                  key={c}
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {createProject.isPending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
