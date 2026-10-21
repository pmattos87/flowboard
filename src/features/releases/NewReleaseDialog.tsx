import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateRelease } from "@/hooks/useReleases";
import { lastReleasedVersion, suggestVersion } from "@/lib/releaseVersion";
import type { ReleaseSummary, Task } from "@/types";

const VERSION_RE = /^\d+\.\d+\.\d+$/;

interface Props {
  projectKey: string;
  releases: ReleaseSummary[];
  /** Tested Stories not yet in a Release. */
  candidates: Task[];
  onOpenChange: (open: boolean) => void;
}

/** Mounted only while open, so each opening starts fresh. */
export function NewReleaseDialog({ projectKey, releases, candidates, onOpenChange }: Props) {
  const createRelease = useCreateRelease();
  const [checked, setChecked] = useState<Set<number>>(() => new Set(candidates.map((t) => t.id)));
  // Until the version is typed, it follows the suggestion as Stories are ticked.
  const [typed, setTyped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const picked = candidates.filter((t) => checked.has(t.id));
  const suggestion = suggestVersion(releases, picked.map((t) => t.feature_branch));
  const version = typed ?? suggestion ?? "";
  const last = lastReleasedVersion(releases);

  const toggle = (id: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createRelease.mutateAsync({
        projectKey,
        version,
        storyKeys: picked.map((t) => `${projectKey}-${t.task_number}`),
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New release</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-gray-300">Tested stories to pick</Label>
            {candidates.length === 0 ? (
              <p className="text-sm text-gray-500">No tested stories are waiting for a release.</p>
            ) : (
              <ul className="max-h-56 overflow-y-auto space-y-1">
                {candidates.map((t) => (
                  <li key={t.id}>
                    <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                      <input type="checkbox" checked={checked.has(t.id)} onChange={() => toggle(t.id)} />
                      <span className="font-mono text-xs text-gray-400">{projectKey}-{t.task_number}</span>
                      <span className="truncate">{t.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="release-version" className="text-gray-300">Version</Label>
            <Input
              id="release-version"
              value={version}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="1.6.0"
              className="bg-gray-800 border-gray-700 text-gray-100 font-mono"
            />
            <p className="text-xs text-gray-500">
              {last
                ? `Last released ${last}; a feat branch bumps the minor, anything else the patch.`
                : "Nothing released yet; enter the first version."}
            </p>
          </div>
          {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!VERSION_RE.test(version) || createRelease.isPending}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {createRelease.isPending ? "Creating…" : "Create release"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
