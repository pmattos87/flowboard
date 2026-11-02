import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  reorderProjects,
  setProjectState,
  updateProject,
  type ProjectCreatePayload,
  type ProjectUpdatePayload,
} from "@/lib/commands";
import { storyKeys } from "@/hooks/useStory";
import type { Project, ProjectState } from "@/types";

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
        // orderedIds may be one sidebar group: reorder those ids among the slots they
        // already hold and leave every other project where it is.
        const byId = new Map(previous.map((p) => [p.id, p]));
        const inOrder = orderedIds
          .map((id) => byId.get(id))
          .filter((p): p is Project => p != null);
        const moved = new Set(inOrder.map((p) => p.id));
        let slot = 0;
        const reordered = previous.map((p) => (moved.has(p.id) ? inOrder[slot++] : p));
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

/** Archive or unarchive a project (FB-14). A refusal (open sprint, unreleased Release)
 *  leaves the cache alone and toasts the backend's message. */
export function useSetProjectState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, state }: { id: number; state: ProjectState }) => setProjectState(id, state),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.all });
      // Active Runs leaves archived projects out.
      qc.invalidateQueries({ queryKey: storyKeys.active() });
    },
    onError: (err, { state }) =>
      toast.error(`Failed to ${state === "archived" ? "archive" : "unarchive"} project: ${String(err)}`),
  });
}
