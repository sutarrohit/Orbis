import { z } from "@hono/zod-openapi";
import { dateField, nullableDateField } from "./common.schema.js";
import { InterestLevelEnum, LeadSourceEnum, LeadStatusEnum, PlatformEnum } from "./enums.schema.js";

export const LeadSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    platform: PlatformEnum,
    userId: z.string(),
    username: z.string(),
    score: z.number().int(),
    interestLevel: InterestLevelEnum,
    status: LeadStatusEnum,
    source: LeadSourceEnum,
    note: z.string(),
    painPoints: z.array(z.string()),
    recommendedApproach: z.string(),
    sourceGroupChatId: z.string(),
    outreachStage: z.number().int(),
    lastOutreachAt: nullableDateField(),
    createdAt: dateField(),
    updatedAt: dateField()
  })
  .openapi("Lead");

const ConversationSummarySchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  groupChatId: z.string(),
  text: z.string(),
  ts: dateField()
});

export const LeadWithConversationsSchema = LeadSchema.extend({
  conversations: z.array(ConversationSummarySchema)
}).openapi("LeadDetail");

export const StatusCountsSchema = z.object({
  new: z.number().int(),
  prospect: z.number().int(),
  nurturing: z.number().int(),
  cold: z.number().int(),
  lost: z.number().int(),
  converted: z.number().int()
});

export const ListLeadsResponseSchema = z.object({
  data: z.array(LeadSchema),
  counts: StatusCountsSchema
});

export const ListLeadsQuery = z.object({ status: LeadStatusEnum.optional() });

export const UpdateLeadSchema = z
  .object({
    status: LeadStatusEnum.optional(),
    score: z.number().int().min(0).max(100).optional(),
    interestLevel: InterestLevelEnum.optional(),
    note: z.string().optional(),
    recommendedApproach: z.string().optional(),
    outreachStage: z.number().int().min(0).optional()
  })
  .openapi("UpdateLead");

export type UpdateLeadInput = z.infer<typeof UpdateLeadSchema>;
