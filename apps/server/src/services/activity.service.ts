import { prisma } from "../lib/prisma.js";
import type { ListActivityInput } from "../schemas/activity.schema.js";

const SECRET_KEY = /key|token|secret|password|authorization|api[-_]?key/i;

/** Recursively mask secret-looking values in an activity detail payload. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return value;
}

/** Recent activity for the brand, newest first, with secrets redacted. */
export async function listActivity(brandId: string, query: ListActivityInput) {
  const rows = await prisma.agentActivity.findMany({
    where: {
      brandId,
      ...(query.since ? { ts: { gt: query.since } } : {}),
      ...(query.agent ? { agent: query.agent } : {}),
      ...(query.action ? { action: query.action } : {})
    },
    orderBy: { ts: "desc" },
    take: query.limit
  });

  return rows.map((row) => ({ ...row, detail: redact(row.detail) }));
}
