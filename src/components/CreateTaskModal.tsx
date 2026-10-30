import { useEffect, useState } from "react";
import { BookOpen, Bug, CheckSquare, Layers } from "lucide-react";
import { toast } from "sonner";
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
import { useCreateTask } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import { useSprints } from "@/hooks/useSprints";
import { useProject } from "@/hooks/useProjects";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { isStoryLevel } from "@/lib/storyLevel";
import { statusOptionsForType } from "@/features/boards/shared/boardConstants";
import {
  isSprintScheduleBlocked,
  sprintGateToast,
} from "@/features/boards/shared/sprintBoardGrouping";
import type { TaskPriority, TaskStatus, TaskType } from "@/types";

type TaskForm = {
  title: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  sprint_id: number | null;
  parent_id: number | null;
  assignee_id: number | null;
  story_points: number;
  due_date: string;
  labels: string;
  description: string;
};

const emptyForm = (): TaskForm => ({
  title: "",
  type: "subtask",
  status: "todo",
  priority: "medium",
  sprint_id: null,
  parent_id: null,
  assignee_id: null,
  story_points: 0,
  due_date: "",
  labels: "",
  description: "",
});

const TYPE_OPTIONS: { value: TaskType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "story", label: "Story", icon: <BookOpen className="h-3.5 w-3.5" />, color: "text-emerald-400 border-emerald-600 bg-emerald-900/40" },
  { value: "bug", label: "Bug", icon: <Bug className="h-3.5 w-3.5" />, color: "text-red-400 border-red-600 bg-red-900/40" },
  { value: "subtask", label: "Subtask", icon: <CheckSquare className="h-3.5 w-3.5" />, color: "text-blue-400 border-blue-600 bg-blue-900/40" },
  { value: "epic", label: "Epic", icon: <Layers className="h-3.5 w-3.5" />, color: "text-purple-400 border-purple-600 bg-purple-900/40" },
];

export function CreateTaskModal() {
  const createTaskModalOpen = useUiStore((s) => s.createTaskModalOpen);
  const setCreateTaskModalOpen = useUiStore((s) => s.setCreateTaskModalOpen);
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const createTaskPrefill = useUiStore((s) => s.createTaskPrefill);

  const createTask = useCreateTask();
  const { data: people } = usePeople();
  const { data: sprints } = useSprints(activeProjectId ?? undefined);
  const { data: project } = useProject(activeProjectId);

  const [form, setForm] = useState<TaskForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  // Apply prefill each time the modal opens with a fresh prefill payload.
  useEffect(() => {
    if (!createTaskModalOpen) return;
    if (createTaskPrefill === null) return;
    setForm((f) => ({
      ...f,
      parent_id: createTaskPrefill.parent_id ?? f.parent_id,
      sprint_id:
        createTaskPrefill.sprint_id !== undefined
          ? createTaskPrefill.sprint_id
          : f.sprint_id,
      status: createTaskPrefill.status ?? f.status,
      type: createTaskPrefill.type ?? f.type,
    }));
  }, [createTaskModalOpen, createTaskPrefill]);

  // The form starts at `todo`; on a Factory project a Story starts in backlog
  // instead (SF-31), so fall back to the first status the ladder offers.
  const statusOptions = statusOptionsForType(form, project?.ladder);
  const status = statusOptions.some((o) => o.value === form.status)
    ? form.status
    : statusOptions[0].value;
  const gate = sprintGateToast(project?.ladder);
  // A Factory Story's points are the sum of its Subtasks' (SF-68).
  const derivedPoints = project?.ladder === "factory" && isStoryLevel(form, project.ladder);
  // FB-224: a Factory epic is never built. It opens at `todo` with no sprint,
  // points or parent, so the modal drops those fields for it.
  const factoryEpic = project?.ladder === "factory" && form.type === "epic";

  const lockType = createTaskPrefill?.lockType ?? false;
  // On a Factory project a top-level bug is a Story too (FB-52), so the
  // create-story modal offers Bug next to Story, and Epic (FB-224) for an
  // initiative that groups Stories.
  const lockedTypes: TaskType[] =
    lockType && project?.ladder === "factory" && createTaskPrefill?.type === "story"
      ? ["story", "bug", "epic"]
      : [createTaskPrefill?.type ?? "story"];
  const typeOptions = lockType
    ? TYPE_OPTIONS.filter((opt) => lockedTypes.includes(opt.value))
    : TYPE_OPTIONS;

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setCreateTaskModalOpen(false);
      setForm(emptyForm());
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const title = form.title.trim();
    if (!title || activeProjectId == null) return;
    // FB-90: the select's own guard can be sidestepped by picking a sprint while
    // the status is still valid and then changing the status, so re-check here.
    if (!factoryEpic && form.sprint_id !== null && isSprintScheduleBlocked({ ...form, status, sprint_id: null }, form.sprint_id, project?.ladder)) {
      toast.warning(gate.title, { description: gate.description });
      return;
    }
    try {
      await createTask.mutateAsync({
        project_id: activeProjectId,
        title,
        type: form.type,
        status: factoryEpic ? "todo" : status,
        priority: form.priority,
        ...(factoryEpic ? {} : { sprint_id: form.sprint_id }),
        parent_id: factoryEpic ? null : form.parent_id,
        assignee_id: form.assignee_id,
        story_points: derivedPoints || factoryEpic ? 0 : form.story_points,
        due_date: form.due_date || null,
        labels: form.labels.trim(),
        description: form.description.trim(),
      });
      setCreateTaskModalOpen(false);
      setForm(emptyForm());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={createTaskModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{lockType ? "Create story" : "Create subtask"}</DialogTitle>
        </DialogHeader>

        {activeProjectId == null ? (
          <p className="text-sm text-gray-400 py-4">
            Select a project from the sidebar first.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="task-title" className="text-gray-300">Title</Label>
              <Input
                id="task-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Subtask title"
                className="bg-gray-800 border-gray-700 text-gray-100"
                required
                autoFocus
              />
            </div>

            {/* Type segmented selector */}
            <div className="space-y-1.5">
              <Label className="text-gray-300">Type</Label>
              <div className="flex gap-2">
                {typeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type: opt.value }))}
                    disabled={typeOptions.length === 1}
                    aria-pressed={form.type === opt.value}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                      form.type === opt.value
                        ? opt.color
                        : "text-gray-500 border-gray-700 bg-transparent hover:border-gray-600 hover:text-gray-300",
                      typeOptions.length === 1 && "cursor-default",
                    )}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-status" className="text-gray-300">Status</Label>
                <select
                  id="task-status"
                  value={status}
                  disabled={factoryEpic}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as TaskStatus }))}
                  className="w-full rounded-md bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-priority" className="text-gray-300">Priority</Label>
                <select
                  id="task-priority"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
                  className="w-full rounded-md bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            {/* Sprint + Assignee */}
            <div className="grid grid-cols-2 gap-3">
              {!factoryEpic && (
              <div className="space-y-1.5">
                <Label htmlFor="task-sprint" className="text-gray-300">Sprint</Label>
                <select
                  id="task-sprint"
                  value={form.sprint_id ?? ""}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : null;
                    // FB-90: same gate the Sprint Planning Board applies to drops.
                    if (v !== null && isSprintScheduleBlocked({ ...form, status, sprint_id: null }, v, project?.ladder)) {
                      toast.warning(gate.title, {
                        description: gate.description,
                      });
                      // `form` is unchanged, so React has no reason to re-render
                      // and the <select> would keep showing the rejected sprint.
                      e.target.value = String(form.sprint_id ?? "");
                      return;
                    }
                    setForm((f) => ({ ...f, sprint_id: v }));
                  }}
                  className="w-full rounded-md bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No sprint</option>
                  {(sprints ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="task-assignee" className="text-gray-300">Assignee</Label>
                <select
                  id="task-assignee"
                  value={form.assignee_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      assignee_id: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full rounded-md bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Unassigned</option>
                  {(people ?? []).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Story points + Due date + Labels */}
            <div className={cn("grid gap-3", factoryEpic ? "grid-cols-2" : "grid-cols-3")}>
              {!factoryEpic && (
              <div className="space-y-1.5">
                <Label htmlFor="task-points" className="text-gray-300">Points</Label>
                <Input
                  id="task-points"
                  type="number"
                  min={0}
                  step={1}
                  value={derivedPoints ? 0 : form.story_points}
                  disabled={derivedPoints}
                  title={derivedPoints ? "The sum of its Subtasks' points, once it is split" : undefined}
                  onChange={(e) => setForm((f) => ({ ...f, story_points: Math.max(0, Number(e.target.value)) }))}
                  className="bg-gray-800 border-gray-700 text-gray-100"
                />
              </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="task-due" className="text-gray-300">Due date</Label>
                <Input
                  id="task-due"
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-gray-100"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-labels" className="text-gray-300">Labels</Label>
                <Input
                  id="task-labels"
                  value={form.labels}
                  onChange={(e) => setForm((f) => ({ ...f, labels: e.target.value }))}
                  placeholder="bug, ui"
                  className="bg-gray-800 border-gray-700 text-gray-100"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="task-desc" className="text-gray-300">
                Description{" "}
                <span className="text-gray-500 font-normal">(optional)</span>
              </Label>
              <Textarea
                id="task-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Add a description…"
                rows={3}
                className="bg-gray-800 border-gray-700 text-gray-100"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400" role="alert">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateTaskModalOpen(false)}
                className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!form.title.trim() || createTask.isPending}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                {createTask.isPending ? "Creating…" : factoryEpic ? "Create epic" : lockType ? "Create story" : "Create subtask"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
