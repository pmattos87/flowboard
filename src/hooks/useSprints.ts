import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  completeSprint,
  createSprint,
  deleteSprint,
  getSprint,
  listSprints,
  updateSprint,
  type SprintCreatePayload,
  type SprintUpdatePayload,
} from "@/lib/commands";
import type { CompleteSprintTarget, Sprint } from "@/types";
import { taskKeys } from "./useTasks";

export const sprintKeys = {
  all: ["sprints"] as const,
  list: (projectId?: number) => [...sprintKeys.all, "list", { projectId: projectId ?? null }] as const,
  detail: (id: number) => [...sprintKeys.all, "detail", id] as const,
};

export function useSprints(projectId?: number) {
  return useQuery({
    queryKey: sprintKeys.list(projectId),
    queryFn: () => listSprints(projectId),
  });
}

export function useSprint(id: number | null | undefined) {
  return useQuery({
    queryKey: sprintKeys.detail(id ?? -1),
    queryFn: () => getSprint(id as number),
    enabled: id != null,
  });
}

export function useCreateSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SprintCreatePayload) => createSprint(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: sprintKeys.all }); },
    onError: (err) => toast.error(`Failed to create sprint: ${String(err)}`),
  });
}

export function useUpdateSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SprintUpdatePayload }) =>
      updateSprint(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: sprintKeys.all }); },
    onError: (err) => toast.error(`Failed to update sprint: ${String(err)}`),
  });
}

export function useDeleteSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteSprint(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: sprintKeys.all }); },
    onError: (err) => toast.error(`Failed to delete sprint: ${String(err)}`),
  });
}

/** Complete a sprint, carrying its unfinished issues to `target`. Issues move, so tasks are
 *  invalidated along with sprints. No toast on error: the dialog shows the refusal text,
 *  which reaches the caller as the mutation's error. */
export function useCompleteSprint() {
  const qc = useQueryClient();
  return useMutation<Sprint, string, { sprintId: number; target: CompleteSprintTarget }>({
    mutationFn: ({ sprintId, target }) => completeSprint(sprintId, target),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sprintKeys.all });
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
