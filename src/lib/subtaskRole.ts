import type { Task } from "@/types";

/** How a Subtask is shown: from the plan, the Run's Simplify step, or a bug (FB-171). Display only, not a `TaskType`. */
export type SubtaskRole = "subtask" | "simplify" | "bug";

/** The one place the Simplify rule lives: a `subtask` titled exactly `Simplify`, or whose description starts with `agent: simplify` (how `factory:run` files it). */
export function subtaskRole(task: Pick<Task, "type" | "title" | "description">): SubtaskRole {
  if (task.type === "bug") return "bug";
  if (
    task.type === "subtask" &&
    (task.title === "Simplify" || task.description.trimStart().startsWith("agent: simplify"))
  ) {
    return "simplify";
  }
  return "subtask";
}
