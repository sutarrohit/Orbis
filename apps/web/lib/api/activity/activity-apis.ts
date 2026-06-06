import { request } from "@/utils/request";
import type { AgentType } from "@/lib/api/enums";

/** An agent activity entry as returned by `GET /activity`. */
export interface Activity {
  id: string;
  brandId: string;
  agent: AgentType;
  action: string;
  detail: Record<string, unknown> | null;
  dedupKey: string | null;
  accountId: string | null;
  ts: string;
}

export interface ListActivityParams {
  since?: string;
  limit?: number;
  agent?: AgentType;
  action?: string;
}

export function listActivity(params: ListActivityParams = {}): Promise<Activity[]> {
  const qs = new URLSearchParams();
  if (params.since) qs.set("since", params.since);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.agent) qs.set("agent", params.agent);
  if (params.action) qs.set("action", params.action);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request(`/activity${suffix}`);
}
