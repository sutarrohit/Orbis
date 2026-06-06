import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getLead, listLeads, updateLead, type ListLeadsParams, type UpdateLeadInput } from "./leads-apis";

export const leadKeys = {
  all: ["leads"] as const,
  list: (params: ListLeadsParams) => ["leads", "list", params] as const,
  detail: (id: string) => ["leads", "detail", id] as const
};

export function listLeadsQueryOptions(params: ListLeadsParams = {}) {
  return queryOptions({
    queryKey: leadKeys.list(params),
    queryFn: () => listLeads(params)
  });
}

export function leadQueryOptions(id: string) {
  return queryOptions({
    queryKey: leadKeys.detail(id),
    queryFn: () => getLead(id),
    enabled: id.length > 0
  });
}

export function updateLeadMutationOptions() {
  return mutationOptions({
    mutationKey: ["leads", "update"],
    mutationFn: ({ id, input }: { id: string; input: UpdateLeadInput }) => updateLead(id, input)
  });
}
