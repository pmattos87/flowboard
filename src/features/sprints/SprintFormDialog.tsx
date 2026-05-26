import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateSprint, useUpdateSprint } from "@/hooks/useSprints";
import type { Sprint, SprintStatus } from "@/types";

type SprintForm = {
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
  status: SprintStatus;
};

const emptyForm = (): SprintForm => ({
  name: "",
  goal: "",
  start_date: "",
  end_date: "",
  status: "backlog",
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number | null;
  editing: Sprint | null;
}

export function SprintFormDialog({ open, onOpenChange, projectId, editing }: Props) {
  const createSprint = useCreateSprint();
  const updateSprint = useUpdateSprint();
  const [form, setForm] = useState<SprintForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        goal: editing.goal ?? "",
        start_date: editing.start_date,
        end_date: editing.end_date,
        status: editing.status as SprintStatus,
      });
    } else {
      setForm(emptyForm());
    }
    setError(null);
  }, [open, editing]);

  const isPending = createSprint.isPending || updateSprint.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = form.name.trim();
    if (!name || !form.start_date || !form.end_date) return;
    try {
      if (editing) {
        await updateSprint.mutateAsync({
          id: editing.id,
          payload: {
            name,
            goal: form.goal.trim(),
            start_date: form.start_date,
            end_date: form.end_date,
            status: form.status,
          },
        });
      } else {
        if (projectId == null) return;
        await createSprint.mutateAsync({
          project_id: projectId,
          name,
          goal: form.goal.trim(),
          start_date: form.start_date,
          end_date: form.end_date,
          status: form.status,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit sprint" : "Create sprint"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="sprint-name" className="text-gray-300">Name</Label>
            <Input
              id="sprint-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Sprint 1"
              className="bg-gray-800 border-gray-700 text-gray-100"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sprint-goal" className="text-gray-300">
              Goal{" "}
              <span className="text-gray-500 font-normal">(optional)</span>
            </Label>
            <Textarea
              id="sprint-goal"
              value={form.goal}
              onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
              placeholder="What will you achieve this sprint?"
              rows={2}
              className="bg-gray-800 border-gray-700 text-gray-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sprint-start" className="text-gray-300">Start date</Label>
              <Input
                id="sprint-start"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className="bg-gray-800 border-gray-700 text-gray-100"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sprint-end" className="text-gray-300">End date</Label>
              <Input
                id="sprint-end"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                className="bg-gray-800 border-gray-700 text-gray-100"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sprint-status" className="text-gray-300">Status</Label>
            <select
              id="sprint-status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as SprintStatus }))}
              className="w-full rounded-md bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="backlog">Backlog</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          {error && (
            <p className="text-sm text-red-400" role="alert">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!form.name.trim() || !form.start_date || !form.end_date || isPending}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {isPending ? "Saving…" : editing ? "Save changes" : "Create sprint"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
