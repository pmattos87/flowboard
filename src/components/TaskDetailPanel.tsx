import { useEffect, useState } from "react";
import {
  BookOpen,
  Bug,
  CheckSquare,
  ExternalLink,
  Layers,
  Paperclip,
  Trash2,
  X,
} from "lucide-react";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { stat } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTask, useTasks, useUpdateTask } from "@/hooks/useTasks";
import { useComments, useCreateComment, useDeleteComment } from "@/hooks/useComments";
import { useTimeLogs, useCreateTimeLog, useDeleteTimeLog } from "@/hooks/useTimeLogs";
import { useAttachments, useCreateAttachment, useDeleteAttachment } from "@/hooks/useAttachments";
import { openAttachment } from "@/lib/commands";
import { usePeople } from "@/hooks/usePeople";
import { useSprints } from "@/hooks/useSprints";
import { useProject } from "@/hooks/useProjects";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import type {
  Attachment,
  Comment,
  Person,
  TaskPriority,
  TaskStatus,
  TaskType,
  TimeLog,
} from "@/types";
import type { TaskUpdatePayload } from "@/lib/commands";

// ─── Helpers ──────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDate(d: string): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dt: string): string {
  if (!dt) return "—";
  const d = new Date(dt);
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${time}`;
}

const TYPE_BADGE: Record<TaskType, { label: string; icon: React.ReactNode; cls: string }> = {
  story: { label: "Story", icon: <BookOpen className="h-3 w-3" />, cls: "bg-emerald-900/40 text-emerald-400 border border-emerald-700" },
  bug:   { label: "Bug",   icon: <Bug className="h-3 w-3" />,       cls: "bg-red-900/40 text-red-400 border border-red-700" },
  task:  { label: "Task",  icon: <CheckSquare className="h-3 w-3" />, cls: "bg-blue-900/40 text-blue-400 border border-blue-700" },
  epic:  { label: "Epic",  icon: <Layers className="h-3 w-3" />,     cls: "bg-purple-900/40 text-purple-400 border border-purple-700" },
};

const SELECT_CLS = "w-full rounded-md bg-gray-800 border border-gray-700 text-gray-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";

// ─── CommentsSection ───────────────────────────────────────

function CommentsSection({ taskId, people }: { taskId: number; people: Person[] }) {
  const { data: comments } = useComments(taskId);
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment(taskId);

  const [authorId, setAuthorId] = useState<number | null>(people[0]?.id ?? null);
  const [body, setBody] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (people.length > 0 && authorId == null) setAuthorId(people[0].id);
  }, [people, authorId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || authorId == null) return;
    await createComment.mutateAsync({ task_id: taskId, author_id: authorId, body: body.trim() });
    setBody("");
  };

  const handleDelete = async (c: Comment) => {
    if (deletingId === c.id) {
      await deleteComment.mutateAsync(c.id);
      setDeletingId(null);
    } else {
      setDeletingId(c.id);
    }
  };

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Comments</h3>

      {comments && comments.length > 0 ? (
        <div className="space-y-3 mb-4">
          {comments.map((c) => {
            const author = people.find((p) => p.id === c.author_id);
            return (
              <div key={c.id} className="bg-gray-800 rounded-lg p-3">
                {deletingId === c.id ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400">Delete this comment?</p>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(c)} disabled={deleteComment.isPending} className="h-6 px-2 text-xs">
                        {deleteComment.isPending ? "…" : "Delete"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDeletingId(null)} className="h-6 px-2 text-xs bg-transparent border-gray-700 text-gray-300 hover:bg-gray-700">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                          style={{ backgroundColor: author?.avatar_color ?? "#6366f1" }}
                        >
                          {(author?.name ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-medium text-gray-300">{author?.name ?? "Unknown"}</span>
                        <span className="text-[11px] text-gray-500">{formatDateTime(c.created_at)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-gray-700 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap">{c.body}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-500 mb-4">No comments yet.</p>
      )}

      <form onSubmit={handleAdd} className="space-y-2">
        <select
          value={authorId ?? ""}
          onChange={(e) => setAuthorId(e.target.value ? Number(e.target.value) : null)}
          className={SELECT_CLS}
          required
        >
          <option value="">Select author…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment…"
          rows={2}
          className="bg-gray-800 border-gray-700 text-gray-100 text-sm"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!body.trim() || authorId == null || createComment.isPending}
          className="bg-blue-600 hover:bg-blue-500 text-white"
        >
          {createComment.isPending ? "Adding…" : "Add comment"}
        </Button>
      </form>
    </div>
  );
}

// ─── AttachmentsSection ────────────────────────────────────

function AttachmentsSection({ taskId }: { taskId: number }) {
  const { data: attachments } = useAttachments(taskId);
  const createAttachment = useCreateAttachment();
  const deleteAttachment = useDeleteAttachment(taskId);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [attaching, setAttaching] = useState(false);

  const handleAttach = async () => {
    setAttaching(true);
    try {
      const result = await openFilePicker({ multiple: false });
      if (!result) return;
      const filepath = Array.isArray(result) ? result[0] : result;
      const filename = filepath.split(/[\\/]/).pop() ?? filepath;
      const info = await stat(filepath);
      await createAttachment.mutateAsync({
        task_id: taskId,
        filename,
        filepath,
        size: info.size,
      });
    } catch (err) {
      console.error("[attachment] failed:", err);
    } finally {
      setAttaching(false);
    }
  };

  const handleDelete = async (a: Attachment) => {
    if (deletingId === a.id) {
      await deleteAttachment.mutateAsync(a.id);
      setDeletingId(null);
    } else {
      setDeletingId(a.id);
    }
  };

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Attachments</h3>

      {attachments && attachments.length > 0 ? (
        <div className="space-y-2 mb-3">
          {attachments.map((a) => (
            <div key={a.id} className="bg-gray-800 rounded-lg px-3 py-2">
              {deletingId === a.id ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-400">Delete this attachment?</p>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(a)} disabled={deleteAttachment.isPending} className="h-6 px-2 text-xs">
                      {deleteAttachment.isPending ? "…" : "Delete"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeletingId(null)} className="h-6 px-2 text-xs bg-transparent border-gray-700 text-gray-300 hover:bg-gray-700">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Paperclip className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => openAttachment(a.filepath).catch(console.error)}
                      className="text-sm text-gray-200 truncate hover:text-blue-400 transition-colors text-left w-full"
                    >
                      {a.filename}
                    </button>
                    <p className="text-[11px] text-gray-500">
                      {formatSize(a.size)} · {formatDateTime(a.uploaded_at)}
                    </p>
                    <p className="text-[10px] text-gray-600 truncate">{a.filepath}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAttachment(a.filepath).catch(console.error)}
                    className="p-1 rounded text-gray-600 hover:text-blue-400 hover:bg-gray-700 transition-colors shrink-0"
                    title="Open file"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(a)}
                    className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-gray-700 transition-colors shrink-0"
                    title="Delete attachment"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 mb-3">No attachments yet.</p>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleAttach}
        disabled={attaching || createAttachment.isPending}
        className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
      >
        <Paperclip className="h-3.5 w-3.5 mr-1.5" />
        {attaching ? "Picking file…" : "Attach file"}
      </Button>
    </div>
  );
}

// ─── TimeLogsSection ───────────────────────────────────────

type TimeLogForm = {
  person_id: number | null;
  hours: number;
  minutes: number;
  logged_at: string;
  note: string;
};

const today = () => new Date().toISOString().slice(0, 10);

function TimeLogsSection({ taskId, people }: { taskId: number; people: Person[] }) {
  const { data: timeLogs } = useTimeLogs(taskId);
  const createTimeLog = useCreateTimeLog();
  const deleteTimeLog = useDeleteTimeLog(taskId);

  const [form, setForm] = useState<TimeLogForm>({
    person_id: people[0]?.id ?? null,
    hours: 0,
    minutes: 0,
    logged_at: today(),
    note: "",
  });
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (people.length > 0 && form.person_id == null) {
      setForm((f) => ({ ...f, person_id: people[0].id }));
    }
  }, [people, form.person_id]);

  const handleLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.person_id == null || (form.hours === 0 && form.minutes === 0)) return;
    const totalMinutes = form.hours * 60 + form.minutes;
    await createTimeLog.mutateAsync({
      task_id: taskId,
      person_id: form.person_id,
      minutes: totalMinutes,
      logged_at: form.logged_at,
      note: form.note.trim(),
    });
    setForm((f) => ({ ...f, hours: 0, minutes: 0, note: "" }));
  };

  const handleDelete = async (t: TimeLog) => {
    if (deletingId === t.id) {
      await deleteTimeLog.mutateAsync(t.id);
      setDeletingId(null);
    } else {
      setDeletingId(t.id);
    }
  };

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Time Logs</h3>

      {timeLogs && timeLogs.length > 0 ? (
        <div className="space-y-2 mb-4">
          {timeLogs.map((t) => {
            const person = people.find((p) => p.id === t.person_id);
            return (
              <div key={t.id} className="bg-gray-800 rounded-lg px-3 py-2">
                {deletingId === t.id ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400">Delete this time log?</p>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(t)} disabled={deleteTimeLog.isPending} className="h-6 px-2 text-xs">
                        {deleteTimeLog.isPending ? "…" : "Delete"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDeletingId(null)} className="h-6 px-2 text-xs bg-transparent border-gray-700 text-gray-300 hover:bg-gray-700">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{formatDuration(t.minutes)}</span>
                        <span className="text-xs text-gray-400">{person?.name ?? "Unknown"}</span>
                        <span className="text-[11px] text-gray-500">{formatDate(t.logged_at)}</span>
                      </div>
                      {t.note && <p className="text-xs text-gray-500 mt-0.5">{t.note}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-gray-700 transition-colors shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-500 mb-4">No time logged yet.</p>
      )}

      <form onSubmit={handleLog} className="space-y-2">
        <select
          value={form.person_id ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, person_id: e.target.value ? Number(e.target.value) : null }))}
          className={SELECT_CLS}
          required
        >
          <option value="">Select person…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-gray-400 text-[11px]">Hours</Label>
            <Input
              type="number"
              min={0}
              value={form.hours}
              onChange={(e) => setForm((f) => ({ ...f, hours: Math.max(0, Number(e.target.value)) }))}
              className="bg-gray-800 border-gray-700 text-gray-100 h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-gray-400 text-[11px]">Minutes</Label>
            <Input
              type="number"
              min={0}
              max={59}
              value={form.minutes}
              onChange={(e) => setForm((f) => ({ ...f, minutes: Math.min(59, Math.max(0, Number(e.target.value))) }))}
              className="bg-gray-800 border-gray-700 text-gray-100 h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-gray-400 text-[11px]">Date</Label>
            <Input
              type="date"
              value={form.logged_at}
              onChange={(e) => setForm((f) => ({ ...f, logged_at: e.target.value }))}
              className="bg-gray-800 border-gray-700 text-gray-100 h-8 text-sm"
            />
          </div>
        </div>
        <Textarea
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          placeholder="Note (optional)"
          rows={1}
          className="bg-gray-800 border-gray-700 text-gray-100 text-sm"
        />
        <Button
          type="submit"
          size="sm"
          disabled={form.person_id == null || (form.hours === 0 && form.minutes === 0) || createTimeLog.isPending}
          className="bg-blue-600 hover:bg-blue-500 text-white"
        >
          {createTimeLog.isPending ? "Logging…" : "Log time"}
        </Button>
      </form>
    </div>
  );
}

// ─── TaskDetailPanel ───────────────────────────────────────

type PanelDraft = {
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

export function TaskDetailPanel() {
  const selectedTaskId = useUiStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId);

  const isOpen = selectedTaskId != null;

  const { data: task, isLoading } = useTask(selectedTaskId);
  const updateTask = useUpdateTask();
  const { data: people } = usePeople();
  const { data: sprints } = useSprints(task?.project_id);
  const { data: project } = useProject(task?.project_id);
  const { data: projectTasks } = useTasks(
    task?.project_id != null ? { project_id: task.project_id } : undefined,
  );

  const [draft, setDraft] = useState<PanelDraft>({
    title: "",
    type: "task",
    status: "todo",
    priority: "medium",
    assignee_id: null,
    sprint_id: null,
    parent_id: null,
    story_points: 0,
    due_date: "",
    labels: "",
    description: "",
  });

  useEffect(() => {
    if (task) {
      setDraft({
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
      });
    }
  }, [task?.id]);

  const save = (patch: TaskUpdatePayload) => {
    if (!task) return;
    updateTask.mutate({ id: task.id, payload: patch });
  };

  const handleSelectChange = <K extends keyof PanelDraft>(
    key: K,
    value: PanelDraft[K],
    patchValue: TaskUpdatePayload[keyof TaskUpdatePayload],
  ) => {
    setDraft((d) => ({ ...d, [key]: value }));
    save({ [key]: patchValue } as TaskUpdatePayload);
  };

  const taskKey = project && task ? `${project.key}-${task.task_number}` : task ? `#${task.id}` : "";
  const typeBadge = task ? TYPE_BADGE[task.type] : null;
  const peopleSafe = people ?? [];
  const sprintsSafe = sprints ?? [];
  const storyOptions = (projectTasks ?? []).filter((t) => t.type === "story");
  const showParent = task?.type === "task" || task?.type === "bug";

  // Reparenting to a story inherits the story's sprint so the child stays in the
  // same sprint as its parent (matches the Task Board DnD reparent behavior).
  const handleParentChange = (value: string) => {
    if (!task) return;
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
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setSelectedTaskId(null)}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-[520px] bg-gray-900 border-l border-gray-800",
          "flex flex-col",
          "transition-transform duration-300",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="h-12 shrink-0 flex items-center gap-2 px-4 border-b border-gray-800">
          <span className="text-xs font-mono text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{taskKey}</span>
          {typeBadge && (
            <span className={cn("flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full", typeBadge.cls)}>
              {typeBadge.icon}
              {typeBadge.label}
            </span>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setSelectedTaskId(null)}
            className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : !task ? (
            <p className="text-sm text-gray-500">Task not found.</p>
          ) : (
            <>
              {/* Title */}
              <input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                onBlur={() => {
                  const t = draft.title.trim();
                  if (t && t !== task.title) save({ title: t });
                }}
                className="w-full bg-transparent text-lg font-semibold text-white placeholder:text-gray-600 focus:outline-none border-b border-transparent focus:border-gray-700 pb-1 transition-colors"
                placeholder="Task title"
              />

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
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option>
                    <option value="done">Done</option>
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
                    value={draft.sprint_id ?? ""}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      handleSelectChange("sprint_id", v, v);
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
                    value={draft.story_points}
                    onChange={(e) => setDraft((d) => ({ ...d, story_points: Math.max(0, Number(e.target.value)) }))}
                    onBlur={() => {
                      if (draft.story_points !== task.story_points) save({ story_points: draft.story_points });
                    }}
                    className="bg-gray-800 border-gray-700 text-gray-100 h-8 text-sm"
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

              {/* Description */}
              <div>
                <Label className="text-gray-500 text-[11px]">Description</Label>
                <Textarea
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  onBlur={() => {
                    if (draft.description !== task.description) save({ description: draft.description });
                  }}
                  placeholder="Add a description…"
                  rows={4}
                  className="bg-gray-800 border-gray-700 text-gray-100 text-sm"
                />
              </div>

              {/* Divider */}
              <div className="border-t border-gray-800" />

              {/* Sub-sections */}
              <CommentsSection taskId={task.id} people={peopleSafe} />
              <div className="border-t border-gray-800" />
              <AttachmentsSection taskId={task.id} />
              <div className="border-t border-gray-800" />
              <TimeLogsSection taskId={task.id} people={peopleSafe} />

              {/* Bottom padding */}
              <div className="h-4" />
            </>
          )}
        </div>
      </div>
    </>
  );
}
