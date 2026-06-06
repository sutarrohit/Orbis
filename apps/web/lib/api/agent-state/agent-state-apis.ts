import { request } from "@/utils/request";
import type { AgentRunStatus, AgentType } from "@/lib/api/enums";

/** Run status of one agent, as returned by `GET /agent-state`. */
export interface AgentState {
  id: string;
  brandId: string;
  agentType: AgentType;
  status: AgentRunStatus;
  currentTask: string;
  startedAt: string | null;
  updatedAt: string;
}

export function listAgentState(): Promise<AgentState[]> {
  return request("/agent-state");
}
