import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getThread, listConversations, sendReply } from "./conversation-apis";

export const conversationKeys = {
  all: ["conversations"] as const,
  thread: (id: string) => ["conversations", id, "messages"] as const
};

export function listConversationsQueryOptions() {
  return queryOptions({
    queryKey: conversationKeys.all,
    queryFn: listConversations
  });
}

export function threadQueryOptions(id: string) {
  return queryOptions({
    queryKey: conversationKeys.thread(id),
    queryFn: () => getThread(id),
    enabled: id.length > 0
  });
}

export function sendReplyMutationOptions() {
  return mutationOptions({
    mutationKey: ["conversations", "reply"],
    mutationFn: ({ id, content }: { id: string; content: string }) => sendReply(id, content)
  });
}
