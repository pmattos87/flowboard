import { useRef, useState } from "react";
import { SkeletonRow } from "@/components/Skeleton";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
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
import { Avatar } from "@/components/Avatar";
import { fileToAvatarDataUrl } from "@/lib/image";
import { randomIdentityColor } from "@/lib/colors";

type PersonForm = {
  name: string;
  email: string;
  role: string;
  avatar_data: string | null;
};

const emptyForm = (): PersonForm => ({
  name: "",
  email: "",
  role: "",
  avatar_data: null,
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
      <Avatar person={person} className="h-10 w-10 text-sm" />
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      avatar_data: person.avatar_data,
    });
    setError(null);
    setModalOpen(true);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setError(null);
    try {
      const avatar_data = await fileToAvatarDataUrl(file);
      setForm((f) => ({ ...f, avatar_data }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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
          payload: { name, email, role: form.role.trim(), avatar_data: form.avatar_data },
        });
      } else {
        await createPerson.mutateAsync({
          name,
          email,
          role: form.role.trim(),
          avatar_color: randomIdentityColor(),
          avatar_data: form.avatar_data,
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
        <div className="space-y-1">{Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}</div>
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
              <Label className="text-gray-300">Photo</Label>
              <div className="flex items-center gap-3">
                <Avatar
                  person={{
                    name: form.name || "?",
                    avatar_color: editing?.avatar_color ?? "#6366f1",
                    avatar_data: form.avatar_data,
                  }}
                  className="h-12 w-12 text-base"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload photo
                </Button>
                {form.avatar_data && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, avatar_data: null }))}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                )}
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
