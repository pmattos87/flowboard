import {
  Ban,
  BookOpen,
  Bug,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Layers,
  Minus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TaskPriority, TaskStatus, TaskType } from "@/types";

export type BoardColumn = { status: TaskStatus; label: string; dotClass: string; Icon?: LucideIcon };

// `Icon`, when present, replaces the colored status dot in column headers.
export const COLUMNS: BoardColumn[] = [
  { status: "todo",        label: "TO DO",       dotClass: "bg-gray-400" },
  { status: "in_progress", label: "IN PROGRESS",  dotClass: "bg-blue-500" },
  { status: "in_review",   label: "IN REVIEW",    dotClass: "bg-yellow-400" },
  { status: "canceled",    label: "CANCELED",     dotClass: "bg-gray-500", Icon: Ban },
  { status: "done",        label: "DONE",         dotClass: "bg-emerald-500" },
];

// Discovery board uses a distinct discovery/refinement lifecycle (FB-85). Only
// "Ready for Development" stories can then be scheduled into a sprint.
// FB-91: the `todo` column is labelled BACKLOG here — the status value itself is
// unchanged, this is display only. Pipeline reads
// BACKLOG -> REFINING -> READY FOR DEVELOPMENT -> sprint.
export const DISCOVERY_COLUMNS: BoardColumn[] = [
  { status: "todo",                  label: "BACKLOG",               dotClass: "bg-gray-400" },
  { status: "refining",              label: "REFINING",              dotClass: "bg-blue-400" },
  { status: "canceled",              label: "CANCELED",              dotClass: "bg-gray-500", Icon: Ban },
  { status: "ready_for_development", label: "READY FOR DEVELOPMENT", dotClass: "bg-emerald-500" },
];

// Status <option>s for the detail-panel / create-modal pickers. The discovery
// statuses "refining" and "ready_for_development" belong to the story lifecycle
// (FB-85), so they are offered only for stories & epics — tasks & bugs keep the
// plain dev workflow.
const DEV_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo",        label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review",   label: "In Review" },
  { value: "canceled",    label: "Canceled" },
  { value: "done",        label: "Done" },
];

const STORY_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo",                  label: "To Do" },
  { value: "refining",              label: "Refining" },
  { value: "ready_for_development", label: "Ready for Development" },
  { value: "in_progress",           label: "In Progress" },
  { value: "in_review",             label: "In Review" },
  { value: "canceled",              label: "Canceled" },
  { value: "done",                  label: "Done" },
];

export function statusOptionsForType(type: TaskType): { value: TaskStatus; label: string }[] {
  return type === "story" || type === "epic" ? STORY_STATUS_OPTIONS : DEV_STATUS_OPTIONS;
}

export const TYPE_META: Record<TaskType, { Icon: LucideIcon; colorClass: string }> = {
  story: { Icon: BookOpen,    colorClass: "text-emerald-400" },
  bug:   { Icon: Bug,         colorClass: "text-red-400" },
  task:  { Icon: CheckSquare, colorClass: "text-blue-400" },
  epic:  { Icon: Layers,      colorClass: "text-purple-400" },
};

export const PRIORITY_META: Record<TaskPriority, { Icon: LucideIcon; colorClass: string }> = {
  critical: { Icon: ChevronsUp,  colorClass: "text-red-500" },
  high:     { Icon: ChevronUp,   colorClass: "text-orange-400" },
  medium:   { Icon: Minus,       colorClass: "text-yellow-400" },
  low:      { Icon: ChevronDown, colorClass: "text-gray-400" },
};

// Higher rank = higher priority. Used to order board cards top-to-bottom.
const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

// Sort a copy of the tasks by priority, highest first. Array.prototype.sort is
// stable, so tasks of equal priority keep their incoming order.
export function sortByPriority<T extends { priority: TaskPriority }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
}
