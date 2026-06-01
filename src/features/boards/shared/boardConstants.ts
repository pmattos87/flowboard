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

// `Icon`, when present, replaces the colored status dot in column headers.
export const COLUMNS: { status: TaskStatus; label: string; dotClass: string; Icon?: LucideIcon }[] = [
  { status: "todo",        label: "TO DO",       dotClass: "bg-gray-400" },
  { status: "in_progress", label: "IN PROGRESS",  dotClass: "bg-blue-500" },
  { status: "in_review",   label: "IN REVIEW",    dotClass: "bg-yellow-400" },
  { status: "canceled",    label: "CANCELED",     dotClass: "bg-gray-500", Icon: Ban },
  { status: "done",        label: "DONE",         dotClass: "bg-emerald-500" },
];

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
