import { prisma } from "../lib/prisma.js";
import type { UpsertAgentConfigInput } from "../schemas/agent-config.schema.js";

/** All of the brand's per-agent configs. */
export function listAgentConfigs(brandId: string) {
  return prisma.agentConfig.findMany({
    where: { brandId },
    orderBy: { agentType: "asc" },
  });
}

/** Create or update the config for one (brand, agentType). */
export function upsertAgentConfig(
  brandId: string,
  data: UpsertAgentConfigInput,
) {
  const { agentType, ...fields } = data;
  return prisma.agentConfig.upsert({
    where: { brandId_agentType: { brandId, agentType } },
    create: {
      brandId,
      agentType,
      enabled: fields.enabled ?? true,
      personaName: fields.personaName ?? "",
      responseStyle: fields.responseStyle ?? "",
      personaDescription: fields.personaDescription ?? "",
      voiceTags: fields.voiceTags ?? [],
      voiceDescription: fields.voiceDescription ?? "",
      behaviorRules: fields.behaviorRules ?? [],
      bannedTopics: fields.bannedTopics ?? [],
      systemPrompt: fields.systemPrompt ?? "",
      knowledgeBase: fields.knowledgeBase ?? "",
      maxResponseLength: fields.maxResponseLength ?? 0,
    },
    // undefined fields are ignored by Prisma, so only provided values change.
    update: fields,
  });
}
