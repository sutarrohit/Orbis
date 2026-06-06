import { NOT_FOUND } from "stoker/http-status-codes";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import type { LeadStatus } from "../../prisma/generated/enums.js";
import type { UpdateLeadInput } from "../schemas/leads.schema.js";

const EMPTY_COUNTS = { new: 0, prospect: 0, nurturing: 0, cold: 0, lost: 0, converted: 0 };

/** The brand's leads (optionally filtered) plus aggregate counts by status. */
export async function listLeads(brandId: string, status?: LeadStatus) {
  const [data, grouped] = await Promise.all([
    prisma.lead.findMany({
      where: { brandId, ...(status ? { status } : {}) },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.lead.groupBy({ by: ["status"], where: { brandId }, _count: { _all: true } })
  ]);

  const counts = { ...EMPTY_COUNTS };
  for (const row of grouped) {
    counts[row.status] = row._count._all;
  }

  return { data, counts };
}

/** One lead with its recent conversations (linked by userId). 404 if missing. */
export async function getLead(brandId: string, id: string) {
  const lead = await prisma.lead.findFirst({ where: { id, brandId } });
  if (!lead) throw new ApiError(NOT_FOUND, "LEAD_NOT_FOUND", "Lead not found");

  const conversations = await prisma.conversation.findMany({
    where: { brandId, userId: lead.userId },
    orderBy: { ts: "desc" },
    take: 50,
    select: { id: true, username: true, groupChatId: true, text: true, ts: true }
  });

  return { ...lead, conversations };
}

/** Update a lead (ownership-checked). 404 if missing. */
export async function updateLead(brandId: string, id: string, data: UpdateLeadInput) {
  const owned = await prisma.lead.findFirst({ where: { id, brandId } });
  if (!owned) throw new ApiError(NOT_FOUND, "LEAD_NOT_FOUND", "Lead not found");
  return prisma.lead.update({ where: { id }, data });
}
