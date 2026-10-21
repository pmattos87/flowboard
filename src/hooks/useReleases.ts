import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createRelease,
  getRelease,
  listReleases,
  pickReleaseStory,
  removeReleaseStory,
} from "@/lib/commands";
import { taskKeys } from "@/hooks/useTasks";

export const releaseKeys = {
  all: ["releases"] as const,
  list: (projectKey: string) => [...releaseKeys.all, "list", projectKey] as const,
  detail: (projectKey: string, version: string) =>
    [...releaseKeys.all, "detail", projectKey, version] as const,
};

/** Releases exist only on Factory projects; pass `enabled = false` otherwise. */
export function useReleases(projectKey: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: releaseKeys.list(projectKey ?? ""),
    queryFn: async () => (await listReleases(projectKey as string)).releases,
    enabled: enabled && projectKey != null,
  });
}

export function useRelease(projectKey: string, version: string) {
  return useQuery({
    queryKey: releaseKeys.detail(projectKey, version),
    queryFn: () => getRelease(projectKey, version),
  });
}

function warn(warnings: string[]) {
  if (warnings.length > 0) {
    toast.warning("Depends-on warning", { description: warnings.join("\n") });
  }
}

/** A pick changes the Story's release_id, so tasks are invalidated too. */
function useInvalidateReleases() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: releaseKeys.all });
    qc.invalidateQueries({ queryKey: taskKeys.all });
  };
}

/** Create a planned Release, then pick each Story into it. */
export function useCreateRelease() {
  const invalidate = useInvalidateReleases();
  return useMutation({
    mutationFn: async ({ projectKey, version, storyKeys }: { projectKey: string; version: string; storyKeys: string[] }) => {
      await createRelease(projectKey, version);
      const warnings: string[] = [];
      for (const key of storyKeys) {
        warnings.push(...(await pickReleaseStory(version, key)).warnings);
      }
      return warnings;
    },
    onSuccess: (warnings, { version }) => {
      toast.success(`Release ${version} created`);
      warn(warnings);
    },
    onError: (err) => toast.error(`Failed to create release: ${String(err)}`),
    onSettled: invalidate,
  });
}

export function usePickReleaseStory() {
  const invalidate = useInvalidateReleases();
  return useMutation({
    mutationFn: ({ version, storyKey }: { version: string; storyKey: string }) =>
      pickReleaseStory(version, storyKey),
    onSuccess: (result) => warn(result.warnings),
    onError: (err) => toast.error(`Failed to pick story: ${String(err)}`),
    onSettled: invalidate,
  });
}

export function useRemoveReleaseStory() {
  const invalidate = useInvalidateReleases();
  return useMutation({
    mutationFn: (storyKey: string) => removeReleaseStory(storyKey),
    onError: (err) => toast.error(`Failed to remove story: ${String(err)}`),
    onSettled: invalidate,
  });
}
