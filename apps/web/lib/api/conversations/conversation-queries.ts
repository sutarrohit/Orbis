import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { listConversations, sendMessage, type ListConversationsParams } from "./conversation-apis";

export const conversationKeys = {
  all: ["conversations"] as const,
  list: (params: ListConversationsParams) => ["conversations", params] as const
};

export function listConversationsQueryOptions(params: ListConversationsParams = {}) {
  return queryOptions({
    queryKey: conversationKeys.list(params),
    queryFn: () => listConversations(params)
  });
}

export function sendMessageMutationOptions() {
  return mutationOptions({
    mutationKey: ["conversations", "send"],
    mutationFn: sendMessage
  });
}
