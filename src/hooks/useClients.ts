import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient, listClients, renameClient, reorderClients } from "@/lib/commands";
import type { Client } from "@/types";

export const clientKeys = {
  all: ["clients"] as const,
  list: () => [...clientKeys.all, "list"] as const,
};

export function useClients() {
  return useQuery({
    queryKey: clientKeys.list(),
    queryFn: listClients,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createClient(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: clientKeys.all }); },
    onError: (err) => toast.error(`Failed to create client: ${String(err)}`),
  });
}

export function useRenameClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameClient(id, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: clientKeys.all }); },
    onError: (err) => toast.error(`Failed to rename client: ${String(err)}`),
  });
}

export function useReorderClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: number[]) => reorderClients(orderedIds),
    // Optimistically apply the new order so the sidebar doesn't flicker back.
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: clientKeys.list() });
      const previous = qc.getQueryData<Client[]>(clientKeys.list());
      if (previous) {
        const byId = new Map(previous.map((c) => [c.id, c]));
        const reordered = orderedIds
          .map((id) => byId.get(id))
          .filter((c): c is Client => c != null);
        qc.setQueryData<Client[]>(clientKeys.list(), reordered);
      }
      return { previous };
    },
    onError: (err, _ids, ctx) => {
      if (ctx?.previous) qc.setQueryData(clientKeys.list(), ctx.previous);
      toast.error(`Failed to reorder clients: ${String(err)}`);
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: clientKeys.all }); },
  });
}
