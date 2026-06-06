import { request } from "@/utils/request";

/** A scraped group member as returned by `GET /group-members`. */
export interface GroupMember {
  id: string;
  brandId: string;
  userId: string;
  username: string;
  groupChatId: string;
  bio: string;
  activityNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListGroupMembersParams {
  chatId?: string;
}

export interface ListGroupMembersResult {
  data: GroupMember[];
  total: number;
}

export function listGroupMembers(params: ListGroupMembersParams = {}): Promise<ListGroupMembersResult> {
  const qs = params.chatId ? `?chatId=${encodeURIComponent(params.chatId)}` : "";
  return request(`/group-members${qs}`);
}
