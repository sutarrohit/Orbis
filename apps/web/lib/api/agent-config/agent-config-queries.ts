import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { listAgentConfig, upsertAgentConfig } from "./agent-config-apis";

export const agentConfigKeys = {
  all: ["agent-config"] as const
};

export function listAgentConfigQueryOptions() {
  return queryOptions({
    queryKey: agentConfigKeys.all,
    queryFn: listAgentConfig
  });
}

export function upsertAgentConfigMutationOptions() {
  return mutationOptions({
    mutationKey: ["agent-config", "upsert"],
    mutationFn: upsertAgentConfig
  });
}
