import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A one-field dialog for a client's name, used to create and to rename a client. */
export function ClientNameDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  initialName = "",
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  initialName?: string;
  isPending: boolean;
  /** Resolves when saved (the dialog closes); rejects to keep it open (the hook shows the error). */
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } catch {
      // The mutation hook already shows a toast; keep the dialog open to retry.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-800 text-gray-100 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-gray-400">
            A client groups its projects in the sidebar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-name" className="text-gray-300">
              Client name
            </Label>
            <Input
              id="client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              autoFocus
              className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500"
            />
          </div>
          <DialogFooter>
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
              disabled={!canSubmit}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
