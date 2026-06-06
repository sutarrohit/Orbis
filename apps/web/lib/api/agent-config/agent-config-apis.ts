import { request } from "@/utils/request";
import type { AgentType } from "@/lib/api/enums";

/** Per-agent behavior config as returned by `GET /agent-config`. */
export interface AgentConfig {
  id: string;
  brandId: string;
  agentType: AgentType;
  enabled: boolean;
  voiceTags: string[];
  behaviorRules: string[];
  bannedTopics: string[];
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertAgentConfigInput {
  agentType: AgentType;
  enabled?: boolean;
  voiceTags?: string[];
  behaviorRules?: string[];
  bannedTopics?: string[];
  systemPrompt?: string;
}

export function listAgentConfig(): Promise<AgentConfig[]> {
  return request("/agent-config");
}

export function upsertAgentConfig(input: UpsertAgentConfigInput): Promise<AgentConfig> {
  return request("/agent-config", { method: "POST", body: JSON.stringify(input) });
}
