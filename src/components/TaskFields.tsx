import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTasks, useUpdateTask } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import { useSprints } from "@/hooks/useSprints";
import { useProject } from "@/hooks/useProjects";
import { statusOptionsForType } from "@/features/boards/shared/boardConstants";
import { isStoryLevel } from "@/lib/storyLevel";
import {
  computeSprintDropPayload,
  isSprintScheduleBlocked,
  sprintGateToast,
} from "@/features/boards/shared/sprintBoardGrouping";
import type { Task, TaskPriority, TaskStatus, TaskType } from "@/types";
import type { TaskUpdatePayload } from "@/lib/commands";

// The editable fields of a task, shared by the detail panel and the Story page
// (SF-61) so both apply the same sprint gate and lifecycle move.

export const SELECT_CLS = "w-full rounded-md bg-gray-800 border border-gray-700 text-gray-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";

export type TaskDraft = {
  title: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: number | null;
  sprint_id: number | null;
  parent_id: number | null;
  story_points: number;
  due_date: string;
  labels: string;
  description: string;
};

const EMPTY_DRAFT: TaskDraft = {
  title: "",
  type: "subtask",
  status: "todo",
  priority: "medium",
  assignee_id: null,
  sprint_id: null,
  parent_id: null,
  story_points: 0,
  due_date: "",
  labels: "",
  description: "",
};

function draftFromTask(task: Task): TaskDraft {
  return {
    title: task.title,
    type: task.type,
    status: task.status,
    priority: task.priority,
    assignee_id: task.assignee_id,
    sprint_id: task.sprint_id,
    parent_id: task.parent_id,
    story_points: task.story_points,
    due_date: task.due_date ?? "",
    labels: task.labels ?? "",
    description: task.description ?? "",
  };
}

function setField<K extends keyof TaskDraft>(draft: TaskDraft, key: K, value: TaskDraft[K]) {
  draft[key] = value;
}

/**
 * Local edit state for a task. A different task resets the whole draft; for the
 * same task, a field whose server value changed (an outside write, FB-124) takes
 * the new value only while the draft still equals the last server value.
 */
export function useTaskDraft(task: Task | undefined) {
  const updateTask = useUpdateTask();
  const [draft, setDraft] = useState<TaskDraft>(EMPTY_DRAFT);
  const snapshot = useRef<{ id: number; fields: TaskDraft } | null>(null);

  useEffect(() => {
    if (!task) return;
    const next = draftFromTask(task);
    const prev = snapshot.current;
    snapshot.current = { id: task.id, fields: next };
    if (!prev || prev.id !== task.id) {
      setDraft(next);
      return;
    }
    const last = prev.fields;
    setDraft((d) => {
      const merged = { ...d };
      for (const key of Object.keys(next) as (keyof TaskDraft)[]) {
        if (next[key] !== last[key] && d[key] === last[key]) setField(merged, key, next[key]);
      }
      return merged;
    });
  }, [task]);

  const save = (patch: TaskUpdatePayload) => {
    if (!task) return;
    updateTask.mutate({ id: task.id, payload: patch });
  };

  const handleSelectChange = <K extends keyof TaskDraft>(
    key: K,
    value: TaskDraft[K],
    patchValue: TaskUpdatePayload[keyof TaskUpdatePayload],
  ) => {
    setDraft((d) => ({ ...d, [key]: value }));
    save({ [key]: patchValue } as TaskUpdatePayload);
  };

  return { draft, setDraft, save, handleSelectChange };
}

export type TaskDraftState = ReturnType<typeof useTaskDraft>;

/** Status, priority, assignee, sprint, parent story, points, due date and labels. */
export function TaskFields({ task, state }: { task: Task; state: TaskDraftState }) {
  const { draft, setDraft, save, handleSelectChange } = state;
  const { data: people } = usePeople();
  const { data: sprints } = useSprints(task.project_id);
  const { data: project } = useProject(task.project_id);
  const { data: projectTasks } = useTasks({ project_id: task.project_id });

  const peopleSafe = people ?? [];
  const sprintsSafe = sprints ?? [];
  const ladder = project?.ladder;
  const storyOptions = (projectTasks ?? []).filter((t) => isStoryLevel(t, ladder));
  // A Factory top-level bug is a Story (FB-52), so it has no parent to pick.
  const showParent = (task.type === "subtask" || task.type === "bug") && !isStoryLevel(task, ladder);
  // A Factory Story's points are the sum of its Subtasks' (SF-68).
  const derivedPoints = ladder === "factory" && isStoryLevel(task, ladder);

  // Reparenting to a story inherits the story's sprint so the child stays in the
  // same sprint as its parent (matches the Task Board DnD reparent behavior).
  const handleParentChange = (value: string) => {
    const newParentId = value ? Number(value) : null;
    const newParent =
      newParentId != null
        ? storyOptions.find((s) => s.id === newParentId) ?? null
        : null;
    const newSprintId = newParent ? newParent.sprint_id : draft.sprint_id;
    setDraft((d) => ({ ...d, parent_id: newParentId, sprint_id: newSprintId }));
    const patch: TaskUpdatePayload = { parent_id: newParentId };
    if (newParent && newParent.sprint_id !== task.sprint_id) {
      patch.sprint_id = newParent.sprint_id;
    }
    save(patch);
  };

  return (
    <>
      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-gray-500 text-[11px]">Status</Label>
          <select
            value={draft.status}
            onChange={(e) => {
              const v = e.target.value as TaskStatus;
              handleSelectChange("status", v, v);
            }}
            className={SELECT_CLS}
          >
            {statusOptionsForType(draft, project?.ladder).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-gray-500 text-[11px]">Priority</Label>
          <select
            value={draft.priority}
            onChange={(e) => {
              const v = e.target.value as TaskPriority;
              handleSelectChange("priority", v, v);
            }}
            className={SELECT_CLS}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div>
          <Label className="text-gray-500 text-[11px]">Assignee</Label>
          <select
            value={draft.assignee_id ?? ""}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              handleSelectChange("assignee_id", v, v);
            }}
            className={SELECT_CLS}
          >
            <option value="">Unassigned</option>
            {peopleSafe.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-gray-500 text-[11px]">Sprint</Label>
          <select
            aria-label="Sprint"
            value={draft.sprint_id ?? ""}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              // FB-90: same gate the Sprint Planning Board applies to drops.
              if (v !== null && isSprintScheduleBlocked(draft, v, project?.ladder)) {
                const gate = sprintGateToast(project?.ladder);
                toast.warning(gate.title, {
                  description: gate.description,
                });
                // Bailing out leaves `draft` untouched, so React has no
                // reason to re-render and the <select> would keep showing
                // the rejected sprint. Put the DOM node back by hand.
                e.target.value = String(draft.sprint_id ?? "");
                return;
              }
              // Assigning a sprint here must make the same lifecycle
              // move the planning board makes on a drop, or the story
              // stays at a discovery status while sitting in a sprint —
              // and the User Story Board, which renders the dev-workflow
              // columns, has nowhere to put it.
              const decision = computeSprintDropPayload(draft, v ?? "backlog", project?.ladder);
              if (!decision) return;
              setDraft((d) => ({ ...d, ...decision.override }));
              save(decision.payload);
            }}
            className={SELECT_CLS}
          >
            <option value="">No sprint</option>
            {sprintsSafe.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Parent story (only meaningful for task/bug) */}
      {showParent && (
        <div>
          <Label className="text-gray-500 text-[11px]">Parent story</Label>
          <select
            aria-label="Parent story"
            value={draft.parent_id ?? ""}
            onChange={(e) => handleParentChange(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">No parent</option>
            {storyOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Secondary row */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-gray-500 text-[11px]">Points</Label>
          <Input
            type="number"
            min={0}
            aria-label="Points"
            value={draft.story_points}
            readOnly={derivedPoints}
            title={derivedPoints ? "The sum of its Subtasks' points" : undefined}
            onChange={(e) => setDraft((d) => ({ ...d, story_points: Math.max(0, Number(e.target.value)) }))}
            onBlur={() => {
              if (!derivedPoints && draft.story_points !== task.story_points) save({ story_points: draft.story_points });
            }}
            className={`bg-gray-800 border-gray-700 h-8 text-sm ${derivedPoints ? "text-gray-400 cursor-default focus-visible:ring-0" : "text-gray-100"}`}
          />
        </div>
        <div>
          <Label className="text-gray-500 text-[11px]">Due date</Label>
          <Input
            type="date"
            value={draft.due_date}
            onChange={(e) => setDraft((d) => ({ ...d, due_date: e.target.value }))}
            onBlur={() => {
              const val = draft.due_date || null;
              if (val !== task.due_date) save({ due_date: val });
            }}
            className="bg-gray-800 border-gray-700 text-gray-100 h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-gray-500 text-[11px]">Labels</Label>
          <Input
            value={draft.labels}
            onChange={(e) => setDraft((d) => ({ ...d, labels: e.target.value }))}
            onBlur={() => {
              if (draft.labels !== task.labels) save({ labels: draft.labels });
            }}
            placeholder="bug, ui"
            className="bg-gray-800 border-gray-700 text-gray-100 h-8 text-sm"
          />
        </div>
      </div>
    </>
  );
}
