import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createPerson,
  deletePerson,
  getPerson,
  listPeople,
  updatePerson,
  type PersonCreatePayload,
  type PersonUpdatePayload,
} from "@/lib/commands";

export const personKeys = {
  all: ["people"] as const,
  list: () => [...personKeys.all, "list"] as const,
  detail: (id: number) => [...personKeys.all, "detail", id] as const,
};

export function usePeople() {
  return useQuery({
    queryKey: personKeys.list(),
    queryFn: listPeople,
  });
}

export function usePerson(id: number | null | undefined) {
  return useQuery({
    queryKey: personKeys.detail(id ?? -1),
    queryFn: () => getPerson(id as number),
    enabled: id != null,
  });
}

export function useCreatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PersonCreatePayload) => createPerson(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: personKeys.all }); },
    onError: (err) => toast.error(`Failed to create person: ${String(err)}`),
  });
}

export function useUpdatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: PersonUpdatePayload }) =>
      updatePerson(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: personKeys.all }); },
    onError: (err) => toast.error(`Failed to update person: ${String(err)}`),
  });
}

export function useDeletePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deletePerson(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: personKeys.all }); },
    onError: (err) => toast.error(`Failed to delete person: ${String(err)}`),
  });
}
