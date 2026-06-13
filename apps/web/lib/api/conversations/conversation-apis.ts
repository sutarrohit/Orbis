import { request } from "@/utils/request";
import type { PendingSendStatus, Platform } from "@/lib/api/enums";

/** A captured group message as returned by `GET /conversations`. */
export interface Conversation {
  id: string;
  brandId: string;
  platform: Platform;
  userId: string;
  username: string;
  groupChatId: string;
  text: string;
  ts: string;
  createdAt: string;
}

export interface ListConversationsParams {
  communityId?: string;
  userId?: string;
}

export interface SendMessageInput {
  leadId: string;
  accountId: string;
  message: string;
}

/** The queued DM returned by `POST /conversations/send`. */
export interface PendingSend {
  id: string;
  brandId: string;
  leadId: string;
  accountId: string;
  message: string;
  stage: number;
  status: PendingSendStatus;
  dedupKey: string;
  createdAt: string;
  sentAt: string | null;
}

export function listConversations(params: ListConversationsParams = {}): Promise<Conversation[]> {
  const qs = new URLSearchParams();
  if (params.communityId) qs.set("community_id", params.communityId);
  if (params.userId) qs.set("user_id", params.userId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request(`/conversations${suffix}`);
}

export function sendMessage(input: SendMessageInput): Promise<PendingSend> {
  return request("/conversations/send", { method: "POST", body: JSON.stringify(input) });
}
