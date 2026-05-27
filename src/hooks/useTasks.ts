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
import { toast } from "sonner";
import { notify } from "@/lib/notifications";

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
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
      void notify("Task Created", task.title);
    },
    onError: (err) => toast.error(`Failed to create task: ${String(err)}`),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TaskUpdatePayload }) =>
      updateTask(id, payload),
    onSuccess: (task, { payload }) => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
      if (payload.status != null) {
        void notify("Task Updated", `"${task.title}" → ${payload.status.replace("_", " ")}`);
      }
    },
    onError: (err) => toast.error(`Failed to update task: ${String(err)}`),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTask(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: taskKeys.all }); },
    onError: (err) => toast.error(`Failed to delete task: ${String(err)}`),
  });
}
