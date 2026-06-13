import { CONFLICT, NOT_FOUND } from "stoker/http-status-codes";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import type { CommunityStatus } from "../../prisma/generated/enums.js";
import type { CreateCommunityInput, UpdateCommunityInput } from "../schemas/communities.schema.js";

const ACCOUNT_SELECT = { id: true, handle: true, displayName: true } as const;

/** The brand's communities (optionally filtered by status), newest first.
 *  Communities marked for removal (pendingLeave) are hidden — the gateway is
 *  still leaving the chat and will hard-delete them shortly. */
export function listCommunities(brandId: string, status?: CommunityStatus) {
  return prisma.community.findMany({
    where: { brandId, pendingLeave: false, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    include: { assignedAccount: { select: ACCOUNT_SELECT } }
  });
}

/** Add a community. 409 if its handle already exists for the brand. */
export async function createCommunity(brandId: string, data: CreateCommunityInput) {
  const existing = await prisma.community.findFirst({ where: { brandId, handle: data.handle } });
  if (existing) {
    throw new ApiError(CONFLICT, "COMMUNITY_EXISTS", "A community with this handle already exists");
  }

  return prisma.community.create({
    data: { brandId, ...data },
    include: { assignedAccount: { select: ACCOUNT_SELECT } }
  });
}

/** Update a community (ownership-checked). 404 if missing or assignee not owned. */
export async function updateCommunity(brandId: string, id: string, data: UpdateCommunityInput) {
  const owned = await prisma.community.findFirst({ where: { id, brandId } });
  if (!owned) throw new ApiError(NOT_FOUND, "COMMUNITY_NOT_FOUND", "Community not found");

  // Assigning an account: make sure it belongs to this brand, and keep the
  // community's platform in sync with the joining account (it defines the platform).
  let platform: "telegram" | "discord" | undefined;
  if (data.assignedAccountId) {
    const account = await prisma.socialAccount.findFirst({
      where: { id: data.assignedAccountId, brandId }
    });
    if (!account) throw new ApiError(NOT_FOUND, "ACCOUNT_NOT_FOUND", "Assigned account not found");
    platform = account.platform;
  }

  return prisma.community.update({
    where: { id },
    data: platform ? { ...data, platform } : data,
    include: { assignedAccount: { select: ACCOUNT_SELECT } }
  });
}

/**
 * Delete a community and its scraped members + conversations (leads are kept).
 * If it was joined (has a Telegram chat), flag it `pendingLeave` so the gateway
 * leaves the chat and then hard-deletes the row; otherwise delete it outright.
 * Ownership-checked (404 if missing).
 */
export async function deleteCommunity(brandId: string, id: string) {
  const owned = await prisma.community.findFirst({ where: { id, brandId } });
  if (!owned) throw new ApiError(NOT_FOUND, "COMMUNITY_NOT_FOUND", "Community not found");

  await prisma.$transaction(async (tx) => {
    // Purge the prospect/monitoring data tied to this chat (leads are kept).
    if (owned.groupChatId) {
      await tx.groupMember.deleteMany({ where: { brandId, groupChatId: owned.groupChatId } });
      await tx.conversation.deleteMany({ where: { brandId, groupChatId: owned.groupChatId } });
    }

    if (owned.groupChatId) {
      // Joined a real chat → let the gateway leave it, then hard-delete.
      await tx.community.update({ where: { id }, data: { pendingLeave: true } });
    } else {
      // Never joined a chat → nothing to leave; remove immediately.
      await tx.community.delete({ where: { id } });
    }
  });
}
