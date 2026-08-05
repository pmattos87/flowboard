import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createComment,
  deleteComment,
  listComments,
  updateComment,
  type CommentCreatePayload,
} from "@/lib/commands";
import { toast } from "sonner";

export const commentKeys = {
  all: ["comments"] as const,
  list: (taskId: number) => [...commentKeys.all, "list", taskId] as const,
};

export function useComments(taskId: number | null | undefined) {
  return useQuery({
    queryKey: commentKeys.list(taskId ?? -1),
    queryFn: () => listComments(taskId as number),
    enabled: taskId != null,
  });
}

export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CommentCreatePayload) => createComment(payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: commentKeys.list(vars.task_id) });
      toast.success("Comment added");
    },
    onError: (err) => toast.error(`Failed to post comment: ${String(err)}`),
  });
}

export function useUpdateComment(taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => updateComment(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentKeys.list(taskId) });
    },
    onError: (err) => toast.error(`Failed to edit comment: ${String(err)}`),
  });
}

export function useDeleteComment(taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteComment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentKeys.list(taskId) });
    },
  });
}
