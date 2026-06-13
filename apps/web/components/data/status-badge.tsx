import { Badge } from "@/components/ui/badge";
import type {
  AgentRunStatus,
  CommunityStatus,
  InterestLevel,
  LeadStatus,
  PendingSendStatus,
  Platform,
  SocialAccountStatus
} from "@/lib/api/enums";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];
type Entry = { label: string; variant: BadgeVariant };

const LEAD: Record<LeadStatus, Entry> = {
  new: { label: "New", variant: "default" },
  prospect: { label: "Prospect", variant: "secondary" },
  nurturing: { label: "Nurturing", variant: "secondary" },
  cold: { label: "Cold", variant: "outline" },
  lost: { label: "Lost", variant: "destructive" },
  converted: { label: "Converted", variant: "default" }
};

const INTEREST: Record<InterestLevel, Entry> = {
  hot: { label: "Hot", variant: "destructive" },
  warm: { label: "Warm", variant: "secondary" },
  cool: { label: "Cool", variant: "outline" },
  skip: { label: "Skip", variant: "ghost" }
};

const COMMUNITY: Record<CommunityStatus, Entry> = {
  pending_join: { label: "Pending", variant: "secondary" },
  joined: { label: "Joined", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" }
};

const ACCOUNT: Record<SocialAccountStatus, Entry> = {
  active: { label: "Active", variant: "default" },
  paused: { label: "Paused", variant: "secondary" },
  restricted: { label: "Restricted", variant: "destructive" }
};

const AGENT: Record<AgentRunStatus, Entry> = {
  idle: { label: "Idle", variant: "outline" },
  running: { label: "Running", variant: "default" },
  error: { label: "Error", variant: "destructive" }
};

const SEND: Record<PendingSendStatus, Entry> = {
  queued: { label: "Queued", variant: "secondary" },
  sent: { label: "Sent", variant: "default" },
  failed: { label: "Failed", variant: "destructive" }
};

const PLATFORM: Record<Platform, Entry> = {
  telegram: { label: "Telegram", variant: "secondary" },
  discord: { label: "Discord", variant: "secondary" }
};

const MAPS = {
  lead: LEAD,
  interest: INTEREST,
  community: COMMUNITY,
  account: ACCOUNT,
  agent: AGENT,
  send: SEND,
  platform: PLATFORM
} as const;

type Kind = keyof typeof MAPS;

/** Renders a shadcn Badge for a known domain status, mapping it to a default variant. */
export function StatusBadge({ kind, value }: { kind: Kind; value: string }) {
  const entry = (MAPS[kind] as Record<string, Entry>)[value];
  if (!entry) return <Badge variant='outline'>{value}</Badge>;
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}
