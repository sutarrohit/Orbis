// Shared string-union types mirroring the server's Prisma enums.
// Keep in sync with apps/server/prisma/schema.prisma.

export type Platform = "telegram" | "discord";
export type SocialAccountStatus = "active" | "paused" | "restricted";
export type LeadStatus = "new" | "prospect" | "nurturing" | "cold" | "lost" | "converted";
export type InterestLevel = "hot" | "warm" | "cool" | "skip";
export type LeadSource = "talk" | "inbound" | "outbound";
export type CommunityStatus = "pending_join" | "joined" | "rejected";
export type AgentType = "leader" | "search" | "research" | "talk" | "sales";
export type AgentRunStatus = "idle" | "running" | "error";
export type PendingSendStatus = "queued" | "sent" | "failed";
