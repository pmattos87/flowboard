import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createActivityLog,
  listActivityLog,
  listActivityLogBySprint,
  listAllActivityLog,
  type ActivityLogCreatePayload,
} from "@/lib/commands";

export const activityLogKeys = {
  all: ["activity_log"] as const,
  list: (taskId: number) => [...activityLogKeys.all, "list", taskId] as const,
  sprint: (sprintId: number) =>
    [...activityLogKeys.all, "sprint", sprintId] as const,
  inbox: () => [...activityLogKeys.all, "inbox"] as const,
};

export function useActivityLog(taskId: number | null | undefined) {
  return useQuery({
    queryKey: activityLogKeys.list(taskId ?? -1),
    queryFn: () => listActivityLog(taskId as number),
    enabled: taskId != null,
  });
}

export function useSprintActivityLog(sprintId: number | null | undefined) {
  return useQuery({
    queryKey: activityLogKeys.sprint(sprintId ?? -1),
    queryFn: () => listActivityLogBySprint(sprintId as number),
    enabled: sprintId != null,
  });
}

export function useAllActivityLog() {
  return useQuery({
    queryKey: activityLogKeys.inbox(),
    queryFn: listAllActivityLog,
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
