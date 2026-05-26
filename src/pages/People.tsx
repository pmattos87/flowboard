import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreatePerson,
  useDeletePerson,
  usePeople,
  useUpdatePerson,
} from "@/hooks/usePeople";
import type { Person } from "@/types";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "#6366f1", "#3b82f6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6",
];

type PersonForm = {
  name: string;
  email: string;
  role: string;
  avatar_color: string;
};

const emptyForm = (): PersonForm => ({
  name: "",
  email: "",
  role: "",
  avatar_color: AVATAR_COLORS[0],
});

function PersonRow({
  person,
  onEdit,
  onDelete,
}: {
  person: Person;
  onEdit: (p: Person) => void;
  onDelete: (p: Person) => void;
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 flex items-center gap-3">
      <div
        className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
        style={{ backgroundColor: person.avatar_color || AVATAR_COLORS[0] }}
      >
        {person.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{person.name}</p>
        <p className="text-xs text-gray-500 truncate">
          {person.role ? (
            <>
              <span className="text-blue-400">{person.role}</span>
              <span className="mx-1">·</span>
            </>
          ) : null}
          {person.email}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onEdit(person)}
          aria-label={`Edit ${person.name}`}
          className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(person)}
          aria-label={`Delete ${person.name}`}
          className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function People() {
  const { data: people, isLoading } = usePeople();
  const createPerson = useCreatePerson();
  const updatePerson = useUpdatePerson();
  const deletePerson = useDeletePerson();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [form, setForm] = useState<PersonForm>(emptyForm());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (person: Person) => {
    setEditing(person);
    setForm({
      name: person.name,
      email: person.email,
      role: person.role ?? "",
      avatar_color: person.avatar_color || AVATAR_COLORS[0],
    });
    setError(null);
    setModalOpen(true);
  };

  const handleModalClose = (open: boolean) => {
    if (!open) {
      setModalOpen(false);
      setEditing(null);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name || !email) return;
    try {
      if (editing) {
        await updatePerson.mutateAsync({
          id: editing.id,
          payload: { name, email, role: form.role.trim(), avatar_color: form.avatar_color },
        });
      } else {
        await createPerson.mutateAsync({
          name, email, role: form.role.trim(), avatar_color: form.avatar_color,
        });
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (person: Person) => {
    if (deletingId === person.id) {
      try {
        await deletePerson.mutateAsync(person.id);
      } catch (_) {
        // toasts added in Phase 9
      }
      setDeletingId(null);
    } else {
      setDeletingId(person.id);
    }
  };

  const isPending = createPerson.isPending || updatePerson.isPending;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">People</h1>
          <p className="mt-0.5 text-sm text-gray-500">Team members in this workspace.</p>
        </div>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white">
          <Plus className="h-4 w-4" />
          Add person
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : people && people.length > 0 ? (
        <div className="space-y-2">
          {people.map((p) =>
            deletingId === p.id ? (
              <div key={p.id} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
                <p className="text-sm text-gray-300">
                  Delete <span className="text-white font-medium">{p.name}</span>? This cannot be undone.
                </p>
                <div className="flex gap-2 ml-4 shrink-0">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(p)}
                    disabled={deletePerson.isPending}
                  >
                    {deletePerson.isPending ? "Deleting…" : "Delete"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeletingId(null)}
                    className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <PersonRow key={p.id} person={p} onEdit={openEdit} onDelete={handleDelete} />
            )
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-700 p-12 text-center">
          <p className="text-sm text-gray-500">No team members yet.</p>
          <Button
            variant="outline"
            onClick={openCreate}
            className="mt-4 bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            Add the first person
          </Button>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={handleModalClose}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit person" : "Add person"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="person-name" className="text-gray-300">Name</Label>
              <Input
                id="person-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Jane Doe"
                className="bg-gray-800 border-gray-700 text-gray-100"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-email" className="text-gray-300">Email</Label>
              <Input
                id="person-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="jane@example.com"
                className="bg-gray-800 border-gray-700 text-gray-100"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-role" className="text-gray-300">
                Role{" "}
                <span className="text-gray-500 font-normal">(optional)</span>
              </Label>
              <Input
                id="person-role"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                placeholder="Frontend Engineer"
                className="bg-gray-800 border-gray-700 text-gray-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300">Avatar color</Label>
              <div className="flex gap-2">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, avatar_color: c }))}
                    aria-label={`Choose color ${c}`}
                    className={cn(
                      "h-7 w-7 rounded-full transition-all",
                      form.avatar_color === c
                        ? "ring-2 ring-offset-2 ring-offset-gray-900 ring-white"
                        : "opacity-70 hover:opacity-100",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-400" role="alert">{error}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!form.name.trim() || !form.email.trim() || isPending}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                {isPending ? "Saving…" : editing ? "Save changes" : "Add person"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
