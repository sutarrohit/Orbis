import { queryOptions } from "@tanstack/react-query";
import { listGroupMembers, type ListGroupMembersParams } from "./group-members-apis";

export const groupMemberKeys = {
  all: ["group-members"] as const,
  list: (params: ListGroupMembersParams) => ["group-members", params] as const
};

export function listGroupMembersQueryOptions(params: ListGroupMembersParams = {}) {
  return queryOptions({
    queryKey: groupMemberKeys.list(params),
    queryFn: () => listGroupMembers(params),
    enabled: Boolean(params.chatId)
  });
}
