import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSprint,
  deleteSprint,
  getSprint,
  listSprints,
  updateSprint,
  type SprintCreatePayload,
  type SprintUpdatePayload,
} from "@/lib/commands";

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sprintKeys.all });
    },
  });
}

export function useUpdateSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SprintUpdatePayload }) =>
      updateSprint(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sprintKeys.all });
    },
  });
}

export function useDeleteSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteSprint(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sprintKeys.all });
    },
  });
}
