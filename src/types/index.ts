export type TaskType = "story" | "bug" | "task" | "epic";
export type TaskStatus =
  | "todo"
  | "in_progress"
  | "in_review"
  | "refining"
  | "ready_for_development"
  | "canceled"
  | "done"
  // Software Factory Story ladder (SF-2); only on projects with ladder = "factory".
  | "backlog"
  | "ready"
  | "building"
  | "integrated_tests"
  | "tested"
  | "user_testing";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type SprintStatus = "backlog" | "active" | "completed";

export interface Project {
  id: number;
  name: string;
  key: string;
  description: string;
  color: string;
  created_at: string;
  /** Optional project logo as a base64 data URL. null = use the colored square. */
  logo_data: string | null;
  /** Manual sort order for the sidebar (ascending). */
  position: number;
  /** Software Factory status ladder. */
  ladder: "legacy" | "factory";
  /** Software Factory project kind. */
  kind: "internal" | "client";
}

export interface Person {
  id: number;
  name: string;
  email: string;
  avatar_color: string;
  role: string;
  /** Optional profile photo as a base64 data URL. null = use colored initials. */
  avatar_data: string | null;
  /** Software Factory role: who is "Pedro" (owner) and who is the Agent. */
  factory_role: "owner" | "agent" | null;
}

export interface Sprint {
  id: number;
  project_id: number;
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
  status: SprintStatus;
}

export interface Task {
  id: number;
  project_id: number;
  task_number: number;
  sprint_id: number | null;
  parent_id: number | null;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: number | null;
  story_points: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  labels: string;
  // Software Factory fields (SF-2), written only by flowboard-cli.
  feature_branch: string | null;
  review_verdict: "passed" | "failed" | null;
  reviewed_commit: string | null;
  findings_url: string | null;
  run_stopped: boolean;
  risk: boolean;
  release_id: number | null;
}

export interface Comment {
  id: number;
  task_id: number;
  author_id: number;
  body: string;
  created_at: string;
  /** FB-46: null until the comment is first edited. */
  updated_at: string | null;
}

export interface TimeLog {
  id: number;
  task_id: number;
  person_id: number;
  minutes: number;
  logged_at: string;
  note: string;
}

export interface Attachment {
  id: number;
  task_id: number;
  filename: string;
  filepath: string;
  size: number;
  mime_type: string;
  uploaded_at: string;
}

export interface ActivityLog {
  id: number;
  task_id: number;
  person_id: number;
  action: string;
  old_value: string;
  new_value: string;
  created_at: string;
}
