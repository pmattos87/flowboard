import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
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
import { ProjectBadge } from "@/components/ProjectBadge";
import { fileToLogoDataUrl } from "@/lib/image";
import { randomIdentityColor } from "@/lib/colors";

export function CreateProjectModal() {
  const open = useUiStore((s) => s.createProjectModalOpen);
  const setOpen = useUiStore((s) => s.setCreateProjectModalOpen);
  const setActiveProjectId = useUiStore((s) => s.setActiveProjectId);
  const createProject = useCreateProject();

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [logoData, setLogoData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setKey("");
      setDescription("");
      setLogoData(null);
      setError(null);
    }
  }, [open]);

  const trimmedName = name.trim();
  const trimmedKey = key.trim().toUpperCase();
  const canSubmit =
    trimmedName.length > 0 &&
    /^[A-Z0-9]{2,5}$/.test(trimmedKey) &&
    !createProject.isPending;

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setError(null);
    try {
      setLogoData(await fileToLogoDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      const project = await createProject.mutateAsync({
        name: trimmedName,
        key: trimmedKey,
        description: description.trim() || undefined,
        color: randomIdentityColor(),
        logo_data: logoData,
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
            <Label className="text-gray-300">
              Logo <span className="text-gray-500">(optional)</span>
            </Label>
            <div className="flex items-center gap-3">
              <ProjectBadge
                project={{ name: trimmedName || "?", color: "#6366f1", logo_data: logoData }}
                className="h-12 w-12 rounded-md"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload logo
              </Button>
              {logoData && (
                <button
                  type="button"
                  onClick={() => setLogoData(null)}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500">
              No logo? A color will be assigned automatically.
            </p>
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
