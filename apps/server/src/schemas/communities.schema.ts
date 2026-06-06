import { z } from "@hono/zod-openapi";
import { dateField } from "./common.schema.js";
import { CommunityStatusEnum } from "./enums.schema.js";

const AssignedAccountSchema = z
  .object({
    id: z.string().uuid(),
    handle: z.string(),
    displayName: z.string().nullable()
  })
  .nullable();

export const CommunitySchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    handle: z.string(),
    name: z.string(),
    nicheRelevance: z.number().int(),
    status: CommunityStatusEnum,
    source: z.string(),
    foundVia: z.string(),
    sourceUrl: z.string(),
    groupChatId: z.string(),
    assignedAccountId: z.string().uuid().nullable(),
    assignedAccount: AssignedAccountSchema,
    createdAt: dateField(),
    updatedAt: dateField()
  })
  .openapi("Community");

export const CreateCommunitySchema = z
  .object({
    handle: z.string().min(1),
    name: z.string().default(""),
    nicheRelevance: z.number().int().min(0).max(100).default(0),
    source: z.string().default("search"),
    foundVia: z.string().default("llm"),
    sourceUrl: z.string().default("")
  })
  .openapi("CreateCommunity");

export const UpdateCommunitySchema = z
  .object({
    name: z.string().optional(),
    status: CommunityStatusEnum.optional(),
    nicheRelevance: z.number().int().min(0).max(100).optional(),
    assignedAccountId: z.string().uuid().nullable().optional(),
    groupChatId: z.string().optional(),
    sourceUrl: z.string().optional()
  })
  .openapi("UpdateCommunity");

export const ListCommunitiesQuery = z.object({ status: CommunityStatusEnum.optional() });

export type CreateCommunityInput = z.infer<typeof CreateCommunitySchema>;
export type UpdateCommunityInput = z.infer<typeof UpdateCommunitySchema>;
