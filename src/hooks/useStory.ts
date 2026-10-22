import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStory, getStoryTrail, listActiveRuns, restartRun } from "@/lib/commands";
import { taskKeys } from "@/hooks/useTasks";

// Under the tasks prefix, so every task mutation (a Subtask drag, a Details
// edit) refreshes the Story view and its trail too.
export const storyKeys = {
  detail: (key: string) => [...taskKeys.all, "story", key] as const,
  trail: (key: string) => [...taskKeys.all, "story", key, "trail"] as const,
  active: () => [...taskKeys.all, "active_runs"] as const,
};

/** Stories exist only on Factory projects; pass `enabled = false` otherwise. */
export function useStory(key: string | undefined, enabled = true) {
  return useQuery({
    queryKey: storyKeys.detail(key ?? ""),
    queryFn: () => getStory(key as string),
    enabled: enabled && key != null,
  });
}

export function useStoryTrail(key: string | undefined, enabled = true) {
  return useQuery({
    queryKey: storyKeys.trail(key ?? ""),
    queryFn: () => getStoryTrail(key as string),
    enabled: enabled && key != null,
  });
}

export function useActiveRuns() {
  return useQuery({
    queryKey: storyKeys.active(),
    queryFn: listActiveRuns,
  });
}

export function useRestartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => restartRun(key),
    onSuccess: (story) => toast.success("Run restarted", { description: story.key }),
    onError: (err) => toast.error(`Failed to restart the Run: ${String(err)}`),
    onSettled: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}
