import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateTask,
  type TaskCreatePayload,
  type TaskListFilters,
  type TaskUpdatePayload,
} from "@/lib/commands";

export const taskKeys = {
  all: ["tasks"] as const,
  list: (filters?: TaskListFilters) => [...taskKeys.all, "list", filters ?? {}] as const,
  detail: (id: number) => [...taskKeys.all, "detail", id] as const,
};

export function useTasks(filters?: TaskListFilters) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => listTasks(filters),
  });
}

export function useTask(id: number | null | undefined) {
  return useQuery({
    queryKey: taskKeys.detail(id ?? -1),
    queryFn: () => getTask(id as number),
    enabled: id != null,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TaskCreatePayload) => createTask(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TaskUpdatePayload }) =>
      updateTask(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
