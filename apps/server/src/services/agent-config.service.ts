import { prisma } from "../lib/prisma.js";
import type { UpsertAgentConfigInput } from "../schemas/agent-config.schema.js";

/** All of the brand's per-agent configs. */
export function listAgentConfigs(brandId: string) {
  return prisma.agentConfig.findMany({
    where: { brandId },
    orderBy: { agentType: "asc" }
  });
}

/** Create or update the config for one (brand, agentType). */
export function upsertAgentConfig(brandId: string, data: UpsertAgentConfigInput) {
  const { agentType, ...fields } = data;
  return prisma.agentConfig.upsert({
    where: { brandId_agentType: { brandId, agentType } },
    create: {
      brandId,
      agentType,
      enabled: fields.enabled ?? true,
      voiceTags: fields.voiceTags ?? [],
      behaviorRules: fields.behaviorRules ?? [],
      bannedTopics: fields.bannedTopics ?? [],
      systemPrompt: fields.systemPrompt ?? ""
    },
    // undefined fields are ignored by Prisma, so only provided values change.
    update: fields
  });
}
