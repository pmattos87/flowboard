import { Label } from "@/components/ui/label";
import { useClients } from "@/hooks/useClients";

/** The project's client: "None (internal)" (null) or one of the clients. */
export function ClientSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number | null;
  onChange: (clientId: number | null) => void;
}) {
  const { data: clients } = useClients();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-gray-300">
        Client
      </Label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded-md bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">None (internal)</option>
        {(clients ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
