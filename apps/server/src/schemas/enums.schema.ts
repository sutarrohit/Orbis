import { z } from "@hono/zod-openapi";

// Zod mirrors of the Prisma enums (schema.prisma). Kept as explicit literal
// tuples so the values are visible here and render cleanly in the OpenAPI doc.

export const PlatformEnum = z.enum(["telegram", "discord"]);
export const SocialAccountStatusEnum = z.enum(["active", "paused", "restricted"]);
export const LeadStatusEnum = z.enum(["new", "prospect", "nurturing", "cold", "lost", "converted"]);
export const LeadSourceEnum = z.enum(["talk", "inbound", "outbound"]);
export const InterestLevelEnum = z.enum(["hot", "warm", "cool", "skip"]);
export const CommunityStatusEnum = z.enum(["pending_join", "joined", "rejected"]);
export const AgentTypeEnum = z.enum(["leader", "search", "research", "talk", "sales"]);
export const AgentRunStatusEnum = z.enum(["idle", "running", "error"]);
export const PendingSendStatusEnum = z.enum(["queued", "sent", "failed"]);
