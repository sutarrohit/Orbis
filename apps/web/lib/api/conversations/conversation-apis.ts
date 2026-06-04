import { request } from "@/utils/request";

export interface ConversationListItem {
  id: string;
  customerId: string;
  channel: string;
  status: string;
  assignedAgentId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  customer: { id: string; displayName: string | null };
  messages: { id: string; content: string | null; direction: string; createdAt: string }[];
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ThreadMessage {
  id: string;
  conversationId: string;
  direction: string;
  type: string;
  content: string | null;
  mediaUrl: string | null;
  channelMessageId: string | null;
  status: string;
  createdAt: string;
}

export function listConversations(): Promise<Paginated<ConversationListItem>> {
  return request("/conversations?page=1&pageSize=50");
}

export function getThread(id: string): Promise<ThreadMessage[]> {
  return request(`/conversations/${id}/messages`);
}

export function sendReply(id: string, content: string): Promise<{ id: string; status: string }> {
  return request(`/conversations/${id}/reply`, {
    method: "POST",
    body: JSON.stringify({ content })
  });
}
