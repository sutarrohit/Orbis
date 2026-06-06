import { prisma } from "../lib/prisma.js";

/** Aggregate token usage for the brand over the last `days`, with a per-agent breakdown. */
export async function getUsage(brandId: string, days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const where = { brandId, ts: { gte: since } };

  const [agg, grouped] = await Promise.all([
    prisma.tokenUsage.aggregate({
      where,
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
      _count: { _all: true }
    }),
    prisma.tokenUsage.groupBy({
      by: ["agent"],
      where,
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
      _count: { _all: true }
    })
  ]);

  const totals = {
    promptTokens: agg._sum.promptTokens ?? 0,
    completionTokens: agg._sum.completionTokens ?? 0,
    totalTokens: agg._sum.totalTokens ?? 0,
    calls: agg._count._all
  };

  const byAgent = grouped.map((row) => ({
    agent: row.agent,
    promptTokens: row._sum.promptTokens ?? 0,
    completionTokens: row._sum.completionTokens ?? 0,
    totalTokens: row._sum.totalTokens ?? 0,
    calls: row._count._all
  }));

  return { days, totals, byAgent };
}
