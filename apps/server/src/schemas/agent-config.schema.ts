import { z } from "@hono/zod-openapi";
import { dateField } from "./common.schema.js";
import { AgentTypeEnum } from "./enums.schema.js";

export const AgentConfigSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    agentType: AgentTypeEnum,
    enabled: z.boolean(),
    voiceTags: z.array(z.string()),
    behaviorRules: z.array(z.string()),
    bannedTopics: z.array(z.string()),
    systemPrompt: z.string(),
    createdAt: dateField(),
    updatedAt: dateField()
  })
  .openapi("AgentConfig");

export const UpsertAgentConfigSchema = z
  .object({
    agentType: AgentTypeEnum,
    enabled: z.boolean().optional(),
    voiceTags: z.array(z.string()).optional(),
    behaviorRules: z.array(z.string()).optional(),
    bannedTopics: z.array(z.string()).optional(),
    systemPrompt: z.string().optional()
  })
  .openapi("UpsertAgentConfig");

export type UpsertAgentConfigInput = z.infer<typeof UpsertAgentConfigSchema>;
