import { randomUUID } from "node:crypto";
import { NOT_FOUND } from "stoker/http-status-codes";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import type { ListConversationsInput, SendMessageInput } from "../schemas/conversations.schema.js";

/** The brand's latest 100 conversations, optionally filtered by group/user. */
export function listConversations(brandId: string, filters: ListConversationsInput) {
  return prisma.conversation.findMany({
    where: {
      brandId,
      ...(filters.community_id ? { groupChatId: filters.community_id } : {}),
      ...(filters.user_id ? { userId: filters.user_id } : {})
    },
    orderBy: { ts: "desc" },
    take: 100
  });
}

/**
 * Queue a manual DM for the gateway to deliver. Validates the lead and account
 * belong to the brand (404 otherwise) and stamps a unique dedup key so retries
 * can't double-send (PendingSend is unique on (brandId, dedupKey)).
 */
export async function queueSend(brandId: string, data: SendMessageInput) {
  const [lead, account] = await Promise.all([
    prisma.lead.findFirst({ where: { id: data.leadId, brandId } }),
    prisma.socialAccount.findFirst({ where: { id: data.accountId, brandId } })
  ]);
  if (!lead) throw new ApiError(NOT_FOUND, "LEAD_NOT_FOUND", "Lead not found");
  if (!account) throw new ApiError(NOT_FOUND, "ACCOUNT_NOT_FOUND", "Account not found");

  return prisma.pendingSend.create({
    data: {
      brandId,
      leadId: data.leadId,
      accountId: data.accountId,
      message: data.message,
      dedupKey: `manual:${randomUUID()}`
    }
  });
}
