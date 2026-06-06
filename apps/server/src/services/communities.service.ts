import { CONFLICT, NOT_FOUND } from "stoker/http-status-codes";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import type { CommunityStatus } from "../../prisma/generated/enums.js";
import type { CreateCommunityInput, UpdateCommunityInput } from "../schemas/communities.schema.js";

const ACCOUNT_SELECT = { id: true, handle: true, displayName: true } as const;

/** The brand's communities (optionally filtered by status), newest first. */
export function listCommunities(brandId: string, status?: CommunityStatus) {
  return prisma.community.findMany({
    where: { brandId, ...(status ? { status } : {}) },
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

  // Assigning an account: make sure it belongs to this brand.
  if (data.assignedAccountId) {
    const account = await prisma.socialAccount.findFirst({
      where: { id: data.assignedAccountId, brandId }
    });
    if (!account) throw new ApiError(NOT_FOUND, "ACCOUNT_NOT_FOUND", "Assigned account not found");
  }

  return prisma.community.update({
    where: { id },
    data,
    include: { assignedAccount: { select: ACCOUNT_SELECT } }
  });
}
