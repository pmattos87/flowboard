import { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, Trash2, Upload } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useDeleteProject,
  useProject,
  useSetProjectState,
  useUpdateProject,
} from "@/hooks/useProjects";
import { useUiStore } from "@/stores/uiStore";
import { seedDemoData } from "@/lib/commands";
import { ProjectBadge } from "@/components/ProjectBadge";
import { ClientSelect } from "@/components/ClientSelect";
import { fileToLogoDataUrl } from "@/lib/image";
import { cn } from "@/lib/utils";
import { BackupSettings } from "@/features/backup/BackupSettings";

// Matches the shortcuts registered in AppShell.tsx useKeyboardShortcuts
const SHORTCUTS = [
  { key: "N", action: "Open 'Create subtask' modal" },
  { key: "/", action: "Focus global search bar" },
] as const;

type Tab = "project" | "backup" | "shortcuts";

const TABS: { id: Tab; label: string }[] = [
  { id: "project", label: "Project" },
  { id: "backup", label: "Backup" },
  { id: "shortcuts", label: "Keyboard Shortcuts" },
];

/** `/settings?tab=backup` opens on that tab; anything else opens on Project. */
function tabFromParam(value: string | null): Tab {
  return TABS.find((t) => t.id === value)?.id ?? "project";
}

export default function Settings() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const setActiveProjectId = useUiStore((s) => s.setActiveProjectId);
  const { data: project, isLoading } = useProject(activeProjectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const setProjectState = useSetProjectState();
  const archived = project?.state === "archived";

  // The URL is the source of truth for the tab, so a tab click and a link to
  // `?tab=backup` (the sidebar's backup warning) always agree.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = tabFromParam(searchParams.get("tab"));
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [logoData, setLogoData] = useState<string | null>(null);
  const [clientId, setClientId] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // FB-305: a Save that flips the kind (no client <-> a client) waits here for confirmation.
  const [kindChange, setKindChange] = useState<"toClient" | "toInternal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Staging: seed controls
  const isStaging = import.meta.env.VITE_APP_ENV === "staging";
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setKey(project.key);
      setDescription(project.description);
      setLogoData(project.logo_data);
      setClientId(project.client_id);
      setConfirmingDelete(false);
      setError(null);
    }
  }, [project]);

  const trimmedName = name.trim();
  const trimmedKey = key.trim().toUpperCase();
  const dirty =
    !!project &&
    (trimmedName !== project.name ||
      trimmedKey !== project.key ||
      description !== project.description ||
      logoData !== project.logo_data ||
      clientId !== project.client_id);
  const valid =
    trimmedName.length > 0 && /^[A-Z0-9]{2,5}$/.test(trimmedKey);
  const canSave = dirty && valid && !updateProject.isPending;

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setError(null);
    try {
      setLogoData(await fileToLogoDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || !project) return;
    if ((project.client_id === null) !== (clientId === null)) {
      setKindChange(clientId === null ? "toInternal" : "toClient");
      return;
    }
    void save();
  };

  const confirmKindChange = () => {
    setKindChange(null);
    void save();
  };

  /** Cancelling restores only the Client select; other unsaved edits stay. */
  const cancelKindChange = () => {
    setKindChange(null);
    if (project) setClientId(project.client_id);
  };

  const save = async () => {
    if (!project) return;
    setError(null);
    try {
      await updateProject.mutateAsync({
        id: project.id,
        payload: {
          name: trimmedName,
          key: trimmedKey,
          description,
          logo_data: logoData,
          client_id: clientId,
        },
      });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    setError(null);
    try {
      await deleteProject.mutateAsync(project.id);
      setActiveProjectId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConfirmingDelete(false);
    }
  };

  const handleSeed = async (force: boolean) => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const result = await seedDemoData(force);
      setSeedResult(result);
    } catch (e) {
      setSeedResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold text-white">Settings</h1>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-gray-800 mt-4 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSearchParams({ tab: tab.id })}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-blue-500 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Project tab ── */}
      {activeTab === "project" && (
        <>
          {activeProjectId == null && (
            <p className="text-sm text-gray-500">
              Select a project from the sidebar to edit its settings.
            </p>
          )}

          {activeProjectId != null && (isLoading || !project) && (
            <p className="text-sm text-gray-500">Loading…</p>
          )}

          {activeProjectId != null && project && (
            <>
              <p className="text-sm text-gray-500">
                Editing <span className="text-gray-300">{project.name}</span>
                {project.kind === "client" && (
                  <span className="ml-2 rounded bg-blue-500/15 px-1.5 py-0.5 text-xs font-medium text-blue-300">
                    Client
                  </span>
                )}
              </p>

              <Dialog
                open={kindChange !== null}
                onOpenChange={(open) => {
                  if (!open) cancelKindChange();
                }}
              >
                <DialogContent className="bg-gray-900 border-gray-800 text-gray-100 sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>
                      {kindChange === "toClient"
                        ? "Make this a Client project?"
                        : "Make this an Internal project?"}
                    </DialogTitle>
                    <DialogDescription className="text-gray-400">
                      {kindChange === "toClient"
                        ? "User testing is added between tested and production, with betas and client documents."
                        : "User testing, betas and client documents are removed. Releases go from tested straight to production."}
                    </DialogDescription>
                  </DialogHeader>
                  {kindChange === "toInternal" && (
                    <p className="text-sm text-amber-400">
                      Stories in User testing or open betas are affected.
                    </p>
                  )}
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={cancelKindChange}
                      className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={confirmKindChange}
                      className="bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      Confirm and save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <form onSubmit={handleSave} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="settings-name" className="text-gray-300">
                    Name
                  </Label>
                  <Input
                    id="settings-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-gray-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="settings-key" className="text-gray-300">
                    Key
                  </Label>
                  <Input
                    id="settings-key"
                    value={key}
                    onChange={(e) => setKey(e.target.value.toUpperCase())}
                    maxLength={5}
                    className="bg-gray-800 border-gray-700 text-gray-100 uppercase"
                  />
                </div>

                <ClientSelect id="settings-client" value={clientId} onChange={setClientId} />

                <div className="space-y-1.5">
                  <Label htmlFor="settings-description" className="text-gray-300">
                    Description
                  </Label>
                  <Textarea
                    id="settings-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="bg-gray-800 border-gray-700 text-gray-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-gray-300">
                    Logo <span className="text-gray-500">(optional)</span>
                  </Label>
                  <div className="flex items-center gap-3">
                    <ProjectBadge
                      project={{ name, color: project.color, logo_data: logoData }}
                      className="h-12 w-12 rounded-md"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
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
                    {logoData && (
                      <button
                        type="button"
                        onClick={() => setLogoData(null)}
                        className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    No logo? The project's color is shown instead.
                  </p>
                </div>

                {error && (
                  <p className="text-sm text-red-400" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={!canSave}
                    className="bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    {updateProject.isPending ? "Saving…" : "Save changes"}
                  </Button>
                  {savedAt && !dirty && (
                    <span className="text-xs text-emerald-400">Saved</span>
                  )}
                </div>
              </form>

              <div className="mt-12 pt-6 border-t border-gray-800">
                <h2 className="text-sm font-semibold text-gray-300">
                  {archived ? "Archived project" : "Archive"}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {archived
                    ? "This project is read-only. Unarchive it to plan new work in it."
                    : "Archiving puts the project away and makes it read-only. You can unarchive it at any time."}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setProjectState.mutate({
                      id: project.id,
                      state: archived ? "active" : "archived",
                    })
                  }
                  disabled={setProjectState.isPending}
                  className="mt-3 bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
                >
                  {archived ? (
                    <ArchiveRestore className="h-4 w-4" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                  {archived ? "Unarchive project" : "Archive project"}
                </Button>
              </div>

              <div className="mt-12 pt-6 border-t border-gray-800">
                <h2 className="text-sm font-semibold text-gray-300">Danger zone</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Deleting a project removes its sprints, tasks, comments, and time
                  logs. This cannot be undone.
                </p>
                {confirmingDelete ? (
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={deleteProject.isPending}
                    >
                      {deleteProject.isPending ? "Deleting…" : "Yes, delete project"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmingDelete(false)}
                      className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setConfirmingDelete(true)}
                    className="mt-3"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete project
                  </Button>
                )}
              </div>
            </>
          )}

          {/* Developer section — dev builds only */}
          {isStaging && (
            <div className="mt-12 pt-6 border-t border-gray-800">
              <h2 className="text-sm font-semibold text-amber-400">Developer</h2>
              <p className="mt-1 text-xs text-gray-500">
                Populate the database with realistic demo data for testing.
              </p>
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <Button
                  type="button"
                  onClick={() => handleSeed(false)}
                  disabled={seeding}
                  className="bg-amber-700 hover:bg-amber-600 text-white"
                >
                  {seeding ? "Seeding…" : "Seed demo data"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSeed(true)}
                  disabled={seeding}
                  className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
                >
                  Force re-seed
                </Button>
              </div>
              {seedResult && (
                <p className="mt-2 text-xs text-emerald-400">{seedResult}</p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Backup tab ── */}
      {activeTab === "backup" && <BackupSettings />}

      {/* ── Keyboard Shortcuts tab ── */}
      {activeTab === "shortcuts" && (
        <div className="max-w-xl space-y-4">
          <p className="text-sm text-gray-400">
            These shortcuts work anywhere in the app, except when focus is inside
            a text input or textarea.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="pb-3 pr-8">Key</th>
                <th className="pb-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {SHORTCUTS.map(({ key: k, action }) => (
                <tr key={k}>
                  <td className="py-2.5 pr-8">
                    <kbd className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs font-mono">
                      {k}
                    </kbd>
                  </td>
                  <td className="py-2.5 text-gray-300">{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
