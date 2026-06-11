import type { Community } from "@/lib/api/communities/communities-apis";

/**
 * Map every chat id a community can produce members/messages under to a display
 * label: its own `groupChatId` and, for broadcast channels, its linked
 * `discussionChatId` (where members are scraped and messages land). Lets leads
 * and conversations show which community they came from.
 */
export function buildCommunityChatMap(communities: Community[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of communities ?? []) {
    const label = c.name || c.handle;
    if (c.groupChatId) map.set(c.groupChatId, label);
    if (c.discussionChatId && c.discussionChatId !== "none") map.set(c.discussionChatId, label);
  }
  return map;
}

/** Resolve a chat id to its community label, or "—" when empty/unknown. */
export function communityLabel(map: Map<string, string>, chatId: string | null | undefined): string {
  if (!chatId) return "—";
  return map.get(chatId) ?? "—";
}
