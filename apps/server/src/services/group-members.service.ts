import { prisma } from "../lib/prisma.js";

/** The brand's scraped group members (optionally one or more groups) + a total.
 *
 * `chatId` may be a single id or a comma-separated list (a channel + its linked
 * discussion group), so a channel's members — stored under the discussion
 * group's id — are included.
 */
export async function listGroupMembers(brandId: string, chatId?: string) {
  const ids = chatId
    ? chatId.split(",").map((s) => s.trim()).filter((s) => s && s !== "none")
    : undefined;
  const where = { brandId, ...(ids && ids.length ? { groupChatId: { in: ids } } : {}) };
  const [data, total] = await Promise.all([
    prisma.groupMember.findMany({ where, orderBy: { updatedAt: "desc" } }),
    prisma.groupMember.count({ where })
  ]);
  return { data, total };
}
