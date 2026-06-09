"use client";

import { useQuery } from "@tanstack/react-query";

import type { AgentState } from "@/lib/api/agent-state/agent-state-apis";
import { listAgentStateQueryOptions } from "@/lib/api/agent-state/agent-state-queries";
import type { AgentType } from "@/lib/api/enums";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const AGENT_LABELS: Record<AgentType, string> = {
  leader: "Leader",
  search: "Search",
  talk: "Talk",
  research: "Research",
  sales: "Sales",
};

// A "running" row whose updatedAt is older than this is treated as stalled
// (the agent process likely died before it could flip back to idle).
const STALE_MS = 10 * 60 * 1000;

function isFreshlyRunning(s: AgentState): boolean {
  if (s.status !== "running") return false;
  const ts = Date.parse(s.updatedAt);
  if (Number.isNaN(ts)) return true; // no reliable timestamp → trust the status
  return Date.now() - ts < STALE_MS;
}

/**
 * Always-visible (header) indicator of how many of the current brand's agents
 * are running, with a tooltip listing which. State is DB-backed and polled, so
 * it survives navigation and full reloads — closing and reopening shows the
 * real current state.
 */
export function RunningAgentsIndicator() {
  const { data: states } = useQuery({
    ...listAgentStateQueryOptions(),
    refetchInterval: 5000,
  });

  const running = (states ?? []).filter(isFreshlyRunning);
  if (running.length === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="cursor-default gap-1.5">
            <Spinner className="size-3" />
            {running.length} running
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex-col items-start gap-1">
          {running.map((s) => (
            <span key={s.agentType}>
              {AGENT_LABELS[s.agentType]}
              {s.currentTask ? ` — ${s.currentTask}` : ""}
            </span>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
