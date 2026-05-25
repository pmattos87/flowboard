import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAttachment,
  deleteAttachment,
  listAttachments,
  type AttachmentCreatePayload,
} from "@/lib/commands";

export const attachmentKeys = {
  all: ["attachments"] as const,
  list: (taskId: number) => [...attachmentKeys.all, "list", taskId] as const,
};

export function useAttachments(taskId: number | null | undefined) {
  return useQuery({
    queryKey: attachmentKeys.list(taskId ?? -1),
    queryFn: () => listAttachments(taskId as number),
    enabled: taskId != null,
  });
}

export function useCreateAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AttachmentCreatePayload) => createAttachment(payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: attachmentKeys.list(vars.task_id) });
    },
  });
}

export function useDeleteAttachment(taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAttachment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attachmentKeys.list(taskId) });
    },
  });
}
