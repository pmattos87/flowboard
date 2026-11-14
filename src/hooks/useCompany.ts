import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCompany, updateCompany, type ClientUpdatePayload } from "@/lib/commands";

export const companyKeys = {
  all: ["company"] as const,
};

/** The company record (SF-134): the owner of every internal project. */
export function useCompany() {
  return useQuery({
    queryKey: companyKeys.all,
    queryFn: getCompany,
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ClientUpdatePayload) => updateCompany(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: companyKeys.all }); },
    onError: (err) => toast.error(`Failed to update company: ${String(err)}`),
  });
}
