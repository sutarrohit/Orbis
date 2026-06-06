import { z } from "@hono/zod-openapi";
import { dateField } from "./common.schema.js";
import { AgentTypeEnum } from "./enums.schema.js";

export const ActivitySchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    agent: AgentTypeEnum,
    action: z.string(),
    detail: z.unknown().nullable(),
    dedupKey: z.string().nullable(),
    accountId: z.string().nullable(),
    ts: dateField()
  })
  .openapi("Activity");

export const ListActivityQuery = z.object({
  since: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  agent: AgentTypeEnum.optional(),
  action: z.string().optional()
});

export type ListActivityInput = z.infer<typeof ListActivityQuery>;
