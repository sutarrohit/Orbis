import { NOT_FOUND } from "stoker/http-status-codes";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import type { UpdateAccountInput } from "../schemas/accounts.schema.js";

// The sessionString is a full-access credential — never even fetch it.
const SAFE_OMIT = { sessionString: true } as const;

/** Count one account's communities by join state. */
async function communityCounts(brandId: string, accountId: string) {
  const [total, joined, pending] = await Promise.all([
    prisma.community.count({ where: { brandId, assignedAccountId: accountId } }),
    prisma.community.count({ where: { brandId, assignedAccountId: accountId, status: "joined" } }),
    prisma.community.count({ where: { brandId, assignedAccountId: accountId, status: "pending_join" } })
  ]);
  return { total, joined, pending };
}

/** Shape one SocialAccount row (with community counts) for the API. */
async function presentAccount(brandId: string, accountId: string) {
  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, brandId },
    omit: SAFE_OMIT
  });
  if (!account) return null;
  return { ...account, communityCounts: await communityCounts(brandId, accountId) };
}

/** All of the brand's accounts, each enriched with community counts. */
export async function listAccounts(brandId: string) {
  const accounts = await prisma.socialAccount.findMany({
    where: { brandId },
    orderBy: { createdAt: "desc" },
    omit: SAFE_OMIT
  });
  return Promise.all(
    accounts.map(async (account) => ({
      ...account,
      communityCounts: await communityCounts(brandId, account.id)
    }))
  );
}

/** Update an account's display name / status (ownership-checked). 404 if missing. */
export async function updateAccount(brandId: string, id: string, data: UpdateAccountInput) {
  const owned = await prisma.socialAccount.findFirst({ where: { id, brandId } });
  if (!owned) throw new ApiError(NOT_FOUND, "ACCOUNT_NOT_FOUND", "Account not found");

  await prisma.socialAccount.update({ where: { id }, data });
  // Non-null: we just confirmed (and didn't delete) the row.
  return (await presentAccount(brandId, id))!;
}

/** Delete an account (ownership-checked). 404 if missing. */
export async function deleteAccount(brandId: string, id: string) {
  const owned = await prisma.socialAccount.findFirst({ where: { id, brandId } });
  if (!owned) throw new ApiError(NOT_FOUND, "ACCOUNT_NOT_FOUND", "Account not found");
  await prisma.socialAccount.delete({ where: { id } });
}
