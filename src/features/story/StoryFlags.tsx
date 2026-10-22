import { cn } from "@/lib/utils";

// The two Run flags (SF-61). They sit beside the status, never replace it:
// "stopped" is the Story's run_stopped, "waiting on N bugs" counts its open
// bug Subtasks.

interface StoryFlagsProps {
  stopped: boolean;
  waitingOnBugs: number;
  className?: string;
}

export function StoryFlags({ stopped, waitingOnBugs, className }: StoryFlagsProps) {
  if (!stopped && waitingOnBugs === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {stopped && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400 border border-red-700">
          stopped
        </span>
      )}
      {waitingOnBugs > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-700">
          waiting on {waitingOnBugs} {waitingOnBugs === 1 ? "bug" : "bugs"}
        </span>
      )}
    </span>
  );
}
