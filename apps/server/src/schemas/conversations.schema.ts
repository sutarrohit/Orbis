import { z } from "@hono/zod-openapi";
import { dateField, nullableDateField } from "./common.schema.js";
import { PendingSendStatusEnum, SendKindEnum } from "./enums.schema.js";

export const ConversationSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    userId: z.string(),
    username: z.string(),
    groupChatId: z.string(),
    text: z.string(),
    ts: dateField(),
    createdAt: dateField()
  })
  .openapi("Conversation");

export const PendingSendSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    leadId: z.string().uuid().nullable(),
    accountId: z.string().uuid(),
    kind: SendKindEnum,
    targetId: z.string().nullable(),
    message: z.string(),
    stage: z.number().int(),
    status: PendingSendStatusEnum,
    dedupKey: z.string(),
    createdAt: dateField(),
    sentAt: nullableDateField()
  })
  .openapi("PendingSend");

export const ListConversationsQuery = z.object({
  community_id: z.string().optional(),
  user_id: z.string().optional()
});

export const SendMessageSchema = z
  .object({
    leadId: z.string().uuid(),
    accountId: z.string().uuid(),
    message: z.string().min(1)
  })
  .openapi("SendMessage");

export type ListConversationsInput = z.infer<typeof ListConversationsQuery>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
