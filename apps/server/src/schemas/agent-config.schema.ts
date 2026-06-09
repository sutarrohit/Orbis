import { z } from "@hono/zod-openapi";
import { dateField } from "./common.schema.js";
import { AgentTypeEnum } from "./enums.schema.js";

export const AgentConfigSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    agentType: AgentTypeEnum,
    enabled: z.boolean(),
    personaName: z.string(),
    responseStyle: z.string(),
    personaDescription: z.string(),
    voiceTags: z.array(z.string()),
    voiceDescription: z.string(),
    behaviorRules: z.array(z.string()),
    bannedTopics: z.array(z.string()),
    systemPrompt: z.string(),
    knowledgeBase: z.string(),
    maxResponseLength: z.number().int(),
    searchQueries: z.array(z.string()),
    createdAt: dateField(),
    updatedAt: dateField(),
  })
  .openapi("AgentConfig");

export const UpsertAgentConfigSchema = z
  .object({
    agentType: AgentTypeEnum,
    enabled: z.boolean().optional(),
    personaName: z.string().optional(),
    responseStyle: z.string().optional(),
    personaDescription: z.string().optional(),
    voiceTags: z.array(z.string()).optional(),
    voiceDescription: z.string().optional(),
    behaviorRules: z.array(z.string()).optional(),
    bannedTopics: z.array(z.string()).optional(),
    systemPrompt: z.string().optional(),
    knowledgeBase: z.string().optional(),
    maxResponseLength: z.number().int().optional(),
    searchQueries: z.array(z.string()).optional(),
  })
  .openapi("UpsertAgentConfig");

export type UpsertAgentConfigInput = z.infer<typeof UpsertAgentConfigSchema>;
