import { prisma } from "../lib/prisma.js";

/** The brand's scraped group members (optionally one group) plus a total count. */
export async function listGroupMembers(brandId: string, chatId?: string) {
  const where = { brandId, ...(chatId ? { groupChatId: chatId } : {}) };
  const [data, total] = await Promise.all([
    prisma.groupMember.findMany({ where, orderBy: { updatedAt: "desc" } }),
    prisma.groupMember.count({ where })
  ]);
  return { data, total };
}
