import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  reorderProjects,
  updateProject,
  type ProjectCreatePayload,
  type ProjectUpdatePayload,
} from "@/lib/commands";
import type { Project } from "@/types";

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: projectKeys.all }); },
    onError: (err) => toast.error(`Failed to create project: ${String(err)}`),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ProjectUpdatePayload }) =>
      updateProject(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: projectKeys.all }); },
    onError: (err) => toast.error(`Failed to update project: ${String(err)}`),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteProject(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: projectKeys.all }); },
    onError: (err) => toast.error(`Failed to delete project: ${String(err)}`),
  });
}

export function useReorderProjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: number[]) => reorderProjects(orderedIds),
    // Optimistically apply the new order so the sidebar doesn't flicker back.
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: projectKeys.list() });
      const previous = qc.getQueryData<Project[]>(projectKeys.list());
      if (previous) {
        const byId = new Map(previous.map((p) => [p.id, p]));
        const reordered = orderedIds
          .map((id) => byId.get(id))
          .filter((p): p is Project => p != null);
        qc.setQueryData<Project[]>(projectKeys.list(), reordered);
      }
      return { previous };
    },
    onError: (err, _ids, ctx) => {
      if (ctx?.previous) qc.setQueryData(projectKeys.list(), ctx.previous);
      toast.error(`Failed to reorder projects: ${String(err)}`);
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: projectKeys.all }); },
  });
}
