import { request } from "@/utils/request";
import type { AgentType } from "@/lib/api/enums";

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

export interface UsageByAgent extends UsageTotals {
  agent: AgentType;
}

/** Token-usage summary as returned by `GET /usage`. */
export interface UsageSummary {
  days: number;
  totals: UsageTotals;
  byAgent: UsageByAgent[];
}

export interface GetUsageParams {
  days?: number;
}

export function getUsage(params: GetUsageParams = {}): Promise<UsageSummary> {
  const qs = params.days ? `?days=${params.days}` : "";
  return request(`/usage${qs}`);
}
