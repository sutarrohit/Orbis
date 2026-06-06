import { prisma } from "../lib/prisma.js";

/** Run state of each of the brand's agents. */
export function listAgentStates(brandId: string) {
  return prisma.agentState.findMany({ where: { brandId }, orderBy: { agentType: "asc" } });
}
