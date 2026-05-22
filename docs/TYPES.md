**Canonical Type Definitions** (mirrors SQLite schema)

## Core Enums

```ts
// src/types/index.ts
export type TaskType     = 'story' | 'bug' | 'task' | 'epic';
export type TaskStatus   = 'todo' | 'in_progress' | 'in_review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type SprintStatus = 'backlog' | 'active' | 'completed';

export interface Project  { id: number; name: string; key: string; description: string; color: string; created_at: string; }
export interface Person   { id: number; name: string; email: string; avatar_color: string; role: string; }
export interface Sprint   { id: number; project_id: number; name: string; goal: string; start_date: string; end_date: string; status: SprintStatus; }
export interface Task     { id: number; project_id: number; sprint_id: number | null; parent_id: number | null; title: string; description: string; type: TaskType; status: TaskStatus; priority: TaskPriority; assignee_id: number | null; story_points: number; due_date: string | null; created_at: string; updated_at: string; labels: string; }
export interface Comment  { id: number; task_id: number; author_id: number; body: string; created_at: string; }
export interface TimeLog  { id: number; task_id: number; person_id: number; minutes: number; logged_at: string; note: string; }
export interface Attachment { id: number; task_id: number; filename: string; filepath: string; size: number; uploaded_at: string; }
export interface ActivityLog { id: number; task_id: number; person_id: number; action: string; old_value: string; new_value: string; created_at: string; }
```