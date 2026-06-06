import { z } from "@hono/zod-openapi";
import { dateField } from "./common.schema.js";

export const GroupMemberSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    userId: z.string(),
    username: z.string(),
    groupChatId: z.string(),
    bio: z.string(),
    activityNote: z.string(),
    createdAt: dateField(),
    updatedAt: dateField()
  })
  .openapi("GroupMember");

export const ListGroupMembersQuery = z.object({ chatId: z.string().optional() });

export const ListGroupMembersResponseSchema = z.object({
  data: z.array(GroupMemberSchema),
  total: z.number().int()
});
