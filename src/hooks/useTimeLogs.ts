import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTimeLog,
  deleteTimeLog,
  listTimeLogs,
  type TimeLogCreatePayload,
} from "@/lib/commands";

export const timeLogKeys = {
  all: ["time_logs"] as const,
  list: (taskId: number) => [...timeLogKeys.all, "list", taskId] as const,
};

export function useTimeLogs(taskId: number | null | undefined) {
  return useQuery({
    queryKey: timeLogKeys.list(taskId ?? -1),
    queryFn: () => listTimeLogs(taskId as number),
    enabled: taskId != null,
  });
}

export function useCreateTimeLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TimeLogCreatePayload) => createTimeLog(payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: timeLogKeys.list(vars.task_id) });
    },
  });
}

export function useDeleteTimeLog(taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTimeLog(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: timeLogKeys.list(taskId) });
    },
  });
}
