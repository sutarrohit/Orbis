import { prisma } from "../lib/prisma.js";

/** The brand's strategy learnings, newest first. */
export function listLearnings(brandId: string) {
  return prisma.learning.findMany({ where: { brandId }, orderBy: { createdAt: "desc" } });
}
