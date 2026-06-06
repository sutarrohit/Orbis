import { CONFLICT, NOT_FOUND } from "stoker/http-status-codes";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import type { CreateBrandInput, UpdateBrandInput } from "../schemas/brand.schema.js";

/** The session user's brand (with its sales profile), or null if none yet. */
export function getBrandForUser(userId: string) {
  return prisma.brand.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
    include: { profile: true }
  });
}

/** Create the user's brand plus an empty sales profile. 409 if one exists. */
export async function createBrandForUser(userId: string, data: CreateBrandInput) {
  const existing = await prisma.brand.findFirst({ where: { ownerId: userId } });
  if (existing) {
    throw new ApiError(CONFLICT, "BRAND_EXISTS", "A brand already exists for this user");
  }

  return prisma.brand.create({
    data: {
      ownerId: userId,
      name: data.name,
      niche: data.niche,
      slug: data.slug,
      profile: { create: {} }
    },
    include: { profile: true }
  });
}

/** Update the user's brand and (any subset of) its sales profile. 404 if none. */
export async function updateBrandForUser(userId: string, data: UpdateBrandInput) {
  const existing = await prisma.brand.findFirst({ where: { ownerId: userId } });
  if (!existing) {
    throw new ApiError(NOT_FOUND, "BRAND_NOT_FOUND", "No brand found for this user");
  }

  const { persona, productSummary, pricing, conversionAction, objectionNotes, ...brandFields } = data;
  const profileFields = { persona, productSummary, pricing, conversionAction, objectionNotes };
  const hasProfileUpdate = Object.values(profileFields).some((v) => v !== undefined);

  return prisma.brand.update({
    where: { id: existing.id },
    data: {
      ...brandFields,
      ...(hasProfileUpdate
        ? { profile: { upsert: { create: profileFields, update: profileFields } } }
        : {})
    },
    include: { profile: true }
  });
}
