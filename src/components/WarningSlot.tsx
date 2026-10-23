import type { ReactNode } from "react";

interface WarningSlotProps {
  children?: ReactNode;
}

/**
 * The shell's slot for full-width warning strips above everything else.
 * With no children (undefined, null, false) it renders nothing at all, so in
 * production the slot is absent rather than an empty band.
 */
export function WarningSlot({ children }: WarningSlotProps) {
  if (children === undefined || children === null || children === false) return null;
  return (
    <div data-testid="warning-slot" className="w-full shrink-0">
      {children}
    </div>
  );
}
