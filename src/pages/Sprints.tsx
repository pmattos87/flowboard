import { useState } from "react";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateSprint,
  useDeleteSprint,
  useSprints,
  useUpdateSprint,
} from "@/hooks/useSprints";
import { useUiStore } from "@/stores/uiStore";
import type { Sprint, SprintStatus } from "@/types";
import { cn } from "@/lib/utils";

type SprintForm = {
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
  status: SprintStatus;
};

const emptyForm = (): SprintForm => ({
  name: "",
  goal: "",
  start_date: "",
  end_date: "",
  status: "backlog",
});

const STATUS_STYLES: Record<SprintStatus, string> = {
  backlog: "bg-gray-700 text-gray-300",
  active: "bg-blue-700/60 text-blue-200",
  completed: "bg-emerald-800/60 text-emerald-300",
};

const STATUS_LABELS: Record<SprintStatus, string> = {
  backlog: "Backlog",
  active: "Active",
  completed: "Completed",
};

function formatDate(d: string) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Sprints() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const { data: sprints, isLoading } = useSprints(activeProjectId ?? undefined);
  const createSprint = useCreateSprint();
  const updateSprint = useUpdateSprint();
  const deleteSprint = useDeleteSprint();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [form, setForm] = useState<SprintForm>(emptyForm());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (sprint: Sprint) => {
    setEditing(sprint);
    setForm({
      name: sprint.name,
      goal: sprint.goal ?? "",
      start_date: sprint.start_date,
      end_date: sprint.end_date,
      status: sprint.status as SprintStatus,
    });
    setError(null);
    setModalOpen(true);
  };

  const handleModalClose = (open: boolean) => {
    if (!open) {
      setModalOpen(false);
      setEditing(null);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = form.name.trim();
    if (!name || !form.start_date || !form.end_date || activeProjectId == null) return;
    try {
      if (editing) {
        await updateSprint.mutateAsync({
          id: editing.id,
          payload: {
            name,
            goal: form.goal.trim(),
            start_date: form.start_date,
            end_date: form.end_date,
            status: form.status,
          },
        });
      } else {
        await createSprint.mutateAsync({
          project_id: activeProjectId,
          name,
          goal: form.goal.trim(),
          start_date: form.start_date,
          end_date: form.end_date,
          status: form.status,
        });
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (sprint: Sprint) => {
    if (deletingId === sprint.id) {
      try {
        await deleteSprint.mutateAsync(sprint.id);
      } catch (_) {
        // toasts added in Phase 9
      }
      setDeletingId(null);
    } else {
      setDeletingId(sprint.id);
    }
  };

  const isPending = createSprint.isPending || updateSprint.isPending;

  if (activeProjectId == null) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold text-white">Sprints</h1>
        <p className="mt-2 text-sm text-gray-500">
          Select a project from the sidebar to view its sprints.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Sprints</h1>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white">
          <Plus className="h-4 w-4" />
          Create sprint
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : sprints && sprints.length > 0 ? (
        <div className="space-y-2">
          {sprints.map((s) =>
            deletingId === s.id ? (
              <div key={s.id} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
                <p className="text-sm text-gray-300">
                  Delete sprint{" "}
                  <span className="text-white font-medium">{s.name}</span>?
                </p>
                <div className="flex gap-2 ml-4 shrink-0">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(s)}
                    disabled={deleteSprint.isPending}
                  >
                    {deleteSprint.isPending ? "Deleting…" : "Delete"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeletingId(null)}
                    className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div key={s.id} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{s.name}</span>
                      <span
                        className={cn(
                          "text-[11px] font-medium px-2 py-0.5 rounded-full",
                          STATUS_STYLES[s.status as SprintStatus],
                        )}
                      >
                        {STATUS_LABELS[s.status as SprintStatus]}
                      </span>
                    </div>
                    {s.goal && (
                      <p className="mt-1 text-xs text-gray-400 line-clamp-1">{s.goal}</p>
                    )}
                    <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-500">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {formatDate(s.start_date)} — {formatDate(s.end_date)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      aria-label={`Edit ${s.name}`}
                      className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s)}
                      aria-label={`Delete ${s.name}`}
                      className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-700 p-12 text-center">
          <p className="text-sm text-gray-500">No sprints yet for this project.</p>
          <Button
            variant="outline"
            onClick={openCreate}
            className="mt-4 bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            Create the first sprint
          </Button>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={handleModalClose}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit sprint" : "Create sprint"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="sprint-name" className="text-gray-300">Name</Label>
              <Input
                id="sprint-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Sprint 1"
                className="bg-gray-800 border-gray-700 text-gray-100"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sprint-goal" className="text-gray-300">
                Goal{" "}
                <span className="text-gray-500 font-normal">(optional)</span>
              </Label>
              <Textarea
                id="sprint-goal"
                value={form.goal}
                onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
                placeholder="What will you achieve this sprint?"
                rows={2}
                className="bg-gray-800 border-gray-700 text-gray-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sprint-start" className="text-gray-300">Start date</Label>
                <Input
                  id="sprint-start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-gray-100"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sprint-end" className="text-gray-300">End date</Label>
                <Input
                  id="sprint-end"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-gray-100"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sprint-status" className="text-gray-300">Status</Label>
              <select
                id="sprint-status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as SprintStatus }))}
                className="w-full rounded-md bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="backlog">Backlog</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            {error && (
              <p className="text-sm text-red-400" role="alert">{error}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!form.name.trim() || !form.start_date || !form.end_date || isPending}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                {isPending ? "Saving…" : editing ? "Save changes" : "Create sprint"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
