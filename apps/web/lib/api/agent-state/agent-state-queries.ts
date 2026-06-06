import { queryOptions } from "@tanstack/react-query";
import { listAgentState } from "./agent-state-apis";

export const agentStateKeys = {
  all: ["agent-state"] as const
};

export function listAgentStateQueryOptions() {
  return queryOptions({
    queryKey: agentStateKeys.all,
    queryFn: listAgentState
  });
}
