import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Flag,
  Play,
  Search,
  Send,
  SkipForward
} from "lucide-react";

import type { Activity } from "@/lib/api/activity/activity-apis";
import type { AgentType } from "@/lib/api/enums";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";

const AGENT_BADGE_COLORS: Record<AgentType, string> = {
  leader: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  search: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
  research: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  talk: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  sales: "bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300"
};

const ACTION_CONFIG: Record<string, { icon: LucideIcon; color: string }> = {
  cycle_start: { icon: Play, color: "text-green-500" },
  set_plan: { icon: ClipboardList, color: "text-blue-500" },
  research_community: { icon: Search, color: "text-blue-500" },
  research_community_done: { icon: CheckCircle2, color: "text-green-500" },
  research_community_error: { icon: AlertTriangle, color: "text-red-500" },
  send_dm: { icon: Send, color: "text-purple-500" },
  send_dm_done: { icon: CheckCircle2, color: "text-green-500" },
  send_dm_skipped: { icon: SkipForward, color: "text-muted-foreground" },
  cycle_complete: { icon: Flag, color: "text-green-500" }
};

function getActionConfig(action: string): { icon: LucideIcon; color: string } {
  return ACTION_CONFIG[action] ?? { icon: CircleDot, color: "text-muted-foreground" };
}

/** Build a human-readable one-liner from the activity detail or action name. */
function extractDescription(item: Activity): string {
  if (item.detail) {
    const d = item.detail;
    if (typeof d.message === "string") return d.message;
    if (typeof d.summary === "string") return d.summary;
    if (typeof d.reason === "string") return d.reason;
  }
  return item.action.replace(/_/g, " ");
}

export function ActivityRow({ item }: { item: Activity }) {
  const cfg = getActionConfig(item.action);
  const Icon = cfg.icon;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40">
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{formatTime(item.ts)}</span>
      <Badge variant="secondary" className={cn("shrink-0 capitalize", AGENT_BADGE_COLORS[item.agent] ?? "")}>
        {item.agent}
      </Badge>
      <Icon className={cn("size-4 shrink-0", cfg.color)} />
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.action}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{extractDescription(item)}</span>
    </div>
  );
}
