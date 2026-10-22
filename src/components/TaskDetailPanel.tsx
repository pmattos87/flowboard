import { useEffect, useState } from "react";
import {
  Ban,
  BookOpen,
  Bug,
  CheckSquare,
  ExternalLink,
  Layers,
  Paperclip,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTask } from "@/hooks/useTasks";
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
} from "@/hooks/useComments";
import { useTimeLogs, useCreateTimeLog, useDeleteTimeLog } from "@/hooks/useTimeLogs";
import { useAttachments, useCreateAttachment, useDeleteAttachment } from "@/hooks/useAttachments";
import { openAttachment } from "@/lib/commands";
import { usePeople } from "@/hooks/usePeople";
import { useProject } from "@/hooks/useProjects";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { SELECT_CLS, TaskFields, useTaskDraft } from "@/components/TaskFields";
import { Avatar } from "@/components/Avatar";
import { MarkdownDescription } from "@/components/MarkdownDescription";
import type {
  Attachment,
  Comment,
  Person,
  TaskType,
  TimeLog,
} from "@/types";

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

export const TYPE_BADGE: Record<TaskType, { label: string; icon: React.ReactNode; cls: string }> = {
  story: { label: "Story", icon: <BookOpen className="h-3 w-3" />, cls: "bg-emerald-900/40 text-emerald-400 border border-emerald-700" },
  bug:   { label: "Bug",   icon: <Bug className="h-3 w-3" />,       cls: "bg-red-900/40 text-red-400 border border-red-700" },
  subtask:  { label: "Task",  icon: <CheckSquare className="h-3 w-3" />, cls: "bg-blue-900/40 text-blue-400 border border-blue-700" },
  epic:  { label: "Epic",  icon: <Layers className="h-3 w-3" />,     cls: "bg-purple-900/40 text-purple-400 border border-purple-700" },
};


// ─── CommentsSection ───────────────────────────────────────

export function CommentsSection({ taskId, people }: { taskId: number; people: Person[] }) {
  const { data: comments } = useComments(taskId);
  const createComment = useCreateComment();
  const updateComment = useUpdateComment(taskId);
  const deleteComment = useDeleteComment(taskId);

  const [authorId, setAuthorId] = useState<number | null>(people[0]?.id ?? null);
  const [body, setBody] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");

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

  const startEdit = (c: Comment) => {
    setDeletingId(null);
    setEditingId(c.id);
    setEditBody(c.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBody("");
  };

  const handleSaveEdit = async (c: Comment) => {
    const next = editBody.trim();
    if (!next || next === c.body) {
      cancelEdit();
      return;
    }
    await updateComment.mutateAsync({ id: c.id, body: next });
    cancelEdit();
  };

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Comments</h3>

      {comments && comments.length > 0 ? (
        <div className="space-y-3 mb-4">
          {comments.map((c) => {
            const author = people.find((p) => p.id === c.author_id);
            return (
              <div key={c.id} id={`comment-${c.id}`} className="bg-gray-800 rounded-lg p-3">
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
                        <Avatar
                          person={author ?? { name: "?", avatar_color: "#6366f1", avatar_data: null }}
                          className="h-5 w-5 text-[10px]"
                        />
                        <span className="text-xs font-medium text-gray-300">{author?.name ?? "Unknown"}</span>
                        <span className="text-[11px] text-gray-500">{formatDateTime(c.created_at)}</span>
                        {c.updated_at && (
                          <span
                            className="text-[11px] text-gray-600"
                            title={`Edited ${formatDateTime(c.updated_at)}`}
                          >
                            (edited)
                          </span>
                        )}
                      </div>
                      {editingId !== c.id && (
                        <div className="flex items-center shrink-0">
                          <button
                            type="button"
                            onClick={() => startEdit(c)}
                            aria-label="Edit comment"
                            className="p-1 rounded text-gray-600 hover:text-blue-400 hover:bg-gray-700 transition-colors"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            aria-label="Delete comment"
                            className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-gray-700 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    {editingId === c.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          aria-label="Edit comment body"
                          rows={3}
                          className="bg-gray-900 border-gray-700 text-gray-100 text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(c)}
                            disabled={!editBody.trim() || updateComment.isPending}
                            className="h-6 px-2 text-xs bg-blue-600 hover:bg-blue-500 text-white"
                          >
                            {updateComment.isPending ? "…" : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                            className="h-6 px-2 text-xs bg-transparent border-gray-700 text-gray-300 hover:bg-gray-700"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-200 whitespace-pre-wrap">{c.body}</p>
                    )}
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

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function inferMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function AttachmentsSection({ taskId }: { taskId: number }) {
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
      // The backend reads the file bytes and derives the size; we just pass the
      // picked path plus a best-effort mime type from the extension.
      await createAttachment.mutateAsync({
        task_id: taskId,
        filename,
        filepath,
        mime_type: inferMimeType(filename),
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
                      onClick={() => openAttachment(a.id).catch(console.error)}
                      className="text-sm text-gray-200 truncate hover:text-blue-400 transition-colors text-left w-full"
                    >
                      {a.filename}
                    </button>
                    <p className="text-[11px] text-gray-500">
                      {formatSize(a.size)} · {formatDateTime(a.uploaded_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAttachment(a.id).catch(console.error)}
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

export function TaskDetailPanel() {
  const selectedTaskId = useUiStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId);

  const isOpen = selectedTaskId != null;

  const { data: task, isLoading } = useTask(selectedTaskId);
  const { data: people } = usePeople();
  const { data: project } = useProject(task?.project_id);
  const draftState = useTaskDraft(task);
  const { draft, setDraft, save, handleSelectChange } = draftState;

  const taskKey = project && task ? `${project.key}-${task.task_number}` : task ? `#${task.id}` : "";
  const typeBadge = task ? TYPE_BADGE[task.type] : null;
  const peopleSafe = people ?? [];

  // Cancel is reversible (reopen via the Status picker), so no confirmation and
  // the panel stays open. Only this issue is canceled, never its children.
  const handleCancel = () => handleSelectChange("status", "canceled", "canceled");

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
          {task && task.status !== "canceled" && task.status !== "done" && (
            <button
              type="button"
              onClick={handleCancel}
              className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
              aria-label="Cancel task"
            >
              <Ban className="h-4 w-4" />
            </button>
          )}
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

              <TaskFields task={task} state={draftState} />

              {/* Description */}
              <div>
                <Label className="text-gray-500 text-[11px]">Description</Label>
                <MarkdownDescription
                  value={draft.description}
                  onChange={(description) => setDraft((d) => ({ ...d, description }))}
                  onCommit={() => {
                    if (draft.description !== task.description) save({ description: draft.description });
                  }}
                />
              </div>

              {/* Divider */}
              <div className="border-t border-gray-800" />

              {/* Sub-sections */}
              <CommentsSection taskId={task.id} people={peopleSafe} />
              <div className="border-t border-gray-800" />
              <AttachmentsSection taskId={task.id} />
              {task.type === "subtask" && (
                <>
                  <div className="border-t border-gray-800" />
                  <TimeLogsSection taskId={task.id} people={peopleSafe} />
                </>
              )}

              {/* Bottom padding */}
              <div className="h-4" />
            </>
          )}
        </div>
      </div>
    </>
  );
}
