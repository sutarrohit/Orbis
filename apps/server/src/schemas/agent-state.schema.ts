import { z } from "@hono/zod-openapi";
import { dateField, nullableDateField } from "./common.schema.js";
import { AgentRunStatusEnum, AgentTypeEnum } from "./enums.schema.js";

export const AgentStateSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    agentType: AgentTypeEnum,
    status: AgentRunStatusEnum,
    currentTask: z.string(),
    startedAt: nullableDateField(),
    updatedAt: dateField()
  })
  .openapi("AgentState");
