**Canonical Type Definitions** (mirrors SQLite schema)

## Core Enums

```ts
// src/types/index.ts
export type TaskType     = 'story' | 'bug' | 'subtask' | 'epic';
// On a Factory project a row is a Story when parent_id is null and type is 'story' or 'bug'
// (a bug Story is a fix); a bug with a parent is a bug Subtask. On a legacy project only
// 'story' is a Story. Use isStoryLevel(task, project.ladder) from src/lib/storyLevel.ts, never
// a bare type === 'story' check (FB-52).
// Factory command types (ReleaseDetail.stories[], StoryView) carry `type: TaskType` so a
// Story reads as feature or fix.
export type TaskStatus   = 'todo' | 'in_progress' | 'in_review' | 'canceled' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type SprintStatus = 'backlog' | 'active' | 'completed';

export interface Project  { id: number; name: string; key: string; description: string; color: string; created_at: string; }
export interface Person   { id: number; name: string; email: string; avatar_color: string; role: string; }
export interface Sprint   { id: number; project_id: number; name: string; goal: string; start_date: string; end_date: string; status: SprintStatus; }
// complete_sprint target (FB-97); exactly one of:
export type CompleteSprintTarget = { kind: 'sprint'; sprintId: number } | { kind: 'backlog' } | { kind: 'new'; name: string; startDate: string; endDate: string };
export interface Task     { id: number; project_id: number; sprint_id: number | null; parent_id: number | null; title: string; description: string; type: TaskType; status: TaskStatus; priority: TaskPriority; assignee_id: number | null; story_points: number; due_date: string | null; created_at: string; updated_at: string; labels: string; epic_id: number | null; }
export interface Comment  { id: number; task_id: number; author_id: number; body: string; created_at: string; updated_at: string | null; }
export interface TimeLog  { id: number; task_id: number; person_id: number; minutes: number; logged_at: string; note: string; }
export interface Attachment { id: number; task_id: number; filename: string; filepath: string; size: number; uploaded_at: string; }
export interface ActivityLog { id: number; task_id: number; person_id: number; action: string; old_value: string; new_value: string; created_at: string; }

/** `get_backup_status` (FB-95). */
export interface BackupStatus { backup_dir: string | null; last_backup_at: string | null; last_error: string | null; enabled: boolean; }
```