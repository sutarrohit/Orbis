import { request } from "@/utils/request";
import type { InterestLevel, LeadSource, LeadStatus } from "@/lib/api/enums";

/** A lead as returned by `GET /leads`. */
export interface Lead {
  id: string;
  brandId: string;
  userId: string;
  username: string;
  score: number;
  interestLevel: InterestLevel;
  status: LeadStatus;
  source: LeadSource;
  note: string;
  painPoints: string[];
  recommendedApproach: string;
  sourceGroupChatId: string;
  outreachStage: number;
  lastOutreachAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A message attached to a lead in its detail view. */
export interface LeadConversation {
  id: string;
  username: string;
  groupChatId: string;
  text: string;
  ts: string;
}

export type LeadWithConversations = Lead & { conversations: LeadConversation[] };

export interface ListLeadsParams {
  status?: LeadStatus;
}

export interface ListLeadsResult {
  data: Lead[];
  counts: Record<LeadStatus, number>;
}

export interface UpdateLeadInput {
  status?: LeadStatus;
  score?: number;
  interestLevel?: InterestLevel;
  note?: string;
  recommendedApproach?: string;
  outreachStage?: number;
}

export function listLeads(params: ListLeadsParams = {}): Promise<ListLeadsResult> {
  const qs = params.status ? `?status=${params.status}` : "";
  return request(`/leads${qs}`);
}

export function getLead(id: string): Promise<LeadWithConversations> {
  return request(`/leads/${id}`);
}

export function updateLead(id: string, input: UpdateLeadInput): Promise<Lead> {
  return request(`/leads/${id}`, { method: "PUT", body: JSON.stringify(input) });
}
