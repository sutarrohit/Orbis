"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CrownIcon, MessageSquareIcon, NetworkIcon, SearchIcon, ShoppingCartIcon } from "lucide-react";

import type { AgentType } from "@/lib/api/enums";
import {
  runLeaderMutationOptions,
  runResearchMutationOptions,
  runSearchMutationOptions,
  schedulerKeys
} from "@/lib/api/agents/agents-queries";
import type { AgentState } from "@/lib/api/agent-state/agent-state-apis";
import {
  agentStateKeys,
  listAgentStateQueryOptions
} from "@/lib/api/agent-state/agent-state-queries";
import { StatusBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

const AGENT_META: Record<AgentType, { label: string; description: string; icon: React.ReactNode; runnable: boolean }> = {
  leader: {
    label: "Leader",
    description: "Plans & executes the full agent strategy cycle",
    icon: <CrownIcon className='size-5' />,
    runnable: true
  },
  search: {
    label: "Search",
    description: "Finds and evaluates new communities to join",
    icon: <SearchIcon className='size-5' />,
    runnable: true
  },
  talk: {
    label: "Talk",
    description: "Engages in community conversations naturally",
    icon: <MessageSquareIcon className='size-5' />,
    runnable: false
  },
  research: {
    label: "Research",
    description: "Analyzes community members to find leads",
    icon: <NetworkIcon className='size-5' />,
    runnable: true
  },
  sales: {
    label: "Sales",
    description: "Handles DM outreach & follow-ups",
    icon: <ShoppingCartIcon className='size-5' />,
    runnable: false
  }
};

const AGENT_ORDER: AgentType[] = ["leader", "search", "talk", "research", "sales"];

export function AgentControlCenter() {
  const queryClient = useQueryClient();
  const { data: agentStates } = useQuery({
    ...listAgentStateQueryOptions(),
    refetchInterval: 5000
  });
  const byType = new Map((agentStates ?? []).map((s) => [s.agentType, s]));

  // Optimistically flip an agent's status in the agent-state cache so its card
  // shows "running" (and its button disables) the instant a run is triggered —
  // the 5s poll alone is too slow to catch short runs. Reconciled with the real
  // DB state in onSettled.
  function setOptimisticStatus(agentType: AgentType, status: AgentState["status"]) {
    queryClient.setQueryData<AgentState[]>(agentStateKeys.all, (prev) => {
      const list = prev ?? [];
      const idx = list.findIndex((s) => s.agentType === agentType);
      const now = new Date().toISOString();
      if (idx === -1) {
        return [
          ...list,
          {
            id: `optimistic-${agentType}`,
            brandId: "",
            agentType,
            status,
            currentTask: "",
            startedAt: now,
            updatedAt: now
          }
        ];
      }
      const next = [...list];
      next[idx] = { ...next[idx]!, status, updatedAt: now };
      return next;
    });
  }

  function runHandlers(agentType: AgentType, startedMsg: string) {
    return {
      // Flip to running immediately; the background run keeps agent_state
      // "running" in the DB, and the 5s poll (kept alive by the always-mounted
      // header indicator) reconciles it — including across page navigation.
      // No onSettled invalidate: the request returns before the background task
      // has set the DB, so invalidating here would briefly revert to idle.
      onMutate: () => setOptimisticStatus(agentType, "running"),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: schedulerKeys.status });
        toast.success(startedMsg);
      },
      onError: (e: unknown) => {
        setOptimisticStatus(agentType, "idle");
        toast.error(e instanceof Error ? e.message : "Run failed");
      }
    };
  }

  const runSearch = useMutation({
    ...runSearchMutationOptions(),
    ...runHandlers("search", "Search run started")
  });
  const runResearch = useMutation({
    ...runResearchMutationOptions(),
    ...runHandlers("research", "Research run started")
  });
  const runLeader = useMutation({
    ...runLeaderMutationOptions(),
    ...runHandlers("leader", "Leader cycle started")
  });

  const anyRunPending = runSearch.isPending || runResearch.isPending || runLeader.isPending;

  // The Leader cycle orchestrates and spawns the other agents, so while it is
  // running no agent may be started manually. A "running" row older than 10 min
  // is treated as stale (crashed mid-cycle) so it can't lock the UI forever.
  const leaderState = byType.get("leader");
  const leaderUpdatedMs = leaderState ? Date.parse(leaderState.updatedAt) : NaN;
  const leaderRunning =
    leaderState?.status === "running" &&
    (Number.isNaN(leaderUpdatedMs) || Date.now() - leaderUpdatedMs < 10 * 60 * 1000);

  function getRunner(agentType: AgentType) {
    switch (agentType) {
      case "leader":
        return { mutation: runLeader, label: "Run Cycle" };
      case "search":
        return { mutation: runSearch, label: "Run Search" };
      case "research":
        return { mutation: runResearch, label: "Run Research" };
      default:
        return null;
    }
  }

  return (
    <div className='space-y-4'>
      <h2 className='text-lg font-semibold'>Agent Control Center</h2>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-5'>
        {AGENT_ORDER.map((agentType) => {
          const meta = AGENT_META[agentType];
          const state = byType.get(agentType);
          const status = state?.status ?? "idle";
          const runner = getRunner(agentType);
          const isRunning = status === "running";
          const lockedByLeader = leaderRunning && agentType !== "leader";

          return (
            <Card key={agentType} className='flex flex-col'>
              <CardContent className='flex flex-1 flex-col gap-3 p-4'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    {meta.icon}
                    <span className='font-semibold'>{meta.label}</span>
                  </div>
                  <StatusBadge kind='agent' value={status} />
                </div>

                <p className='flex-1 text-xs text-muted-foreground'>{meta.description}</p>

                {state?.currentTask ? (
                  <p className='text-xs italic text-muted-foreground'>{state.currentTask}</p>
                ) : null}

                {runner ? (
                  <Button
                    size='sm'
                    className='w-full'
                    onClick={() => runner.mutation.mutate({})}
                    disabled={anyRunPending || isRunning || lockedByLeader}
                  >
                    {isRunning || runner.mutation.isPending ? <Spinner className='mr-1' /> : null}
                    {lockedByLeader ? "Leader running…" : isRunning ? "Running…" : runner.label}
                  </Button>
                ) : (
                  <Button size='sm' className='w-full' disabled={true}>
                    Event-driven
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
