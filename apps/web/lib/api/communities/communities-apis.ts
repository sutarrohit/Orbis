import { request } from "@/utils/request";
import type { CommunityStatus, Platform } from "@/lib/api/enums";

/** A discovered community as returned by `GET /communities`. */
export interface Community {
  id: string;
  brandId: string;
  platform: Platform;
  handle: string;
  name: string;
  nicheRelevance: number;
  status: CommunityStatus;
  source: string;
  foundVia: string;
  sourceUrl: string;
  groupChatId: string;
  discussionChatId: string;
  note: string;
  pendingLeave: boolean;
  assignedAccountId: string | null;
  assignedAccount: { id: string; handle: string; displayName: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListCommunitiesParams {
  status?: CommunityStatus;
}

export interface CreateCommunityInput {
  handle: string;
  platform?: Platform;
  name?: string;
  nicheRelevance?: number;
  source?: string;
  foundVia?: string;
  sourceUrl?: string;
}

export interface UpdateCommunityInput {
  name?: string;
  status?: CommunityStatus;
  nicheRelevance?: number;
  assignedAccountId?: string | null;
  groupChatId?: string;
  sourceUrl?: string;
}

export function listCommunities(params: ListCommunitiesParams = {}): Promise<Community[]> {
  const qs = params.status ? `?status=${params.status}` : "";
  return request(`/communities${qs}`);
}

export function createCommunity(input: CreateCommunityInput): Promise<Community> {
  return request("/communities", { method: "POST", body: JSON.stringify(input) });
}

export function updateCommunity(id: string, input: UpdateCommunityInput): Promise<Community> {
  return request(`/communities/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteCommunity(id: string): Promise<void> {
  return request(`/communities/${id}`, { method: "DELETE" });
}
