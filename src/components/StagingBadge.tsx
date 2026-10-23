import { TriangleAlert } from "lucide-react";

/**
 * Full-width warning strip shown only in the staging build.
 * Not dismissible and does not animate in: no close button, no state that can
 * hide it, so it cannot be mistaken for a toast.
 */
export function StagingBadge() {
  return (
    <div
      data-testid="staging-badge"
      role="status"
      className="flex h-10 shrink-0 items-center justify-center gap-3 bg-amber-400 px-3 text-gray-950"
    >
      <TriangleAlert className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
      <span className="text-sm font-bold uppercase tracking-[0.18em]">STAGING ENVIRONMENT</span>
      <span className="text-sm font-medium opacity-80">Test data only. Nothing here is real.</span>
    </div>
  );
}
