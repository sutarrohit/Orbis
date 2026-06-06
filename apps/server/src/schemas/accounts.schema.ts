import { z } from "@hono/zod-openapi";
import { dateField, nullableDateField } from "./common.schema.js";
import { PlatformEnum, SocialAccountStatusEnum } from "./enums.schema.js";

// The MTProto `sessionString` is a full-access credential — never serialized.
export const AccountSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    platform: PlatformEnum,
    externalId: z.string(),
    handle: z.string(),
    phone: z.string().nullable(),
    displayName: z.string().nullable(),
    status: SocialAccountStatusEnum,
    lastHealthCheckAt: nullableDateField(),
    createdAt: dateField(),
    updatedAt: dateField(),
    communityCounts: z.object({
      total: z.number().int(),
      joined: z.number().int(),
      pending: z.number().int()
    })
  })
  .openapi("Account");

export const UpdateAccountSchema = z
  .object({
    displayName: z.string().nullable().optional(),
    status: SocialAccountStatusEnum.optional()
  })
  .openapi("UpdateAccount");

export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;
