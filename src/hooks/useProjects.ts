import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
  type ProjectCreatePayload,
  type ProjectUpdatePayload,
} from "@/lib/commands";

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
  detail: (id: number) => [...projectKeys.all, "detail", id] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.list(),
    queryFn: listProjects,
  });
}

export function useProject(id: number | null | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(id ?? -1),
    queryFn: () => getProject(id as number),
    enabled: id != null,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectCreatePayload) => createProject(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ProjectUpdatePayload }) =>
      updateProject(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteProject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
