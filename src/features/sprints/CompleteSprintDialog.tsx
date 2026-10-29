import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCompleteSprint } from "@/hooks/useSprints";
import {
  backlogBlockReason,
  isUnfinished,
  nextSprint,
  openSubtasksUnderDoneStories,
} from "@/lib/sprintCompletion";
import { cn } from "@/lib/utils";
import type { CompleteSprintTarget, Project, Sprint, Task } from "@/types";

/** The destination radio's value: a sprint id, Backlog, or a new sprint. */
type Choice = number | "backlog" | "new";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprint: Sprint;
  /** All of the project's sprints. */
  sprints: ReadonlyArray<Sprint>;
  /** All of the project's tasks: open children can sit in another sprint. */
  tasks: ReadonlyArray<Task>;
  project: Pick<Project, "key" | "ladder">;
}

const optionClass = (disabled: boolean) =>
  cn(
    "flex items-start gap-2 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm",
    disabled ? "opacity-60" : "cursor-pointer hover:border-gray-600",
  );

export function CompleteSprintDialog({ open, onOpenChange, sprint, sprints, tasks, project }: Props) {
  const completeSprint = useCompleteSprint();

  const openSprints = useMemo(
    () =>
      sprints
        .filter((s) => s.id !== sprint.id && s.project_id === sprint.project_id && s.status !== "completed")
        .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id - b.id),
    [sprints, sprint],
  );
  // Mounted per opening (the board renders it only while a sprint is being completed),
  // so the initial state is the reset state.
  const [choice, setChoice] = useState<Choice>(() => nextSprint(sprints, sprint)?.id ?? "new");
  const [newSprint, setNewSprint] = useState({ name: "", startDate: "", endDate: "" });
  const [error, setError] = useState<string | null>(null);

  const unfinished = tasks.filter((t) => t.sprint_id === sprint.id && isUnfinished(t.status)).length;
  const backlogReason = backlogBlockReason(project, tasks, sprint.id);
  const blockers = openSubtasksUnderDoneStories(project.key, tasks, sprint.id);

  const dateError =
    choice === "new" && newSprint.startDate && newSprint.endDate && newSprint.endDate < newSprint.startDate
      ? "End date must be on or after start date."
      : null;
  const newIncomplete =
    choice === "new" && (!newSprint.name.trim() || !newSprint.startDate || !newSprint.endDate);
  const canConfirm =
    blockers.length === 0 &&
    !newIncomplete &&
    !dateError &&
    !(choice === "backlog" && backlogReason) &&
    !completeSprint.isPending;

  const target = (): CompleteSprintTarget =>
    choice === "backlog"
      ? { kind: "backlog" }
      : choice === "new"
        ? {
            kind: "new",
            name: newSprint.name.trim(),
            startDate: newSprint.startDate,
            endDate: newSprint.endDate,
          }
        : { kind: "sprint", sprintId: choice };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canConfirm) return;
    setError(null);
    try {
      await completeSprint.mutateAsync({ sprintId: sprint.id, target: target() });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete {sprint.name}</DialogTitle>
          <DialogDescription className="text-gray-400">
            {unfinished === 0
              ? "Every issue in this sprint is done or canceled."
              : `${unfinished} unfinished ${unfinished === 1 ? "issue" : "issues"} will move to the destination below. Done and canceled issues stay in this sprint.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium text-gray-300">Move unfinished issues to</legend>
            {openSprints.map((s) => (
              <label key={s.id} className={optionClass(false)}>
                <input
                  type="radio"
                  name="complete-sprint-target"
                  className="mt-0.5 accent-blue-500"
                  checked={choice === s.id}
                  onChange={() => setChoice(s.id)}
                />
                <span className="text-gray-100">{s.name}</span>
              </label>
            ))}
            {openSprints.length === 0 && (
              <label className={optionClass(false)}>
                <input
                  type="radio"
                  name="complete-sprint-target"
                  className="mt-0.5 accent-blue-500"
                  checked={choice === "new"}
                  onChange={() => setChoice("new")}
                />
                <span className="text-gray-100">A new sprint</span>
              </label>
            )}
            <label className={optionClass(backlogReason !== null)}>
              <input
                type="radio"
                name="complete-sprint-target"
                className="mt-0.5 accent-blue-500"
                checked={choice === "backlog"}
                disabled={backlogReason !== null}
                aria-describedby={backlogReason ? "complete-sprint-backlog-reason" : undefined}
                onChange={() => setChoice("backlog")}
              />
              <span className="flex flex-col">
                <span className="text-gray-100">Backlog</span>
                {backlogReason ? (
                  <span id="complete-sprint-backlog-reason" className="text-xs text-amber-400">
                    Not available: {backlogReason}.
                  </span>
                ) : (
                  project.ladder !== "factory" && (
                    <span className="text-xs text-gray-500">Stories return to Ready for Development.</span>
                  )
                )}
              </span>
            </label>
          </fieldset>

          {choice === "new" && (
            <div className="space-y-3 rounded-md border border-gray-800 bg-gray-950 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-sprint-name" className="text-gray-300">Name</Label>
                <Input
                  id="new-sprint-name"
                  value={newSprint.name}
                  onChange={(e) => setNewSprint((f) => ({ ...f, name: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-gray-100"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-sprint-start" className="text-gray-300">Start date</Label>
                  <Input
                    id="new-sprint-start"
                    type="date"
                    value={newSprint.startDate}
                    onChange={(e) => setNewSprint((f) => ({ ...f, startDate: e.target.value }))}
                    className="bg-gray-800 border-gray-700 text-gray-100"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-sprint-end" className="text-gray-300">End date</Label>
                  <Input
                    id="new-sprint-end"
                    type="date"
                    min={newSprint.startDate || undefined}
                    value={newSprint.endDate}
                    onChange={(e) => setNewSprint((f) => ({ ...f, endDate: e.target.value }))}
                    className="bg-gray-800 border-gray-700 text-gray-100"
                    required
                  />
                </div>
              </div>
              {dateError && <p className="text-sm text-red-400" role="alert">{dateError}</p>}
            </div>
          )}

          {blockers.length > 0 && (
            <div className="rounded-md border border-amber-700/60 bg-gray-800 p-3 text-sm" role="alert">
              <p className="text-amber-300">
                These done Stories still have open Subtasks. Close or cancel them first.
              </p>
              <ul className="mt-2 space-y-1 text-gray-300">
                {blockers.map((b) => (
                  <li key={b.story}>
                    <span className="font-medium text-white">{b.story}</span>: {b.subtasks.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="text-sm text-red-400" role="alert">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canConfirm} className="bg-blue-600 hover:bg-blue-500 text-white">
              {completeSprint.isPending ? "Completing…" : "Complete sprint"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
