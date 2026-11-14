import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
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
import { fileToOrgLogoDataUrl } from "@/lib/image";
import type { ClientUpdatePayload } from "@/lib/commands";

/** A client's or the company's logo, when it has one (SF-134). Renders nothing otherwise. */
export function OrgLogo({
  name,
  logoData,
  className = "h-5 w-5",
}: {
  name: string;
  logoData: string | null | undefined;
  className?: string;
}) {
  if (!logoData) return null;
  return <img src={logoData} alt={`${name} logo`} className={`${className} rounded-sm object-contain shrink-0`} />;
}

/**
 * The dialog for a client's name, used to create a client and to edit one or the
 * company (SF-134). With `withLogo` it also uploads or removes the logo; the
 * submitted payload carries `logo_data` only when the logo changed.
 */
export function ClientDialog({
  open,
  onOpenChange,
  title,
  description = "A client groups its projects in the sidebar.",
  nameLabel = "Client name",
  placeholder = "Acme Corp",
  submitLabel,
  initialName = "",
  initialLogo = null,
  withLogo = false,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  nameLabel?: string;
  placeholder?: string;
  submitLabel: string;
  initialName?: string;
  initialLogo?: string | null;
  withLogo?: boolean;
  isPending: boolean;
  /** Resolves when saved (the dialog closes); rejects to keep it open (the hook shows the error). */
  onSubmit: (payload: ClientUpdatePayload & { name: string }) => Promise<unknown>;
}) {
  const [name, setName] = useState(initialName);
  const [logo, setLogo] = useState<string | null>(initialLogo);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setLogo(initialLogo);
      setError(null);
    }
  }, [open, initialName, initialLogo]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !isPending;

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setError(null);
    try {
      setLogo(await fileToOrgLogoDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await onSubmit(
        withLogo && logo !== initialLogo ? { name: trimmed, logo_data: logo } : { name: trimmed },
      );
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
          <DialogDescription className="text-gray-400">{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-name" className="text-gray-300">
              {nameLabel}
            </Label>
            <Input
              id="client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={placeholder}
              autoFocus
              className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500"
            />
          </div>
          {withLogo && (
            <div className="space-y-1.5">
              <Label className="text-gray-300">
                Logo <span className="text-gray-500">(optional)</span>
              </Label>
              <div className="flex items-center gap-3">
                {logo ? (
                  <OrgLogo name={trimmed || title} logoData={logo} className="h-12 w-12" />
                ) : (
                  <span className="h-12 w-12 rounded-sm border border-dashed border-gray-700" aria-hidden="true" />
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-label="Logo file"
                  onChange={handleLogoChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload logo
                </Button>
                {logo && (
                  <button
                    type="button"
                    onClick={() => setLogo(null)}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
              {error && (
                <p className="text-sm text-red-400" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
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
