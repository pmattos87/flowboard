import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import type {
  ActivityLog,
  Attachment,
  Comment,
  Person,
  Project,
  Sprint,
  Task,
  TaskPriority,
  TaskStatus,
  TaskType,
  TimeLog,
} from "@/types";

// ─── Projects ──────────────────────────────────────────────

export interface ProjectCreatePayload {
  name: string;
  key: string;
  description?: string;
  color?: string;
}
export interface ProjectUpdatePayload {
  name?: string;
  key?: string;
  description?: string;
  color?: string;
}

export const createProject = (payload: ProjectCreatePayload) =>
  invoke<Project>("create_project", { payload });
export const listProjects = () => invoke<Project[]>("list_projects");
export const getProject = (id: number) => invoke<Project>("get_project", { id });
export const updateProject = (id: number, payload: ProjectUpdatePayload) =>
  invoke<Project>("update_project", { id, payload });
export const deleteProject = (id: number) => invoke<void>("delete_project", { id });

// ─── People ────────────────────────────────────────────────

export interface PersonCreatePayload {
  name: string;
  email: string;
  avatar_color?: string;
  role?: string;
}
export interface PersonUpdatePayload {
  name?: string;
  email?: string;
  avatar_color?: string;
  role?: string;
}

export const createPerson = (payload: PersonCreatePayload) =>
  invoke<Person>("create_person", { payload });
export const listPeople = () => invoke<Person[]>("list_people");
export const getPerson = (id: number) => invoke<Person>("get_person", { id });
export const updatePerson = (id: number, payload: PersonUpdatePayload) =>
  invoke<Person>("update_person", { id, payload });
export const deletePerson = (id: number) => invoke<void>("delete_person", { id });

// ─── Sprints ───────────────────────────────────────────────

export interface SprintCreatePayload {
  project_id: number;
  name: string;
  goal?: string;
  start_date: string;
  end_date: string;
  status?: string;
}
export interface SprintUpdatePayload {
  name?: string;
  goal?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
}

export const createSprint = (payload: SprintCreatePayload) =>
  invoke<Sprint>("create_sprint", { payload });
export const listSprints = (projectId?: number) =>
  invoke<Sprint[]>("list_sprints", { projectId: projectId ?? null });
export const getSprint = (id: number) => invoke<Sprint>("get_sprint", { id });
export const updateSprint = (id: number, payload: SprintUpdatePayload) =>
  invoke<Sprint>("update_sprint", { id, payload });
export const deleteSprint = (id: number) => invoke<void>("delete_sprint", { id });

// ─── Tasks ─────────────────────────────────────────────────

export interface TaskCreatePayload {
  project_id: number;
  sprint_id?: number | null;
  parent_id?: number | null;
  title: string;
  description?: string;
  type?: TaskType;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: number | null;
  story_points?: number;
  due_date?: string | null;
  labels?: string;
}

// Nullable fields use `T | null | undefined`:
//   undefined → field omitted, server keeps current value
//   null      → server sets the column to NULL
export interface TaskUpdatePayload {
  sprint_id?: number | null;
  parent_id?: number | null;
  title?: string;
  description?: string;
  type?: TaskType;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: number | null;
  story_points?: number;
  due_date?: string | null;
  labels?: string;
}

export interface TaskListFilters {
  project_id?: number;
  sprint_id?: number;
  status?: TaskStatus;
  assignee_id?: number;
  parent_id?: number;
}

export const createTask = (payload: TaskCreatePayload) =>
  invoke<Task>("create_task", { payload });
export const listTasks = (filters?: TaskListFilters) =>
  invoke<Task[]>("list_tasks", { filters: filters ?? null });
export const getTask = (id: number) => invoke<Task>("get_task", { id });
export const updateTask = (id: number, payload: TaskUpdatePayload) =>
  invoke<Task>("update_task", { id, payload });
export const deleteTask = (id: number) => invoke<void>("delete_task", { id });

// ─── Comments ──────────────────────────────────────────────

export interface CommentCreatePayload {
  task_id: number;
  author_id: number;
  body: string;
}

export const createComment = (payload: CommentCreatePayload) =>
  invoke<Comment>("create_comment", { payload });
export const listComments = (taskId: number) =>
  invoke<Comment[]>("list_comments", { taskId });
export const deleteComment = (id: number) => invoke<void>("delete_comment", { id });

// ─── Time Logs ─────────────────────────────────────────────

export interface TimeLogCreatePayload {
  task_id: number;
  person_id: number;
  minutes: number;
  logged_at?: string;
  note?: string;
}

export const createTimeLog = (payload: TimeLogCreatePayload) =>
  invoke<TimeLog>("create_time_log", { payload });
export const listTimeLogs = (taskId: number) =>
  invoke<TimeLog[]>("list_time_logs", { taskId });
export const deleteTimeLog = (id: number) => invoke<void>("delete_time_log", { id });

// ─── Attachments ───────────────────────────────────────────

export interface AttachmentCreatePayload {
  task_id: number;
  filename: string;
  filepath: string;
  size: number;
}

export const createAttachment = (payload: AttachmentCreatePayload) =>
  invoke<Attachment>("create_attachment", { payload });
export const listAttachments = (taskId: number) =>
  invoke<Attachment[]>("list_attachments", { taskId });
export const deleteAttachment = (id: number) =>
  invoke<void>("delete_attachment", { id });

// ─── File Opener ───────────────────────────────────────────

export const openAttachment = (filepath: string) => openPath(filepath);

// ─── Activity Log ──────────────────────────────────────────

export interface ActivityLogCreatePayload {
  task_id: number;
  person_id: number;
  action: string;
  old_value?: string;
  new_value?: string;
}

export const createActivityLog = (payload: ActivityLogCreatePayload) =>
  invoke<ActivityLog>("create_activity_log", { payload });
export const listActivityLog = (taskId: number) =>
  invoke<ActivityLog[]>("list_activity_log", { taskId });
export const listActivityLogBySprint = (sprintId: number) =>
  invoke<ActivityLog[]>("list_activity_log_by_sprint", { sprintId });
export const listAllActivityLog = () =>
  invoke<ActivityLog[]>("list_all_activity_log");

// ─── Dev / Staging ─────────────────────────────────────────

/** Returns true when running a debug (tauri dev) build. */
export const isStagingBuild = () => invoke<boolean>("is_staging_build");

/**
 * Populate the database with demo data.
 * Pass `force = true` to wipe existing data and re-seed from scratch.
 */
export const seedDemoData = (force: boolean) =>
  invoke<string>("seed_demo_data", { force });
