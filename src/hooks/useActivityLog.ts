import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createActivityLog,
  listActivityLog,
  type ActivityLogCreatePayload,
} from "@/lib/commands";

export const activityLogKeys = {
  all: ["activity_log"] as const,
  list: (taskId: number) => [...activityLogKeys.all, "list", taskId] as const,
};

export function useActivityLog(taskId: number | null | undefined) {
  return useQuery({
    queryKey: activityLogKeys.list(taskId ?? -1),
    queryFn: () => listActivityLog(taskId as number),
    enabled: taskId != null,
  });
}

export function useCreateActivityLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ActivityLogCreatePayload) => createActivityLog(payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: activityLogKeys.list(vars.task_id) });
    },
  });
}
