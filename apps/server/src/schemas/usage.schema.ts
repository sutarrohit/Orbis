import { z } from "@hono/zod-openapi";
import { AgentTypeEnum } from "./enums.schema.js";

const TotalsSchema = z.object({
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  totalTokens: z.number().int(),
  calls: z.number().int()
});

const AgentUsageSchema = TotalsSchema.extend({ agent: AgentTypeEnum });

export const UsageSchema = z
  .object({
    days: z.number().int(),
    totals: TotalsSchema,
    byAgent: z.array(AgentUsageSchema)
  })
  .openapi("Usage");

export const UsageQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30)
});
