import { useState } from "react";
import { SkeletonRow } from "@/components/Skeleton";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SprintFormDialog } from "@/features/sprints/SprintFormDialog";
import { useDeleteSprint, useSprints } from "@/hooks/useSprints";
import { useUiStore } from "@/stores/uiStore";
import type { Sprint, SprintStatus } from "@/types";
import { cn } from "@/lib/utils";

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
  const deleteSprint = useDeleteSprint();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (sprint: Sprint) => {
    setEditing(sprint);
    setModalOpen(true);
  };

  const handleModalClose = (open: boolean) => {
    setModalOpen(open);
    if (!open) setEditing(null);
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
        <div className="space-y-1">{Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}</div>
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

      <SprintFormDialog
        open={modalOpen}
        onOpenChange={handleModalClose}
        projectId={activeProjectId}
        editing={editing}
      />
    </div>
  );
}
